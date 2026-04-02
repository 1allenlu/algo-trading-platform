#!/usr/bin/env python3
"""
Historical market data loader — yfinance → TimescaleDB.

Downloads daily OHLCV data from Yahoo Finance and upserts it into
the market_data TimescaleDB hypertable.

Usage:
    # Default: 10 symbols, 5 years of data
    python data/ingestion/yfinance_loader.py

    # Custom symbols and date range
    python data/ingestion/yfinance_loader.py --symbols SPY QQQ AAPL --years 3

    # Custom database URL
    python data/ingestion/yfinance_loader.py \
        --database-url postgresql://trading:trading@localhost:5432/trading_db

Via Docker (recommended):
    make ingest
    # or: docker compose exec backend python /data/ingestion/yfinance_loader.py

Design notes:
    - Uses asyncpg directly (not SQLAlchemy) for bulk inserts — much faster
    - ON CONFLICT DO UPDATE: idempotent — safe to re-run, updates stale data
    - Downloads symbols sequentially to avoid Yahoo Finance rate limits
    - asyncpg URL format: postgresql:// (not postgresql+asyncpg://)
"""

import argparse
import asyncio
import os
import sys
from datetime import datetime, timedelta

import asyncpg
import pandas as pd
import yfinance as yf

# ── Default universe ──────────────────────────────────────────────────────────
# Broad market ETFs + mega-cap stocks for a diverse initial dataset
DEFAULT_SYMBOLS: list[str] = [
    "SPY",   # S&P 500 ETF — benchmark
    "QQQ",   # Nasdaq-100 ETF
    "IWM",   # Russell 2000 (small-cap)
    "AAPL",  # Apple
    "MSFT",  # Microsoft
    "GOOGL", # Alphabet
    "AMZN",  # Amazon
    "TSLA",  # Tesla
    "NVDA",  # Nvidia
    "META",  # Meta
]

# ── Logging helpers (no external deps) ────────────────────────────────────────
def log(msg: str, level: str = "INFO") -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"{ts} | {level:8s} | {msg}", flush=True)

def log_ok(msg: str)   -> None: log(f"✓ {msg}", "OK")
def log_warn(msg: str) -> None: log(f"⚠ {msg}", "WARN")
def log_err(msg: str)  -> None: log(f"✗ {msg}", "ERROR")


# ── Schema setup ──────────────────────────────────────────────────────────────
ENSURE_SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

CREATE TABLE IF NOT EXISTS market_data (
    symbol      VARCHAR(20)              NOT NULL,
    timestamp   TIMESTAMPTZ              NOT NULL,
    open        DOUBLE PRECISION         NOT NULL,
    high        DOUBLE PRECISION         NOT NULL,
    low         DOUBLE PRECISION         NOT NULL,
    close       DOUBLE PRECISION         NOT NULL,
    volume      BIGINT                   NOT NULL,
    PRIMARY KEY (symbol, timestamp)
);

SELECT create_hypertable(
    'market_data', 'timestamp',
    chunk_time_interval => INTERVAL '1 month',
    if_not_exists       => TRUE,
    migrate_data        => TRUE
);

CREATE INDEX IF NOT EXISTS ix_market_data_symbol_ts
    ON market_data (symbol, timestamp DESC);
"""

UPSERT_SQL = """
INSERT INTO market_data (symbol, timestamp, open, high, low, close, volume)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (symbol, timestamp) DO UPDATE SET
    open   = EXCLUDED.open,
    high   = EXCLUDED.high,
    low    = EXCLUDED.low,
    close  = EXCLUDED.close,
    volume = EXCLUDED.volume
"""


# ── Download ──────────────────────────────────────────────────────────────────
def download_symbol(symbol: str, years: int) -> pd.DataFrame:
    """
    Download daily OHLCV bars from Yahoo Finance.

    yfinance returns adjusted prices (auto_adjust=True), so splits and
    dividends are already factored into the price series. This is what
    you want for backtesting — raw prices would skew returns at split dates.
    """
    end   = datetime.now()
    start = end - timedelta(days=years * 365)

    log(f"Downloading {symbol}: {start.date()} → {end.date()}")

    ticker = yf.Ticker(symbol)
    df = ticker.history(
        start=start.strftime("%Y-%m-%d"),
        end=end.strftime("%Y-%m-%d"),
        interval="1d",
        auto_adjust=True,   # Split/dividend adjusted prices
        prepost=False,       # Regular trading hours only
    )

    if df.empty:
        log_warn(f"No data returned for {symbol}")
        return pd.DataFrame()

    # Normalize column names
    df = df.rename(columns={
        "Open": "open", "High": "high", "Low": "low",
        "Close": "close", "Volume": "volume",
    })
    df = df[["open", "high", "low", "close", "volume"]].copy()
    df["symbol"] = symbol
    df.index.name = "timestamp"
    df = df.reset_index()

    # Ensure all timestamps are UTC-aware (TimescaleDB requires TIMESTAMPTZ)
    if df["timestamp"].dt.tz is None:
        df["timestamp"] = df["timestamp"].dt.tz_localize("UTC")
    else:
        df["timestamp"] = df["timestamp"].dt.tz_convert("UTC")

    # Drop rows with NaN prices (can occur on early data)
    df = df.dropna(subset=["open", "high", "low", "close"])

    log(f"  → {len(df)} bars downloaded for {symbol}")
    return df


# ── Upsert ────────────────────────────────────────────────────────────────────
async def upsert_dataframe(conn: asyncpg.Connection, df: pd.DataFrame) -> int:
    """
    Batch-upsert a DataFrame into market_data.

    executemany() sends all rows in a single round-trip, which is much faster
    than calling execute() in a loop. For 1000+ rows, this is critical.
    """
    if df.empty:
        return 0

    records = [
        (
            str(row["symbol"]),
            row["timestamp"].to_pydatetime(),
            float(row["open"]),
            float(row["high"]),
            float(row["low"]),
            float(row["close"]),
            int(row["volume"]),
        )
        for _, row in df.iterrows()
    ]

    await conn.executemany(UPSERT_SQL, records)
    return len(records)


# ── Main ──────────────────────────────────────────────────────────────────────
async def run_ingestion(
    symbols: list[str],
    years: int,
    database_url: str,
) -> None:
    # asyncpg uses postgresql:// (no +asyncpg suffix)
    pg_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

    log(f"Connecting to {pg_url.split('@')[-1]}...")  # Log host, not credentials
    conn = await asyncpg.connect(pg_url)

    try:
        # Ensure schema exists (idempotent)
        log("Verifying database schema...")
        await conn.execute(ENSURE_SCHEMA_SQL)
        log_ok("Schema ready")

        total_rows = 0
        failed: list[str] = []

        for symbol in symbols:
            try:
                df = download_symbol(symbol, years)
                if not df.empty:
                    rows = await upsert_dataframe(conn, df)
                    total_rows += rows
                    log_ok(f"{symbol}: {rows:,} rows upserted")
            except Exception as exc:
                log_err(f"{symbol}: {exc}")
                failed.append(symbol)

        # ── Summary ───────────────────────────────────────────────────────────
        print()
        log(f"{'─' * 50}")
        log(f"Ingestion complete: {total_rows:,} rows across {len(symbols) - len(failed)} symbols")

        if failed:
            log_warn(f"Failed symbols: {', '.join(failed)}")

        # Show table summary
        rows = await conn.fetch(
            """
            SELECT symbol,
                   COUNT(*)        AS bars,
                   MIN(timestamp)  AS first,
                   MAX(timestamp)  AS last
            FROM market_data
            GROUP BY symbol
            ORDER BY symbol
            """
        )
        print()
        log("Database summary:")
        log(f"  {'Symbol':<8} {'Bars':>6}  {'From':<12}  {'To':<12}")
        log(f"  {'─' * 45}")
        for r in rows:
            log(f"  {r['symbol']:<8} {r['bars']:>6}  {r['first'].date()!s:<12}  {r['last'].date()!s:<12}")

    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download historical OHLCV data → TimescaleDB",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--symbols", nargs="+", default=DEFAULT_SYMBOLS,
        help="Ticker symbols to download",
    )
    parser.add_argument(
        "--years", type=int, default=5,
        help="Years of historical data",
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv(
            "DATABASE_URL",
            "postgresql://trading:trading@localhost:5432/trading_db",
        ).replace("postgresql+asyncpg://", "postgresql://"),
        help="PostgreSQL connection URL",
    )

    args = parser.parse_args()

    print()
    log(f"QuantStream — Data Ingestion")
    log(f"Symbols : {', '.join(args.symbols)}")
    log(f"History : {args.years} years")
    print()

    asyncio.run(run_ingestion(args.symbols, args.years, args.database_url))


if __name__ == "__main__":
    main()

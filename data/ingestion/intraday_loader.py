#!/usr/bin/env python3
"""
Intraday market data loader — yfinance → TimescaleDB intraday_data table.

Downloads sub-daily OHLCV bars and upserts them into intraday_data.

yfinance interval limits:
  1m  — last 7 calendar days only
  5m  — last 60 calendar days
  15m — last 60 calendar days
  1h  — last 730 calendar days

Usage:
    python data/ingestion/intraday_loader.py --symbol SPY --timeframe 5m
    python data/ingestion/intraday_loader.py --symbol BTC-USD --timeframe 1h

Via Docker:
    make ingest-intraday symbol=SPY timeframe=5m
"""

import argparse
import asyncio
import os
import sys
from datetime import datetime, timedelta

import asyncpg
import pandas as pd
import yfinance as yf

# ── Timeframe → yfinance period mapping ───────────────────────────────────────
# yfinance caps the available history per interval; enforce limits strictly.
TIMEFRAME_CONFIG: dict[str, dict] = {
    "1m":  {"interval": "1m",  "days": 7},
    "5m":  {"interval": "5m",  "days": 60},
    "15m": {"interval": "15m", "days": 60},
    "1h":  {"interval": "1h",  "days": 730},
}

ENSURE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS intraday_data (
    symbol      VARCHAR(20)      NOT NULL,
    timestamp   TIMESTAMPTZ      NOT NULL,
    timeframe   VARCHAR(5)       NOT NULL,
    open        DOUBLE PRECISION NOT NULL,
    high        DOUBLE PRECISION NOT NULL,
    low         DOUBLE PRECISION NOT NULL,
    close       DOUBLE PRECISION NOT NULL,
    volume      BIGINT           NOT NULL,
    PRIMARY KEY (symbol, timestamp, timeframe)
);
"""

UPSERT_SQL = """
INSERT INTO intraday_data (symbol, timestamp, timeframe, open, high, low, close, volume)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (symbol, timestamp, timeframe) DO NOTHING
"""


def log(msg: str, level: str = "INFO") -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"{ts} | {level:8s} | {msg}", flush=True)


def download_intraday(symbol: str, timeframe: str) -> pd.DataFrame:
    cfg   = TIMEFRAME_CONFIG[timeframe]
    end   = datetime.now()
    start = end - timedelta(days=cfg["days"])

    log(f"Downloading {symbol} @ {timeframe}: {start.date()} → {end.date()}")

    ticker = yf.Ticker(symbol.upper())
    df = ticker.history(
        start=start.strftime("%Y-%m-%d"),
        end=end.strftime("%Y-%m-%d"),
        interval=cfg["interval"],
        auto_adjust=True,
        prepost=False,
    )

    if df.empty:
        log(f"No data returned for {symbol} @ {timeframe}", "WARN")
        return pd.DataFrame()

    df = df.rename(columns={
        "Open": "open", "High": "high", "Low": "low",
        "Close": "close", "Volume": "volume",
    })
    df = df[["open", "high", "low", "close", "volume"]].copy()
    df["symbol"]    = symbol.upper()
    df["timeframe"] = timeframe
    df.index.name   = "timestamp"
    df = df.reset_index()

    # Ensure UTC-aware timestamps
    if df["timestamp"].dt.tz is None:
        df["timestamp"] = df["timestamp"].dt.tz_localize("UTC")
    else:
        df["timestamp"] = df["timestamp"].dt.tz_convert("UTC")

    # Drop NaN rows + fill missing volume with 0
    df = df.dropna(subset=["open", "high", "low", "close"])
    df["volume"] = df["volume"].fillna(0).astype(int)

    log(f"  → {len(df)} bars for {symbol} @ {timeframe}")
    return df


async def upsert_intraday(conn: asyncpg.Connection, df: pd.DataFrame) -> int:
    if df.empty:
        return 0

    records = [
        (
            str(row["symbol"]),
            row["timestamp"].to_pydatetime(),
            str(row["timeframe"]),
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


async def run(symbol: str, timeframe: str, database_url: str) -> None:
    pg_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
    log(f"Connecting to {pg_url.split('@')[-1]}")
    conn = await asyncpg.connect(pg_url)

    try:
        await conn.execute(ENSURE_TABLE_SQL)
        df   = download_intraday(symbol, timeframe)
        rows = await upsert_intraday(conn, df)
        log(f"Upserted {rows:,} rows for {symbol} @ {timeframe}", "OK")
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Intraday OHLCV loader — yfinance → TimescaleDB")
    parser.add_argument("--symbol",       required=True, help="Ticker symbol (e.g. SPY, BTC-USD)")
    parser.add_argument("--timeframe",    default="5m",  choices=list(TIMEFRAME_CONFIG), help="Bar interval")
    parser.add_argument("--database-url", default=os.getenv(
        "DATABASE_URL", "postgresql://trading:trading@localhost:5432/trading_db"
    ).replace("postgresql+asyncpg://", "postgresql://"))

    args = parser.parse_args()

    print()
    log("Intraday Data Loader")
    log(f"Symbol    : {args.symbol}")
    log(f"Timeframe : {args.timeframe}")
    print()

    asyncio.run(run(args.symbol, args.timeframe, args.database_url))


if __name__ == "__main__":
    main()

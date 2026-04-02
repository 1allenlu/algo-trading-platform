"""
Crypto Service — Phase 32.

Provides metadata for supported crypto pairs and ingests daily OHLCV
data from yfinance into the existing market_data table.

No new tables needed — crypto symbols (e.g. "BTC-USD") are stored
alongside equities in market_data.

Public interface:
  CRYPTO_SYMBOLS          — list of supported pairs with metadata
  get_crypto_symbols(db)  → list[dict] enriched with latest price + change
  ingest_crypto(db)       → {results: [{symbol, inserted}...]}
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from functools import partial
from typing import Any

import yfinance as yf
from loguru import logger
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import MarketData

# ── Supported crypto pairs ────────────────────────────────────────────────────

CRYPTO_SYMBOLS: list[dict[str, str]] = [
    {"symbol": "BTC-USD",  "name": "Bitcoin",    "category": "Layer 1"},
    {"symbol": "ETH-USD",  "name": "Ethereum",   "category": "Layer 1"},
    {"symbol": "SOL-USD",  "name": "Solana",     "category": "Layer 1"},
    {"symbol": "BNB-USD",  "name": "BNB",        "category": "Layer 1"},
    {"symbol": "XRP-USD",  "name": "Ripple",     "category": "Layer 1"},
    {"symbol": "ADA-USD",  "name": "Cardano",    "category": "Layer 1"},
    {"symbol": "AVAX-USD", "name": "Avalanche",  "category": "Layer 1"},
    {"symbol": "DOGE-USD", "name": "Dogecoin",   "category": "Meme"},
    {"symbol": "LINK-USD", "name": "Chainlink",  "category": "DeFi"},
    {"symbol": "DOT-USD",  "name": "Polkadot",   "category": "Layer 0"},
]

CRYPTO_SYMBOL_SET = {c["symbol"] for c in CRYPTO_SYMBOLS}


# ── Metadata + latest price from DB ───────────────────────────────────────────

async def get_crypto_symbols(db: AsyncSession) -> list[dict]:
    """
    Return CRYPTO_SYMBOLS enriched with the latest price and 24h change
    from the market_data table. Symbols not yet ingested return null prices.
    """
    symbols = [c["symbol"] for c in CRYPTO_SYMBOLS]

    # Fetch the latest 2 bars per symbol for price + change calculation
    # Using a lateral / subquery approach via Python-side grouping
    rows = (await db.scalars(
        select(MarketData)
        .where(MarketData.symbol.in_(symbols))
        .order_by(MarketData.symbol, MarketData.timestamp.desc())
    )).all()

    # Group latest 2 bars per symbol
    by_sym: dict[str, list[MarketData]] = {}
    for r in rows:
        lst = by_sym.setdefault(r.symbol, [])
        if len(lst) < 2:
            lst.append(r)

    result = []
    for meta in CRYPTO_SYMBOLS:
        sym   = meta["symbol"]
        bars  = by_sym.get(sym, [])
        latest = bars[0] if bars else None
        prev   = bars[1] if len(bars) > 1 else None

        last_price   = float(latest.close)  if latest else None
        change_pct   = (
            (float(latest.close) - float(prev.close)) / float(prev.close) * 100
            if (latest and prev and prev.close)
            else None
        )
        volume = int(latest.volume) if latest else None

        result.append({
            **meta,
            "last_price":  last_price,
            "change_pct":  round(change_pct, 4) if change_pct is not None else None,
            "volume":      volume,
            "has_data":    latest is not None,
        })

    return result


# ── Ingest ────────────────────────────────────────────────────────────────────

def _download_crypto(symbol: str) -> list[dict]:
    """Blocking yfinance download for one crypto symbol — run in thread pool."""
    end   = datetime.now()
    start = end - timedelta(days=5 * 365)

    ticker = yf.Ticker(symbol)
    df = ticker.history(
        start=start.strftime("%Y-%m-%d"),
        end=end.strftime("%Y-%m-%d"),
        interval="1d",
        auto_adjust=True,
        prepost=False,
    )

    if df.empty:
        return []

    df = df.rename(columns={
        "Open": "open", "High": "high", "Low": "low",
        "Close": "close", "Volume": "volume",
    })
    df = df[["open", "high", "low", "close", "volume"]].copy()
    df.index.name = "timestamp"
    df = df.reset_index()

    if df["timestamp"].dt.tz is None:
        df["timestamp"] = df["timestamp"].dt.tz_localize("UTC")
    else:
        df["timestamp"] = df["timestamp"].dt.tz_convert("UTC")

    df = df.dropna(subset=["open", "high", "low", "close"])
    df["volume"] = df["volume"].fillna(0).astype(int)

    return [
        {
            "symbol":    symbol,
            "timestamp": row["timestamp"].to_pydatetime(),
            "open":      float(row["open"]),
            "high":      float(row["high"]),
            "low":       float(row["low"]),
            "close":     float(row["close"]),
            "volume":    int(row["volume"]),
        }
        for _, row in df.iterrows()
    ]


async def ingest_crypto(db: AsyncSession) -> dict[str, Any]:
    """
    Download 5yr daily OHLCV for all supported crypto pairs and upsert
    into the existing market_data table.
    """
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    loop    = asyncio.get_event_loop()
    results = []

    for meta in CRYPTO_SYMBOLS:
        sym = meta["symbol"]
        try:
            records = await loop.run_in_executor(None, partial(_download_crypto, sym))
            if records:
                stmt = pg_insert(MarketData).values(records).on_conflict_do_update(
                    index_elements=["symbol", "timestamp"],
                    set_={"open": pg_insert(MarketData).excluded.open,
                          "high": pg_insert(MarketData).excluded.high,
                          "low":  pg_insert(MarketData).excluded.low,
                          "close": pg_insert(MarketData).excluded.close,
                          "volume": pg_insert(MarketData).excluded.volume},
                )
                await db.execute(stmt)
                results.append({"symbol": sym, "inserted": len(records)})
                logger.info(f"[crypto] {sym}: {len(records)} bars upserted")
            else:
                results.append({"symbol": sym, "inserted": 0})
        except Exception as exc:
            logger.warning(f"[crypto] Failed {sym}: {exc}")
            results.append({"symbol": sym, "inserted": 0, "error": str(exc)})

    await db.commit()
    return {"results": results, "total_symbols": len(results)}

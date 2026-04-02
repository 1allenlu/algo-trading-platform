"""
Intraday Data Service — Phase 31.

Fetches and stores sub-daily OHLCV bars (1m / 5m / 15m / 1h) via yfinance.

Public interface:
  get_intraday(db, symbol, timeframe, limit) → list[dict]
  ingest_intraday(db, symbol, timeframe)     → {inserted, symbol, timeframe}
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from functools import partial
from typing import Any

import yfinance as yf
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import IntradayData

# ── Timeframe → yfinance limits ───────────────────────────────────────────────
TIMEFRAME_CONFIG: dict[str, dict] = {
    "1m":  {"interval": "1m",  "days": 7},
    "5m":  {"interval": "5m",  "days": 60},
    "15m": {"interval": "15m", "days": 60},
    "1h":  {"interval": "1h",  "days": 730},
}

VALID_TIMEFRAMES = set(TIMEFRAME_CONFIG.keys())


# ── Query ──────────────────────────────────────────────────────────────────────

async def get_intraday(
    db:        AsyncSession,
    symbol:    str,
    timeframe: str,
    limit:     int = 500,
) -> list[dict]:
    """
    Return up to `limit` bars for (symbol, timeframe), newest first from DB,
    then reversed to ascending order for the chart.
    """
    if timeframe not in VALID_TIMEFRAMES:
        raise ValueError(f"Invalid timeframe '{timeframe}'. Valid: {sorted(VALID_TIMEFRAMES)}")

    rows = (await db.scalars(
        select(IntradayData)
        .where(
            IntradayData.symbol    == symbol.upper(),
            IntradayData.timeframe == timeframe,
        )
        .order_by(IntradayData.timestamp.desc())
        .limit(limit)
    )).all()

    # Reverse to ascending order for chart consumption
    rows = list(reversed(rows))

    return [
        {
            "symbol":    r.symbol,
            "timestamp": r.timestamp.isoformat(),
            "timeframe": r.timeframe,
            "open":      r.open,
            "high":      r.high,
            "low":       r.low,
            "close":     r.close,
            "volume":    r.volume,
        }
        for r in rows
    ]


# ── Ingest ────────────────────────────────────────────────────────────────────

def _fetch_yfinance(symbol: str, timeframe: str) -> list[dict]:
    """
    Blocking yfinance download — run in a thread pool to avoid blocking the loop.
    Returns list of dicts ready for DB insertion.
    """
    import pandas as pd

    cfg   = TIMEFRAME_CONFIG[timeframe]
    end   = datetime.now()
    start = end - timedelta(days=cfg["days"])

    ticker = yf.Ticker(symbol.upper())
    df = ticker.history(
        start=start.strftime("%Y-%m-%d"),
        end=end.strftime("%Y-%m-%d"),
        interval=cfg["interval"],
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
            "symbol":    symbol.upper(),
            "timestamp": row["timestamp"].to_pydatetime(),
            "timeframe": timeframe,
            "open":      float(row["open"]),
            "high":      float(row["high"]),
            "low":       float(row["low"]),
            "close":     float(row["close"]),
            "volume":    int(row["volume"]),
        }
        for _, row in df.iterrows()
    ]


async def ingest_intraday(
    db:        AsyncSession,
    symbol:    str,
    timeframe: str,
) -> dict[str, Any]:
    """
    Download intraday bars from yfinance and upsert into intraday_data.
    Skips duplicates via ON CONFLICT DO NOTHING logic (merge via SQLAlchemy).
    """
    if timeframe not in VALID_TIMEFRAMES:
        raise ValueError(f"Invalid timeframe '{timeframe}'")

    logger.info(f"[intraday] Ingesting {symbol} @ {timeframe}")

    # Run blocking yfinance call in thread pool
    loop    = asyncio.get_event_loop()
    records = await loop.run_in_executor(None, partial(_fetch_yfinance, symbol, timeframe))

    if not records:
        logger.warning(f"[intraday] No data returned for {symbol} @ {timeframe}")
        return {"inserted": 0, "symbol": symbol.upper(), "timeframe": timeframe}

    # Upsert: merge_existing=True equivalent — insert, ignore conflicts
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    stmt = pg_insert(IntradayData).values(records).on_conflict_do_nothing()
    await db.execute(stmt)
    await db.commit()

    logger.info(f"[intraday] Upserted {len(records)} bars for {symbol} @ {timeframe}")
    return {"inserted": len(records), "symbol": symbol.upper(), "timeframe": timeframe}

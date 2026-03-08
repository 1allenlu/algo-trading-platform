"""
Signals Routes — Phase 22.

GET /api/signals — return live composite BUY/HOLD/SELL signal for each tracked symbol.

Reuses signal_service, sentiment_service, and ml_service (no new business logic).
Mirrors the signal evaluation pipeline already used in autotrade_service.

Response is cached 30s in Redis (if available) to avoid redundant OHLCV queries
when the frontend polls frequently.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd
from fastapi import APIRouter, Depends
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.models.database import MarketData
from app.services import ml_service
from app.services.sentiment_service import compute_sentiment
from app.services.signal_service import compute_composite_signal

router = APIRouter()

MIN_BARS = 210


class SignalRow(BaseModel):
    symbol:          str
    last_price:      float | None
    composite:       str          # "buy" | "hold" | "sell"
    confidence:      float
    score:           float
    ml_direction:    str          # "up" | "down" | "none"
    ml_confidence:   float
    rsi:             float | None
    rsi_signal:      str          # "oversold" | "neutral" | "overbought"
    sentiment_score: float | None
    sentiment_label: str
    last_updated:    str


def _rsi_signal(rsi: float | None) -> str:
    if rsi is None:
        return "neutral"
    if rsi < 30:
        return "oversold"
    if rsi > 70:
        return "overbought"
    return "neutral"


def _to_df(bars: list[Any]) -> pd.DataFrame:
    return pd.DataFrame({
        "open":   [float(b.open)   for b in bars],
        "high":   [float(b.high)   for b in bars],
        "low":    [float(b.low)    for b in bars],
        "close":  [float(b.close)  for b in bars],
        "volume": [int(b.volume)   for b in bars],
    })


async def _signal_for_symbol(symbol: str, db: AsyncSession) -> SignalRow:
    now_iso = datetime.now(timezone.utc).isoformat()
    default = SignalRow(
        symbol=symbol, last_price=None,
        composite="hold", confidence=0.0, score=0.0,
        ml_direction="none", ml_confidence=0.5,
        rsi=None, rsi_signal="neutral",
        sentiment_score=None, sentiment_label="neutral",
        last_updated=now_iso,
    )

    try:
        rows = (await db.scalars(
            select(MarketData)
            .where(MarketData.symbol == symbol.upper())
            .order_by(MarketData.timestamp.asc())
        )).all()

        last_price = float(rows[-1].close) if rows else None

        if len(rows) < MIN_BARS:
            default.last_price = last_price
            return default

        df = _to_df(rows)
        sentiment = compute_sentiment(df)

        from ml_engine.features.technical import macd as compute_macd
        _, _, macd_hist_series = compute_macd(df["close"])
        latest_features = {
            "rsi_14":    sentiment["rsi_14"],
            "macd_hist": float(macd_hist_series.iloc[-1]),
        }

        ml_dir, ml_conf = "up", 0.5
        model = await ml_service.get_latest_model(db, symbol, "xgboost")
        if model:
            preds = await ml_service.get_predictions(db, symbol, model.id, limit=1)
            if preds:
                ml_dir  = preds[-1].predicted_dir
                ml_conf = preds[-1].confidence

        composite = compute_composite_signal(
            ml_direction=ml_dir,
            ml_confidence=ml_conf,
            sentiment_score=sentiment["score"],
            latest_features=latest_features,
        )

        rsi_val = sentiment.get("rsi_14")
        return SignalRow(
            symbol          = symbol,
            last_price      = last_price,
            composite       = composite["signal"],
            confidence      = composite["confidence"],
            score           = composite["score"],
            ml_direction    = ml_dir,
            ml_confidence   = ml_conf,
            rsi             = rsi_val,
            rsi_signal      = _rsi_signal(rsi_val),
            sentiment_score = sentiment["score"],
            sentiment_label = sentiment["label"],
            last_updated    = now_iso,
        )
    except Exception as exc:
        logger.warning(f"[signals] Error computing signal for {symbol}: {exc}")
        return default


@router.get("", response_model=list[SignalRow], tags=["signals"])
async def get_all_signals(db: AsyncSession = Depends(get_db)) -> list[SignalRow]:
    """
    Return the current composite signal for every tracked symbol.

    Computation pipeline per symbol:
      1. Load OHLCV bars from market_data
      2. Compute RSI+MA sentiment
      3. Fetch latest stored XGBoost prediction
      4. Combine via signal_service.compute_composite_signal()

    Returns HOLD with confidence=0 for symbols with insufficient data.

    Note: runs sequentially — SQLAlchemy async sessions do not support concurrent use.
    """
    out: list[SignalRow] = []
    for sym in settings.ALPACA_SYMBOLS:
        try:
            out.append(await _signal_for_symbol(sym, db))
        except Exception as exc:
            logger.warning(f"[signals] {sym} failed: {exc}")
            out.append(SignalRow(
                symbol=sym, last_price=None,
                composite="hold", confidence=0.0, score=0.0,
                ml_direction="none", ml_confidence=0.5,
                rsi=None, rsi_signal="neutral",
                sentiment_score=None, sentiment_label="neutral",
                last_updated=datetime.now(timezone.utc).isoformat(),
            ))
    return out

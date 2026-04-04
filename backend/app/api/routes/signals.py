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

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, Query
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.models.database import MarketData, TradeJournal
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


# ── Multi-timeframe signal alignment ─────────────────────────────────────────


class TFSignal(BaseModel):
    signal: str        # "buy" | "hold" | "sell"
    score:  float
    rsi:    float | None


class MultiTFRow(BaseModel):
    symbol:   str
    daily:    TFSignal
    weekly:   TFSignal | None
    monthly:  TFSignal | None
    aligned:  bool          # True if ≥2 of 3 timeframes agree on buy/sell
    strength: str           # "strong_buy" | "strong_sell" | "mostly_bullish" | "mostly_bearish" | "mixed"


def _tech_only_signal(df: pd.DataFrame) -> dict[str, Any]:
    """
    Technical-only signal (RSI + SMA trend) for resampled weekly/monthly bars.
    Does not require an ML model — works on any timeframe.
    """
    from ml_engine.features.technical import rsi as compute_rsi, sma as compute_sma

    close  = df["close"]
    n      = len(close)

    if n < 5:
        return {"signal": "hold", "score": 0.0, "rsi": None}

    # RSI — adaptive period so we always get a value
    rsi_period = min(14, max(3, n // 2))
    rsi_vals   = compute_rsi(close, rsi_period)
    latest_rsi = float(rsi_vals.iloc[-1]) if not pd.isna(rsi_vals.iloc[-1]) else 50.0

    # Trend vs short SMA
    sma_period  = min(20, max(3, n // 2))
    sma_vals    = compute_sma(close, sma_period)
    latest_sma  = float(sma_vals.iloc[-1]) if not pd.isna(sma_vals.iloc[-1]) else float(close.iloc[-1])
    latest_price = float(close.iloc[-1])

    price_vs_sma = (latest_price / latest_sma - 1) if latest_sma > 0 else 0.0

    # RSI component [-0.5, +0.5]
    if latest_rsi > 70:
        rsi_score = -0.5 * min(1.0, (latest_rsi - 70) / 30)
    elif latest_rsi < 30:
        rsi_score = 0.5 * min(1.0, (30 - latest_rsi) / 30)
    else:
        rsi_score = 0.0

    # Trend component [-0.5, +0.5]
    trend_score = 0.5 if price_vs_sma > 0.01 else (-0.5 if price_vs_sma < -0.01 else 0.0)

    score  = float(np.clip(rsi_score + trend_score, -1.0, 1.0))
    signal = "buy" if score > 0.2 else "sell" if score < -0.2 else "hold"

    return {"signal": signal, "score": round(score, 4), "rsi": round(latest_rsi, 1)}


def _alignment_strength(sigs: list[str]) -> tuple[bool, str]:
    """Given a list of signal strings, return (aligned, strength_label)."""
    buy_count  = sigs.count("buy")
    sell_count = sigs.count("sell")
    total      = len(sigs)

    if buy_count == total:
        return True, "strong_buy"
    if sell_count == total:
        return True, "strong_sell"
    if buy_count >= total * 0.66:
        return True, "mostly_bullish"
    if sell_count >= total * 0.66:
        return True, "mostly_bearish"
    return False, "mixed"


async def _multi_tf_for_symbol(symbol: str, db: AsyncSession) -> MultiTFRow:
    rows = (await db.scalars(
        select(MarketData)
        .where(MarketData.symbol == symbol.upper())
        .order_by(MarketData.timestamp.asc())
    )).all()

    # Daily signal — reuse existing full composite logic
    daily_row  = await _signal_for_symbol(symbol, db)
    daily_sig  = TFSignal(signal=daily_row.composite, score=daily_row.score, rsi=daily_row.rsi)

    weekly_sig: TFSignal | None  = None
    monthly_sig: TFSignal | None = None

    if len(rows) >= 50:
        try:
            idx = pd.to_datetime([r.timestamp for r in rows])
            df  = pd.DataFrame({
                "open":   [float(r.open)   for r in rows],
                "high":   [float(r.high)   for r in rows],
                "low":    [float(r.low)    for r in rows],
                "close":  [float(r.close)  for r in rows],
                "volume": [int(r.volume)   for r in rows],
            }, index=idx)

            # Weekly resample (W = week ending Sunday)
            weekly_df = df.resample("W").agg({
                "open": "first", "high": "max", "low": "min",
                "close": "last", "volume": "sum",
            }).dropna()
            if len(weekly_df) >= 10:
                w = _tech_only_signal(weekly_df.reset_index(drop=True))
                weekly_sig = TFSignal(**w)

            # Monthly resample — try pandas ≥2.2 "ME" first, fall back to "M"
            try:
                monthly_df = df.resample("ME").agg({
                    "open": "first", "high": "max", "low": "min",
                    "close": "last", "volume": "sum",
                }).dropna()
            except Exception:
                monthly_df = df.resample("M").agg({
                    "open": "first", "high": "max", "low": "min",
                    "close": "last", "volume": "sum",
                }).dropna()
            if len(monthly_df) >= 6:
                m = _tech_only_signal(monthly_df.reset_index(drop=True))
                monthly_sig = TFSignal(**m)

        except Exception as exc:
            logger.warning(f"[multi_tf] {symbol}: {exc}")

    # Alignment
    available = [daily_sig.signal]
    if weekly_sig:
        available.append(weekly_sig.signal)
    if monthly_sig:
        available.append(monthly_sig.signal)

    aligned, strength = _alignment_strength(available)

    return MultiTFRow(
        symbol=symbol, daily=daily_sig,
        weekly=weekly_sig, monthly=monthly_sig,
        aligned=aligned, strength=strength,
    )


@router.get("/multi-timeframe", response_model=list[MultiTFRow], tags=["signals"])
async def get_multi_timeframe_signals(
    db: AsyncSession = Depends(get_db),
) -> list[MultiTFRow]:
    """
    Compute BUY/HOLD/SELL signals on three timeframes for each tracked symbol.

    - Daily:   Full composite (ML + sentiment + technical)
    - Weekly:  Technical-only (RSI + SMA trend) on weekly resampled bars
    - Monthly: Technical-only (RSI + SMA trend) on monthly resampled bars

    Alignment is True when ≥ 2 of 3 timeframes agree on the same direction.
    """
    out: list[MultiTFRow] = []
    for sym in settings.ALPACA_SYMBOLS:
        try:
            out.append(await _multi_tf_for_symbol(sym, db))
        except Exception as exc:
            logger.warning(f"[multi_tf] {sym} failed: {exc}")
    return out


# ── Kelly criterion position sizing ──────────────────────────────────────────


class KellyRow(BaseModel):
    symbol:         str
    win_rate:       float   # P(winning trade)
    win_loss_ratio: float   # avg_win / avg_loss
    full_kelly:     float   # fraction of capital (0–1)
    half_kelly:     float   # full_kelly / 2 (recommended risk-managed size)
    source:         str     # "model" | "trades" | "blended" | "default"
    n_trades:       int     # number of closed trades used (0 if model-only)


async def _kelly_for_symbol(symbol: str, db: AsyncSession) -> KellyRow:
    win_rate       = 0.5
    win_loss_ratio = 1.5
    source         = "default"
    n_trades       = 0

    # 1. Try ML model accuracy as win_rate proxy
    try:
        model = await ml_service.get_latest_model(db, symbol, "xgboost")
        if model and model.accuracy:
            win_rate = float(model.accuracy)
            source   = "model"
    except Exception:
        pass

    # 2. Try to refine with actual closed paper trades from journal
    try:
        journal_rows = (await db.scalars(
            select(TradeJournal)
            .where(TradeJournal.symbol == symbol.upper())
            .where(TradeJournal.pnl.isnot(None))
        )).all()

        if len(journal_rows) >= 5:
            wins   = [r.pnl for r in journal_rows if r.pnl > 0]
            losses = [abs(r.pnl) for r in journal_rows if r.pnl < 0]
            n_trades = len(journal_rows)

            if wins and losses:
                avg_win  = sum(wins)   / len(wins)
                avg_loss = sum(losses) / len(losses)
                win_loss_ratio = round(avg_win / avg_loss, 4) if avg_loss > 0 else 1.5

                actual_wr = len(wins) / n_trades
                if source == "model":
                    # Blend: 60% model accuracy, 40% actual trade win-rate
                    win_rate = 0.6 * win_rate + 0.4 * actual_wr
                    source   = "blended"
                else:
                    win_rate = actual_wr
                    source   = "trades"
    except Exception:
        pass

    # Kelly formula: f* = (p·b – q) / b  where q = 1 – p, b = win_loss_ratio
    p = max(0.01, min(0.99, win_rate))
    q = 1.0 - p
    b = max(0.1, win_loss_ratio)

    full_kelly = max(0.0, (p * b - q) / b)
    half_kelly = full_kelly / 2.0

    return KellyRow(
        symbol         = symbol,
        win_rate       = round(p, 4),
        win_loss_ratio = round(b, 4),
        full_kelly     = round(full_kelly, 4),
        half_kelly     = round(half_kelly, 4),
        source         = source,
        n_trades       = n_trades,
    )


@router.get("/kelly", response_model=list[KellyRow], tags=["signals"])
async def get_kelly_sizing(
    db: AsyncSession = Depends(get_db),
) -> list[KellyRow]:
    """
    Compute Kelly criterion position sizes for each tracked symbol.

    Kelly fraction = (p·b – q) / b
      p = win probability (from ML model accuracy, blended with trade history)
      q = 1 – p
      b = avg_win / avg_loss ratio (from closed paper trades; defaults to 1.5)

    Returns full Kelly and half Kelly (standard risk-managed size).
    Half Kelly is recommended — full Kelly maximises growth but leads to large drawdowns.
    """
    out: list[KellyRow] = []
    for sym in settings.ALPACA_SYMBOLS:
        try:
            out.append(await _kelly_for_symbol(sym, db))
        except Exception as exc:
            logger.warning(f"[kelly] {sym} failed: {exc}")
    return out

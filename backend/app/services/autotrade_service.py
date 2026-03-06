"""
Auto-Trade Service — Phase 12.

Runs a background asyncio task that periodically evaluates composite signals
for configured symbols and automatically places paper orders when the signal
confidence meets the configured threshold.

Signal evaluation pipeline (mirrors GET /api/ml/signal/{symbol}):
  1. Load OHLCV bars from market_data table
  2. Compute RSI+MA sentiment (sentiment_service.compute_sentiment)
  3. Fetch latest stored ML prediction (if a trained model exists)
  4. Call signal_service.compute_composite_signal()
  5. Act on the result: BUY / SELL / skip

Position logic:
  - BUY  signal + confidence >= threshold + no existing position → market buy
  - SELL signal + confidence >= threshold + existing position   → market sell
  - Any other state → log reason and skip

Trade sizing:
  position_size_pct × current equity / current price = shares to buy.

All actions (including skips) are recorded in auto_trade_log.

Public interface:
  start_autotrade_task(app_state)  → call from main.py lifespan
  stop_autotrade_task(app_state)   → call from main.py lifespan (shutdown)
  get_autotrade_service()          → module-level singleton for dependency injection
"""

from __future__ import annotations

import asyncio
import traceback
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import (
    AsyncSessionLocal,
    AutoTradeConfig,
    AutoTradeLog,
    MarketData,
    PaperPosition,
)
from app.services import ml_service
from app.services.paper_trading_service import submit_order

MIN_BARS = 210   # Minimum bars required for sentiment + MACD computation


# ── DataFrame builder (mirrors ml.py _build_ohlcv_df) ─────────────────────────

def _to_df(bars: list[Any]) -> pd.DataFrame:
    return pd.DataFrame({
        "open":   [float(b.open)   for b in bars],
        "high":   [float(b.high)   for b in bars],
        "low":    [float(b.low)    for b in bars],
        "close":  [float(b.close)  for b in bars],
        "volume": [int(b.volume)   for b in bars],
    })


# ── Config helpers ─────────────────────────────────────────────────────────────

async def _get_or_create_config(session: AsyncSession) -> AutoTradeConfig:
    """Return the singleton config row, creating it with defaults if absent."""
    cfg = await session.get(AutoTradeConfig, 1)
    if cfg is None:
        cfg = AutoTradeConfig(
            id=1,
            enabled=False,
            symbols="SPY,QQQ",
            signal_threshold=0.5,
            position_size_pct=0.05,
            check_interval_sec=60,
        )
        session.add(cfg)
        await session.commit()
        await session.refresh(cfg)
    return cfg


# ── Signal computation ─────────────────────────────────────────────────────────

async def _compute_signal(symbol: str, session: AsyncSession) -> dict | None:
    """
    Compute the composite BUY/HOLD/SELL signal for one symbol.

    Returns None (and logs) if there is insufficient data.
    Uses ML prediction if a trained model exists; falls back to sentiment-only.
    """
    rows = (await session.scalars(
        select(MarketData)
        .where(MarketData.symbol == symbol.upper())
        .order_by(MarketData.timestamp.asc())
    )).all()

    if len(rows) < MIN_BARS:
        logger.debug(f"[autotrade] {symbol}: only {len(rows)} bars (need {MIN_BARS}) — skip")
        return None

    df = _to_df(rows)

    # Sentiment + MACD (always available — no ML model required)
    from app.services.sentiment_service import compute_sentiment
    sentiment = compute_sentiment(df)

    from ml_engine.features.technical import macd as compute_macd
    _, _, macd_hist_series = compute_macd(df["close"])

    latest_features = {
        "rsi_14":    sentiment["rsi_14"],
        "macd_hist": float(macd_hist_series.iloc[-1]),
    }

    # Try to get the latest stored ML prediction (avoids reloading model)
    ml_dir, ml_conf = "up", 0.5   # neutral defaults (if no model)
    model = await ml_service.get_latest_model(session, symbol, "xgboost")
    if model:
        preds = await ml_service.get_predictions(session, symbol, model.id, limit=1)
        if preds:
            pred   = preds[-1]
            ml_dir  = pred.predicted_dir
            ml_conf = pred.confidence

    from app.services.signal_service import compute_composite_signal
    return compute_composite_signal(
        ml_direction=ml_dir,
        ml_confidence=ml_conf,
        sentiment_score=sentiment["score"],
        latest_features=latest_features,
    )


# ── Position helper ────────────────────────────────────────────────────────────

async def _get_position(symbol: str, session: AsyncSession) -> float:
    """Return the current paper position qty for `symbol` (0.0 if none)."""
    pos = await session.scalar(
        select(PaperPosition).where(PaperPosition.symbol == symbol.upper())
    )
    return float(pos.qty) if pos else 0.0


async def _current_price(symbol: str, session: AsyncSession) -> float | None:
    return await session.scalar(
        select(MarketData.close)
        .where(MarketData.symbol == symbol.upper())
        .order_by(MarketData.timestamp.desc())
        .limit(1)
    )


# ── Log helper ─────────────────────────────────────────────────────────────────

async def _log(
    session: AsyncSession,
    symbol: str,
    signal: str,
    confidence: float,
    score: float,
    action: str,
    reason: str,
    qty: float | None = None,
    price: float | None = None,
) -> None:
    entry = AutoTradeLog(
        symbol=symbol,
        signal=signal,
        confidence=confidence,
        score=score,
        action=action,
        qty=qty,
        price=price,
        reason=reason,
        created_at=datetime.now(timezone.utc),
    )
    session.add(entry)
    await session.commit()


# ── Evaluation cycle ───────────────────────────────────────────────────────────

async def _evaluate_symbol(symbol: str, cfg: AutoTradeConfig, session: AsyncSession) -> None:
    """Evaluate signal for one symbol and act accordingly."""
    sym = symbol.upper()

    # ── Compute signal ─────────────────────────────────────────────────────────
    try:
        sig = await _compute_signal(sym, session)
    except Exception as exc:
        logger.warning(f"[autotrade] {sym}: signal error — {exc}")
        await _log(session, sym, "error", 0.0, 0.0, "error", str(exc))
        return

    if sig is None:
        await _log(session, sym, "unknown", 0.0, 0.0, "insufficient_data",
                   f"Fewer than {MIN_BARS} bars available")
        return

    signal     = sig["signal"]        # "buy" | "sell" | "hold"
    confidence = sig["confidence"]    # [0, 1]
    score      = sig["score"]         # raw composite

    # ── Threshold check ────────────────────────────────────────────────────────
    if confidence < cfg.signal_threshold:
        await _log(session, sym, signal, confidence, score, "low_confidence",
                   f"Confidence {confidence:.3f} < threshold {cfg.signal_threshold:.3f}")
        return

    if signal == "hold":
        await _log(session, sym, signal, confidence, score, "hold_signal",
                   "Signal is HOLD — no action taken")
        return

    # ── Position check ─────────────────────────────────────────────────────────
    current_qty = await _get_position(sym, session)
    current_px  = await _current_price(sym, session)
    if current_px is None:
        await _log(session, sym, signal, confidence, score, "error",
                   "Cannot find current price in market_data")
        return

    if signal == "buy":
        if current_qty > 0:
            await _log(session, sym, signal, confidence, score, "already_positioned",
                       f"Already holding {current_qty:.4f} shares — skip BUY")
            return

        # Size the order: position_size_pct × equity / price
        # Approximate equity from paper_account table
        from app.models.database import PaperAccount
        account = await session.scalar(select(PaperAccount))
        equity  = float(account.cash) if account else 100_000.0
        trade_value = equity * cfg.position_size_pct
        qty = max(1.0, round(trade_value / current_px))

        try:
            await submit_order(session, sym, "buy", qty, "market")
            reason = (f"BUY signal (score={score:.3f}, conf={confidence:.3f}); "
                      f"{qty} shares @ ~${current_px:.2f}")
            logger.info(f"[autotrade] {sym}: BOUGHT {qty} shares @ ~${current_px:.2f}")
            await _log(session, sym, signal, confidence, score, "bought",
                       reason, qty=qty, price=current_px)
        except Exception as exc:
            logger.error(f"[autotrade] {sym}: order error — {exc}")
            await _log(session, sym, signal, confidence, score, "error", str(exc))

    elif signal == "sell":
        if current_qty <= 0:
            await _log(session, sym, signal, confidence, score, "no_position_to_sell",
                       "SELL signal but no open position")
            return

        try:
            await submit_order(session, sym, "sell", current_qty, "market")
            reason = (f"SELL signal (score={score:.3f}, conf={confidence:.3f}); "
                      f"closed {current_qty:.4f} shares @ ~${current_px:.2f}")
            logger.info(f"[autotrade] {sym}: SOLD {current_qty} shares @ ~${current_px:.2f}")
            await _log(session, sym, signal, confidence, score, "sold",
                       reason, qty=current_qty, price=current_px)
        except Exception as exc:
            logger.error(f"[autotrade] {sym}: order error — {exc}")
            await _log(session, sym, signal, confidence, score, "error", str(exc))


# ── Background task ────────────────────────────────────────────────────────────

async def _autotrade_loop() -> None:
    """
    Runs forever. On each tick:
      1. Reload config from DB
      2. If enabled, evaluate each configured symbol
      3. Sleep for check_interval_sec
    """
    logger.info("[autotrade] Background task started")
    while True:
        try:
            async with AsyncSessionLocal() as session:
                cfg = await _get_or_create_config(session)

                if not cfg.enabled:
                    interval = cfg.check_interval_sec
                else:
                    symbols = [s.strip().upper() for s in cfg.symbols.split(",") if s.strip()]
                    interval = cfg.check_interval_sec
                    logger.debug(f"[autotrade] Evaluating {len(symbols)} symbols")
                    for sym in symbols:
                        try:
                            await _evaluate_symbol(sym, cfg, session)
                        except Exception:
                            logger.error(f"[autotrade] Unexpected error for {sym}:\n{traceback.format_exc()}")

        except Exception:
            logger.error(f"[autotrade] Loop error:\n{traceback.format_exc()}")
            interval = 60  # fallback sleep on config load error

        await asyncio.sleep(interval)


# ── Singleton task management ──────────────────────────────────────────────────

_task: asyncio.Task | None = None


def start_autotrade_task() -> None:
    """Launch the background auto-trade loop as a daemon asyncio task."""
    global _task
    _task = asyncio.create_task(_autotrade_loop(), name="autotrade_loop")
    logger.info("[autotrade] Task created")


async def stop_autotrade_task() -> None:
    """Cancel the background task gracefully (called on shutdown)."""
    global _task
    if _task and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    logger.info("[autotrade] Task stopped")


# ── Public helpers (used by routes) ───────────────────────────────────────────

async def get_config(session: AsyncSession) -> AutoTradeConfig:
    return await _get_or_create_config(session)


async def upsert_config(
    session: AsyncSession,
    *,
    enabled:            bool | None = None,
    symbols:            str  | None = None,
    signal_threshold:   float | None = None,
    position_size_pct:  float | None = None,
    check_interval_sec: int   | None = None,
) -> AutoTradeConfig:
    """Update the singleton config row and return it."""
    cfg = await _get_or_create_config(session)
    if enabled            is not None: cfg.enabled            = enabled
    if symbols            is not None: cfg.symbols            = symbols
    if signal_threshold   is not None: cfg.signal_threshold   = signal_threshold
    if position_size_pct  is not None: cfg.position_size_pct  = position_size_pct
    if check_interval_sec is not None: cfg.check_interval_sec = check_interval_sec
    cfg.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(cfg)
    return cfg

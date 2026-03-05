"""
Price Simulator — Phase 7.

Generates synthetic intraday tick data from stored OHLCV bars.
Runs as a single asyncio background task started in the FastAPI lifespan.

Algorithm:
  1. Fetch the two most recent OHLCV bars per symbol from PostgreSQL.
  2. Seed each symbol's random walk from the latest bar's open price.
  3. Each tick: apply dp = price * N(0, TICK_SIGMA), clamp to [low, high] ± padding.
  4. Every RESET_INTERVAL_S seconds: reset walk back to open (prevents unbounded drift).
  5. Emit a PriceTick dataclass to PriceConnectionManager on every step.

The simulator runs forever until cancelled via asyncio.CancelledError.
Errors inside the loop are logged but do not kill the task.
"""

from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from loguru import logger
from sqlalchemy import select

from app.models.database import AsyncSessionLocal, MarketData

if TYPE_CHECKING:
    from app.services.price_broadcaster import PriceConnectionManager

# ── Simulation parameters ─────────────────────────────────────────────────────

# Symbols to broadcast — must have data in the market_data table
DEFAULT_SYMBOLS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "TSLA"]

TICK_INTERVAL_S  = 1.0     # Base seconds between tick batches
TICK_JITTER_S    = 0.2     # ± random jitter to feel organic
TICK_SIGMA       = 0.0008  # Per-tick volatility (≈ 1.3% daily annualized)
RESET_INTERVAL_S = 30.0    # Walk reset cadence in seconds
FLOOR_PAD        = 0.997   # Price floor = low * FLOOR_PAD
CEIL_PAD         = 1.003   # Price ceiling = high * CEIL_PAD


# ── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class PriceTick:
    """Single simulated price tick — serialized as JSON and sent over WebSocket."""
    symbol:     str
    price:      float     # Current simulated price
    open:       float     # Day open (used as walk anchor)
    high:       float     # Day high (from stored OHLCV)
    low:        float     # Day low (from stored OHLCV)
    prev_close: float     # Prior bar's close (for change calculation)
    change:     float     # price - prev_close
    change_pct: float     # change / prev_close
    volume:     int       # Synthetic tick volume
    timestamp:  str       # ISO 8601 UTC


@dataclass
class _SymbolState:
    """Internal walk state for one symbol."""
    open:       float
    high:       float
    low:        float
    prev_close: float
    price:      float     # Current walk position
    floor:      float
    ceiling:    float
    started_at: float = field(default_factory=time.monotonic)


# ── DB helper ─────────────────────────────────────────────────────────────────

async def _fetch_latest_bars(symbol: str) -> dict | None:
    """
    Fetch the two most recent OHLCV bars for a symbol.
    Returns {open, high, low, close, prev_close} or None if no data.
    """
    async with AsyncSessionLocal() as session:
        rows = (await session.scalars(
            select(MarketData)
            .where(MarketData.symbol == symbol.upper())
            .order_by(MarketData.timestamp.desc())
            .limit(2)
        )).all()

    if not rows:
        return None

    latest = rows[0]
    prev_close = rows[1].close if len(rows) > 1 else latest.open
    return {
        "open":       float(latest.open),
        "high":       float(latest.high),
        "low":        float(latest.low),
        "close":      float(latest.close),
        "prev_close": float(prev_close),
    }


def _make_state(bar: dict) -> _SymbolState:
    return _SymbolState(
        open       = bar["open"],
        high       = bar["high"],
        low        = bar["low"],
        prev_close = bar["prev_close"],
        price      = bar["open"],   # Walk starts at open
        floor      = bar["low"] * FLOOR_PAD,
        ceiling    = bar["high"] * CEIL_PAD,
    )


# ── Main simulator task ───────────────────────────────────────────────────────

async def run_price_simulator(manager: "PriceConnectionManager") -> None:
    """
    Long-running asyncio task. Emits PriceTick to the connection manager
    every ~TICK_INTERVAL_S seconds for each symbol in DEFAULT_SYMBOLS.

    Start this via asyncio.create_task() in the FastAPI lifespan.
    Cancel it on shutdown — CancelledError is caught and re-raised cleanly.
    """
    logger.info(f"Price simulator starting — symbols: {DEFAULT_SYMBOLS}")

    # ── Initialize per-symbol state ──────────────────────────────────────────
    states: dict[str, _SymbolState] = {}

    results = await asyncio.gather(
        *[_fetch_latest_bars(sym) for sym in DEFAULT_SYMBOLS],
        return_exceptions=True,
    )
    for sym, bar in zip(DEFAULT_SYMBOLS, results):
        if isinstance(bar, Exception) or bar is None:
            logger.warning(f"Simulator: no data for {sym} — skipping")
            continue
        states[sym] = _make_state(bar)
        logger.debug(f"Simulator: {sym} seeded @ {bar['open']:.2f}")

    if not states:
        logger.error("Simulator: no symbols loaded — run `make ingest` first")
        return

    logger.info(f"Simulator: {len(states)} symbols ready, entering tick loop")

    # ── Main tick loop ───────────────────────────────────────────────────────
    while True:
        try:
            tick_start = time.monotonic()

            for sym, state in list(states.items()):

                # Reset walk every RESET_INTERVAL_S to prevent unbounded drift
                if time.monotonic() - state.started_at >= RESET_INTERVAL_S:
                    bar = await _fetch_latest_bars(sym)
                    if bar:
                        states[sym] = _make_state(bar)
                        state = states[sym]
                    else:
                        state.price      = state.open
                        state.started_at = time.monotonic()

                # Gaussian random walk step
                delta       = state.price * random.gauss(0, TICK_SIGMA)
                state.price = max(state.floor, min(state.ceiling, state.price + delta))

                change     = state.price - state.prev_close
                change_pct = change / state.prev_close if state.prev_close > 0 else 0.0

                tick = PriceTick(
                    symbol      = sym,
                    price       = round(state.price, 4),
                    open        = state.open,
                    high        = state.high,
                    low         = state.low,
                    prev_close  = state.prev_close,
                    change      = round(change, 4),
                    change_pct  = round(change_pct, 6),
                    volume      = random.randint(100, 5000),
                    timestamp   = datetime.now(timezone.utc).isoformat(),
                )
                await manager.broadcast_tick(tick)

            # Sleep until next tick, accounting for loop processing time
            elapsed = time.monotonic() - tick_start
            sleep_s = max(
                0.0,
                TICK_INTERVAL_S + random.uniform(-TICK_JITTER_S, TICK_JITTER_S) - elapsed,
            )
            await asyncio.sleep(sleep_s)

        except asyncio.CancelledError:
            logger.info("Price simulator shutting down")
            raise
        except Exception as exc:
            logger.exception(f"Simulator loop error (continuing): {exc}")
            await asyncio.sleep(2.0)

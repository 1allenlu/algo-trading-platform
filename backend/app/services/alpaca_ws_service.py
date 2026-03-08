"""
Alpaca WebSocket Price Stream — Phase 19.

Replaces the random-walk price simulator with live quotes from Alpaca's
free IEX data feed when ALPACA_API_KEY + ALPACA_SECRET_KEY are set.

Drop-in replacement for run_price_simulator():
  - Same function signature: start_alpaca_stream(manager, alert_service)
  - Emits the same PriceTick dataclass via manager.broadcast_tick()
  - Each tick also triggers alert_service.check_tick() (Phase 8)

Connection resilience:
  - Exponential back-off reconnect: 1s → 2s → 4s … → 60s cap
  - Logs each reconnect attempt; never crashes the application

Alpaca IEX feed:
  - Free tier: real-time quotes (not trades) — sufficient for display
  - Quote fields: ask_price, bid_price → we use midpoint as "price"
  - OHLCV fields are populated from the most recent stored DB bar so the
    change/change_pct and high/low display correctly on the frontend.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from loguru import logger

from app.core.config import settings
from app.models.database import AsyncSessionLocal, MarketData
from app.services.price_simulator import PriceTick, _fetch_latest_bars

if TYPE_CHECKING:
    from app.services.alert_service import AlertService
    from app.services.price_broadcaster import PriceConnectionManager

# ── Constants ─────────────────────────────────────────────────────────────────

_RECONNECT_BASE_S = 1.0
_RECONNECT_MAX_S  = 60.0


async def start_alpaca_stream(
    manager:       "PriceConnectionManager",
    alert_service: "AlertService | None" = None,
) -> None:
    """
    Long-running asyncio task. Connects to Alpaca's stock data WebSocket,
    subscribes to real-time quotes for ALPACA_SYMBOLS, and broadcasts each
    quote as a PriceTick — exactly as the price simulator does.

    Falls back gracefully on any connection or import error.
    Cancelled cleanly via asyncio.CancelledError on shutdown.
    """
    symbols = settings.ALPACA_SYMBOLS
    logger.info(f"Alpaca WS stream starting — symbols: {symbols}")

    # Pre-load OHLCV reference data (open/high/low/prev_close) from DB.
    # These don't change tick-to-tick and avoid a DB hit on every quote.
    ohlcv_cache: dict[str, dict] = {}
    results = await asyncio.gather(
        *[_fetch_latest_bars(s) for s in symbols],
        return_exceptions=True,
    )
    for sym, bar in zip(symbols, results):
        if isinstance(bar, Exception) or bar is None:
            logger.warning(f"Alpaca WS: no DB bar for {sym} — will use price-only ticks")
        else:
            ohlcv_cache[sym] = bar

    delay = _RECONNECT_BASE_S

    while True:
        try:
            from alpaca.data.live import StockDataStream

            stream = StockDataStream(
                api_key=settings.ALPACA_API_KEY,
                secret_key=settings.ALPACA_SECRET_KEY,
                feed="iex",           # Free IEX feed (SIP requires paid plan)
            )

            async def _on_quote(q) -> None:  # type: ignore[no-untyped-def]
                sym = q.symbol
                # Midpoint of best bid/ask as the "price"
                bid = float(getattr(q, "bid_price", 0) or 0)
                ask = float(getattr(q, "ask_price", 0) or 0)
                if bid <= 0 and ask <= 0:
                    return
                price = (bid + ask) / 2 if bid > 0 and ask > 0 else (bid or ask)

                bar = ohlcv_cache.get(sym)
                open_p      = bar["open"]       if bar else price
                high_p      = bar["high"]       if bar else price
                low_p       = bar["low"]        if bar else price
                prev_close  = bar["prev_close"] if bar else price

                change     = price - prev_close
                change_pct = change / prev_close if prev_close > 0 else 0.0

                tick = PriceTick(
                    symbol      = sym,
                    price       = round(price, 4),
                    open        = open_p,
                    high        = high_p,
                    low         = low_p,
                    prev_close  = prev_close,
                    change      = round(change, 4),
                    change_pct  = round(change_pct, 6),
                    volume      = int(getattr(q, "bid_size", 0) or 0),
                    timestamp   = datetime.now(timezone.utc).isoformat(),
                )

                await manager.broadcast_tick(tick)
                if alert_service is not None:
                    await alert_service.check_tick(tick)

            stream.subscribe_quotes(_on_quote, *symbols)

            logger.info("Alpaca WS: connected, listening for quotes…")
            delay = _RECONNECT_BASE_S  # Reset back-off on successful connect

            # stream.run() blocks until disconnected; run in executor to keep async
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, stream.run)

        except asyncio.CancelledError:
            logger.info("Alpaca WS stream shutting down")
            raise
        except Exception as exc:
            logger.warning(f"Alpaca WS disconnected ({exc!r}) — reconnecting in {delay:.0f}s")
            await asyncio.sleep(delay)
            delay = min(delay * 2, _RECONNECT_MAX_S)

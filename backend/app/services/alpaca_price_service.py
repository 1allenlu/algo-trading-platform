"""
Alpaca Price Service — Phase 13.

Optional real-time price provider using Alpaca's free paper-trading REST API.
When ALPACA_API_KEY and ALPACA_SECRET_KEY are set in config, this service
fetches the latest trade price for a symbol from Alpaca.

Falls back gracefully to None when:
  - Keys are not configured
  - The symbol is not found on Alpaca (e.g., crypto or non-US ticker)
  - The API call fails (network error, rate limit, etc.)

The paper_trading_service._get_price() calls get_alpaca_price() first and
falls back to the DB closing price if None is returned.

Price cache: 10 seconds per symbol to avoid excessive API calls during the
2-second polling interval of the paper trading dashboard.
"""

from __future__ import annotations

import time
from typing import Any

from loguru import logger

from app.core.config import settings

# In-memory cache: symbol → (timestamp, price)
_price_cache: dict[str, tuple[float, float]] = {}
_CACHE_TTL = 10   # seconds

# Lazy singleton — created on first use
_trading_client: Any = None


def _get_client() -> Any | None:
    """
    Return a lazy-initialised Alpaca TradingClient.
    Returns None if keys are not configured.
    """
    global _trading_client
    if _trading_client is not None:
        return _trading_client

    if not settings.ALPACA_API_KEY or not settings.ALPACA_SECRET_KEY:
        return None   # Keys not configured — silently skip

    try:
        from alpaca.trading.client import TradingClient
        _trading_client = TradingClient(
            api_key    = settings.ALPACA_API_KEY,
            secret_key = settings.ALPACA_SECRET_KEY,
            paper      = True,   # Always use paper trading endpoint
        )
        logger.info("[alpaca] TradingClient initialised (paper trading)")
    except Exception as exc:
        logger.warning(f"[alpaca] Failed to initialise TradingClient: {exc}")
        _trading_client = None

    return _trading_client


def get_alpaca_price(symbol: str) -> float | None:
    """
    Return the latest trade price for `symbol` from Alpaca.

    Returns None if:
      - Alpaca keys not configured
      - Symbol not found on Alpaca
      - Any API / network error

    Uses a 10-second in-memory cache to avoid hitting the API on every
    paper-trading state poll.
    """
    sym = symbol.upper()
    now = time.monotonic()

    # Check cache first
    cached = _price_cache.get(sym)
    if cached and (now - cached[0]) < _CACHE_TTL:
        return cached[1]

    client = _get_client()
    if client is None:
        return None   # Not configured — caller uses DB price

    try:
        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.data.requests import StockLatestTradeRequest

        data_client = StockHistoricalDataClient(
            api_key    = settings.ALPACA_API_KEY,
            secret_key = settings.ALPACA_SECRET_KEY,
        )
        req    = StockLatestTradeRequest(symbol_or_symbols=sym)
        trades = data_client.get_stock_latest_trade(req)
        price  = float(trades[sym].price)

        _price_cache[sym] = (now, price)
        logger.debug(f"[alpaca] {sym} latest trade = ${price:.2f}")
        return price

    except Exception as exc:
        logger.debug(f"[alpaca] Could not fetch price for {sym}: {exc}")
        return None


def alpaca_configured() -> bool:
    """Return True if Alpaca API keys are set in config."""
    return bool(settings.ALPACA_API_KEY and settings.ALPACA_SECRET_KEY)

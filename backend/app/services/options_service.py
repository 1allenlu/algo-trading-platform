"""
Options Chain Service — Phase 27.

Fetches equity options data (calls + puts) from yfinance.
Returns strike table with price, IV, volume, OI for a chosen expiry.

Public functions:
  get_expirations(symbol)                 → list of available expiry date strings
  get_options_chain(symbol, expiry=None)  → full chain for one expiry
"""

from __future__ import annotations

import math
from typing import Any

import yfinance as yf
from loguru import logger


def get_expirations(symbol: str) -> list[str]:
    """Return available option expiration dates for a symbol (YYYY-MM-DD strings)."""
    try:
        ticker = yf.Ticker(symbol.upper())
        return list(ticker.options)  # tuple → list
    except Exception as exc:
        logger.warning(f"[options] get_expirations({symbol}) failed: {exc}")
        return []


def get_options_chain(symbol: str, expiry: str | None = None) -> dict[str, Any]:
    """
    Return the full options chain for one expiration date.

    If `expiry` is None (or not found in the available list), the nearest
    expiry is used.

    Returns:
        {
          symbol, current_price, expiration, expirations,
          calls: [OptionContract], puts: [OptionContract]
        }

    OptionContract fields:
        strike, last_price, bid, ask, change, change_pct,
        volume, open_interest, implied_volatility (annualised),
        in_the_money, contract_type ("call"|"put")
    """
    sym = symbol.upper()
    try:
        ticker = yf.Ticker(sym)
        expirations: list[str] = list(ticker.options)
    except Exception as exc:
        logger.warning(f"[options] ticker init failed for {sym}: {exc}")
        return _empty(sym)

    if not expirations:
        return _empty(sym)

    # Choose expiry — default to nearest
    chosen = expiry if expiry in expirations else expirations[0]

    try:
        chain = ticker.option_chain(chosen)
    except Exception as exc:
        logger.warning(f"[options] option_chain({sym}, {chosen}) failed: {exc}")
        return _empty(sym, expirations)

    # Current underlying price
    try:
        info = ticker.fast_info
        current_price = float(info.last_price)
    except Exception:
        current_price = None

    return {
        "symbol":        sym,
        "current_price": current_price,
        "expiration":    chosen,
        "expirations":   expirations,
        "calls":         _format_contracts(chain.calls, "call"),
        "puts":          _format_contracts(chain.puts, "put"),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _format_contracts(df: Any, contract_type: str) -> list[dict]:
    rows = []
    for _, row in df.iterrows():
        iv = float(row.get("impliedVolatility", 0) or 0)
        rows.append({
            "strike":             _safe_float(row.get("strike")),
            "last_price":         _safe_float(row.get("lastPrice")),
            "bid":                _safe_float(row.get("bid")),
            "ask":                _safe_float(row.get("ask")),
            "change":             _safe_float(row.get("change")),
            "change_pct":         _safe_float(row.get("percentChange")),
            "volume":             int(_safe_float(row.get("volume")) or 0),
            "open_interest":      int(_safe_float(row.get("openInterest")) or 0),
            "implied_volatility": round(iv, 4),   # annualised fraction (e.g. 0.35 = 35%)
            "in_the_money":       bool(row.get("inTheMoney", False)),
            "contract_type":      contract_type,
        })
    return rows


def _safe_float(val: Any) -> float | None:
    try:
        f = float(val)
        return None if math.isnan(f) else round(f, 4)
    except (TypeError, ValueError):
        return None


def _empty(symbol: str, expirations: list[str] | None = None) -> dict:
    return {
        "symbol":        symbol,
        "current_price": None,
        "expiration":    None,
        "expirations":   expirations or [],
        "calls":         [],
        "puts":          [],
    }

"""
Sector Rotation Service — Phase 56.

Fetches performance data for the 11 GICS sector ETFs and computes
returns across multiple time horizons (1d, 5d, 1mo, 3mo, YTD).

Data source: yfinance (15-min delayed, cached 30 min).
In-process cache avoids hammering the yfinance API on every page load.

Public interface:
  get_sector_heatmap()  → list of SectorRow dicts
"""

from __future__ import annotations

import time
from datetime import date, timedelta
from typing import Any

import yfinance as yf
from loguru import logger

# ── Sector definitions ─────────────────────────────────────────────────────────

SECTORS = [
    {"symbol": "XLK",  "name": "Technology",          "gics": "Information Technology"},
    {"symbol": "XLF",  "name": "Financials",           "gics": "Financials"},
    {"symbol": "XLV",  "name": "Health Care",          "gics": "Health Care"},
    {"symbol": "XLY",  "name": "Consumer Disc.",       "gics": "Consumer Discretionary"},
    {"symbol": "XLP",  "name": "Consumer Staples",     "gics": "Consumer Staples"},
    {"symbol": "XLI",  "name": "Industrials",          "gics": "Industrials"},
    {"symbol": "XLC",  "name": "Comm. Services",       "gics": "Communication Services"},
    {"symbol": "XLE",  "name": "Energy",               "gics": "Energy"},
    {"symbol": "XLU",  "name": "Utilities",            "gics": "Utilities"},
    {"symbol": "XLRE", "name": "Real Estate",          "gics": "Real Estate"},
    {"symbol": "XLB",  "name": "Materials",            "gics": "Materials"},
]

_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 30 * 60   # 30 minutes


def _ytd_start() -> str:
    return date(date.today().year, 1, 1).isoformat()


def _pct(old: float, new: float) -> float | None:
    if old and old != 0:
        return round((new - old) / old * 100, 2)
    return None


def _fetch_sector(symbol: str) -> dict | None:
    """Fetch OHLCV history for one sector ETF and compute multi-period returns."""
    now = time.time()
    cached = _CACHE.get(symbol)
    if cached and (now - cached[0]) < _CACHE_TTL:
        return cached[1]

    try:
        ticker = yf.Ticker(symbol)
        # 1 year of daily data covers all horizons
        hist = ticker.history(period="1y")

        if hist.empty or len(hist) < 5:
            _CACHE[symbol] = (now, None)
            return None

        closes = hist["Close"]
        latest = float(closes.iloc[-1])

        def _ago(n_bars: int) -> float | None:
            if len(closes) > n_bars:
                return float(closes.iloc[-n_bars - 1])
            return None

        # YTD: find first bar at/after Jan 1
        ytd_start = _ytd_start()
        ytd_close = None
        for ts, price in closes.items():
            if str(ts.date()) >= ytd_start:
                ytd_close = float(price)
                break

        result = {
            "symbol":    symbol,
            "name":      next(s["name"] for s in SECTORS if s["symbol"] == symbol),
            "gics":      next(s["gics"] for s in SECTORS if s["symbol"] == symbol),
            "price":     round(latest, 2),
            "ret_1d":    _pct(_ago(1), latest),
            "ret_5d":    _pct(_ago(5), latest),
            "ret_1mo":   _pct(_ago(21), latest),
            "ret_3mo":   _pct(_ago(63), latest),
            "ret_ytd":   _pct(ytd_close, latest) if ytd_close else None,
            "volume":    int(hist["Volume"].iloc[-1]),
        }
        _CACHE[symbol] = (now, result)
        return result

    except Exception as exc:
        logger.warning(f"[sector] Failed to fetch {symbol}: {exc}")
        _CACHE[symbol] = (now, None)
        return None


def get_sector_heatmap() -> list[dict]:
    """
    Fetch and return performance data for all 11 sector ETFs.
    Errors for individual sectors return placeholder rows with None returns.
    """
    rows = []
    for s in SECTORS:
        data = _fetch_sector(s["symbol"])
        if data:
            rows.append(data)
        else:
            rows.append({
                "symbol":  s["symbol"],
                "name":    s["name"],
                "gics":    s["gics"],
                "price":   None,
                "ret_1d":  None,
                "ret_5d":  None,
                "ret_1mo": None,
                "ret_3mo": None,
                "ret_ytd": None,
                "volume":  None,
            })
    return rows

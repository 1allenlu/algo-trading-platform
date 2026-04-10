"""
Benchmark Comparison Service — Phase 61.

Fetches OHLCV for multiple benchmark symbols (SPY, QQQ, IWM, BTC-USD)
and normalises each to 100 at a common start date so they can be
overlaid on the same chart as the paper portfolio equity curve.

Public interface:
  get_benchmark_curves(symbols, days)  → dict {symbol: [{date, value}]}
"""

from __future__ import annotations

import time
from typing import Any

import yfinance as yf
from loguru import logger

_cache: dict[str, tuple[float, Any]] = {}
_TTL = 30 * 60   # 30 minutes

KNOWN_BENCHMARKS = [
    {"symbol": "SPY",     "name": "S&P 500",       "color": "#4A9EFF"},
    {"symbol": "QQQ",     "name": "Nasdaq 100",     "color": "#A78BFA"},
    {"symbol": "IWM",     "name": "Russell 2000",   "color": "#F59E0B"},
    {"symbol": "BTC-USD", "name": "Bitcoin",        "color": "#F97316"},
    {"symbol": "GLD",     "name": "Gold",           "color": "#EAB308"},
    {"symbol": "TLT",     "name": "20yr Treasuries","color": "#34D399"},
]


def _fetch_normalized(symbol: str, days: int) -> list[dict]:
    period = f"{max(days, 30)}d"
    try:
        t = yf.Ticker(symbol)
        hist = t.history(period=period)
        if hist.empty:
            return []
        closes = hist["Close"].dropna()
        if len(closes) == 0:
            return []
        base = float(closes.iloc[0])
        if base == 0:
            return []
        return [
            {"date": str(ts.date()), "value": round(float(c) / base * 100, 4)}
            for ts, c in zip(closes.index, closes)
        ]
    except Exception as exc:
        logger.warning(f"[benchmark] Failed to fetch {symbol}: {exc}")
        return []


def get_benchmark_curves(symbols: list[str], days: int = 252) -> dict[str, Any]:
    """
    Returns normalised (base=100) price curves for the requested symbols.
    Result: {symbol: [{date, value}], ...}
    """
    cache_key = f"{'-'.join(sorted(symbols))}_{days}"
    now = time.time()
    if cache_key in _cache and (now - _cache[cache_key][0]) < _TTL:
        return _cache[cache_key][1]

    result: dict[str, Any] = {"benchmarks": {}, "meta": KNOWN_BENCHMARKS}
    for sym in symbols:
        result["benchmarks"][sym] = _fetch_normalized(sym, days)

    _cache[cache_key] = (now, result)
    return result

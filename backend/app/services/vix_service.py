"""
VIX & Sentiment Service — Phase 60.

Fetches VIX, VVIX, VXN (Nasdaq vol), and the VIX term structure
(spot / 3-month / 6-month) via yfinance.  Derives a simple
fear/greed score from VIX relative to its 52-week range.

Cached 15 min — VIX only updates during market hours anyway.

Public interface:
  get_vix_snapshot()  → dict with all VIX metrics
"""

from __future__ import annotations

import time
from typing import Any

import yfinance as yf
from loguru import logger

_cache: dict[str, tuple[float, Any]] = {}
_TTL = 15 * 60   # 15 minutes


def _get_cached(key: str, fetch_fn) -> Any:
    now = time.time()
    if key in _cache and (now - _cache[key][0]) < _TTL:
        return _cache[key][1]
    result = fetch_fn()
    _cache[key] = (now, result)
    return result


def _fetch_price(symbol: str) -> float | None:
    try:
        t = yf.Ticker(symbol)
        hist = t.history(period="1d")
        if not hist.empty:
            return round(float(hist["Close"].iloc[-1]), 2)
    except Exception as exc:
        logger.warning(f"[vix] Failed to fetch {symbol}: {exc}")
    return None


def _fetch_history(symbol: str, period: str = "1y") -> list[float]:
    try:
        t = yf.Ticker(symbol)
        hist = t.history(period=period)
        return [float(c) for c in hist["Close"].tolist() if c > 0]
    except Exception:
        return []


def _fear_greed(vix: float, low_52: float, high_52: float) -> int:
    """
    Simple fear/greed score 0–100.
      Low VIX (near 52w low)  → greed (100)
      High VIX (near 52w high) → fear  (0)
    """
    if high_52 == low_52:
        return 50
    score = 100 - int((vix - low_52) / (high_52 - low_52) * 100)
    return max(0, min(100, score))


def get_vix_snapshot() -> dict:
    """Return current VIX metrics and derived sentiment."""

    def _fetch():
        vix  = _fetch_price("^VIX")
        vvix = _fetch_price("^VVIX")
        vxn  = _fetch_price("^VXN")
        vix3m = _fetch_price("^VIX3M") or _fetch_price("VIXM")   # fallback ETF
        vix6m = None   # ^VIX6M not always available

        # 52-week history for fear/greed
        hist = _fetch_history("^VIX", "1y")
        low_52  = min(hist) if hist else 10.0
        high_52 = max(hist) if hist else 40.0

        # Recent VIX history for sparkline (last 30 days)
        sparkline = hist[-30:] if hist else []

        score = _fear_greed(vix or 20.0, low_52, high_52)
        label = (
            "Extreme Greed" if score >= 75 else
            "Greed"         if score >= 55 else
            "Neutral"       if score >= 45 else
            "Fear"          if score >= 25 else
            "Extreme Fear"
        )
        label_color = (
            "#00C896" if score >= 75 else
            "#86efac" if score >= 55 else
            "#94a3b8" if score >= 45 else
            "#f97316" if score >= 25 else
            "#FF6B6B"
        )

        return {
            "vix":         vix,
            "vvix":        vvix,
            "vxn":         vxn,
            "vix3m":       vix3m,
            "vix6m":       vix6m,
            "low_52w":     round(low_52, 2),
            "high_52w":    round(high_52, 2),
            "fear_greed":  score,
            "label":       label,
            "label_color": label_color,
            "sparkline":   [round(v, 2) for v in sparkline],
            "regime": (
                "low_vol"    if (vix or 20) < 15 else
                "normal_vol" if (vix or 20) < 25 else
                "elevated"   if (vix or 20) < 35 else
                "panic"
            ),
        }

    return _get_cached("vix_snapshot", _fetch)

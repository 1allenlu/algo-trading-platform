"""
Technical Pattern Recognition Service — Phase 41.

Detects classic candlestick patterns on OHLCV data using pure NumPy/pandas.
No external TA library required — patterns are implemented from first principles.

Patterns detected:
  - Doji              (open ≈ close, small body relative to range)
  - Hammer            (small upper shadow, long lower shadow, small body)
  - Shooting Star     (small lower shadow, long upper shadow, small body)
  - Bullish Engulfing (green candle body engulfs prior red candle body)
  - Bearish Engulfing (red candle body engulfs prior green candle body)
  - Morning Star      (3-bar reversal at bottom)
  - Evening Star      (3-bar reversal at top)
  - Three White Soldiers  (3 consecutive rising closes)
  - Three Black Crows     (3 consecutive falling closes)

Public function:
  detect_patterns(closes, opens, highs, lows, limit)
    → list[PatternSignal]  (sorted by date desc, most recent first)
"""

from __future__ import annotations

import pandas as pd
import numpy as np


# ── Helpers ───────────────────────────────────────────────────────────────────

def _body(o: float, c: float) -> float:
    return abs(c - o)

def _upper_shadow(o: float, h: float, c: float) -> float:
    return h - max(o, c)

def _lower_shadow(o: float, l: float, c: float) -> float:
    return min(o, c) - l

def _candle_range(h: float, l: float) -> float:
    return h - l


# ── Pattern detection functions ───────────────────────────────────────────────

def _is_doji(o: float, h: float, l: float, c: float) -> bool:
    """Body is ≤ 5% of the total range."""
    rng = _candle_range(h, l)
    if rng == 0:
        return False
    return _body(o, c) / rng <= 0.05


def _is_hammer(o: float, h: float, l: float, c: float) -> bool:
    """Lower shadow ≥ 2× body; upper shadow ≤ 10% of range; body in upper 1/3."""
    body = _body(o, c)
    rng  = _candle_range(h, l)
    if rng == 0 or body == 0:
        return False
    lower = _lower_shadow(o, l, c)
    upper = _upper_shadow(o, h, c)
    return lower >= 2 * body and upper <= 0.1 * rng


def _is_shooting_star(o: float, h: float, l: float, c: float) -> bool:
    """Upper shadow ≥ 2× body; lower shadow ≤ 10% of range; body in lower 1/3."""
    body = _body(o, c)
    rng  = _candle_range(h, l)
    if rng == 0 or body == 0:
        return False
    lower = _lower_shadow(o, l, c)
    upper = _upper_shadow(o, h, c)
    return upper >= 2 * body and lower <= 0.1 * rng


def detect_patterns(
    df: pd.DataFrame,
    limit: int = 252,
) -> list[dict]:
    """
    Scan the last `limit` bars for candlestick patterns.

    df must have columns: timestamp, open, high, low, close (indexed 0..n-1)
    Returns list of dicts: {date, pattern, signal, close}
    """
    df = df.tail(limit).reset_index(drop=True)
    results: list[dict] = []

    opens  = df["open"].values.astype(float)
    highs  = df["high"].values.astype(float)
    lows   = df["low"].values.astype(float)
    closes = df["close"].values.astype(float)
    dates  = df["timestamp"].astype(str).str[:10].values

    n = len(df)

    for i in range(n):
        o, h, l, c = opens[i], highs[i], lows[i], closes[i]
        date = dates[i]

        # Single-bar patterns
        if _is_doji(o, h, l, c):
            results.append({
                "date":    date,
                "pattern": "Doji",
                "signal":  "neutral",
                "close":   round(float(c), 4),
                "bar_index": i,
            })

        if _is_hammer(o, h, l, c):
            results.append({
                "date":    date,
                "pattern": "Hammer",
                "signal":  "bullish",
                "close":   round(float(c), 4),
                "bar_index": i,
            })

        if _is_shooting_star(o, h, l, c):
            results.append({
                "date":    date,
                "pattern": "Shooting Star",
                "signal":  "bearish",
                "close":   round(float(c), 4),
                "bar_index": i,
            })

    # Two-bar patterns
    for i in range(1, n):
        o0, h0, l0, c0 = opens[i-1], highs[i-1], lows[i-1], closes[i-1]
        o1, h1, l1, c1 = opens[i],   highs[i],   lows[i],   closes[i]
        date = dates[i]

        # Bullish Engulfing: prev red, curr green, body engulfs
        if c0 < o0 and c1 > o1 and o1 < c0 and c1 > o0:
            results.append({
                "date":    date,
                "pattern": "Bullish Engulfing",
                "signal":  "bullish",
                "close":   round(float(c1), 4),
                "bar_index": i,
            })

        # Bearish Engulfing: prev green, curr red, body engulfs
        if c0 > o0 and c1 < o1 and o1 > c0 and c1 < o0:
            results.append({
                "date":    date,
                "pattern": "Bearish Engulfing",
                "signal":  "bearish",
                "close":   round(float(c1), 4),
                "bar_index": i,
            })

    # Three-bar patterns
    for i in range(2, n):
        o0, c0 = opens[i-2], closes[i-2]
        o1, c1 = opens[i-1], closes[i-1]
        o2, c2 = opens[i],   closes[i]
        date = dates[i]

        # Morning Star: red, small-body, green — reversal at bottom
        body0 = _body(o0, c0)
        body1 = _body(o1, c1)
        body2 = _body(o2, c2)
        avg_body = (body0 + body2) / 2
        if (
            c0 < o0 and                  # bar 0: red
            body1 < 0.3 * avg_body and   # bar 1: small body (star)
            c2 > o2 and                  # bar 2: green
            c2 > (o0 + c0) / 2          # bar 2 close above midpoint of bar 0
        ):
            results.append({
                "date":    date,
                "pattern": "Morning Star",
                "signal":  "bullish",
                "close":   round(float(c2), 4),
                "bar_index": i,
            })

        # Evening Star: green, small-body, red — reversal at top
        if (
            c0 > o0 and                  # bar 0: green
            body1 < 0.3 * avg_body and   # bar 1: small body (star)
            c2 < o2 and                  # bar 2: red
            c2 < (o0 + c0) / 2          # bar 2 close below midpoint of bar 0
        ):
            results.append({
                "date":    date,
                "pattern": "Evening Star",
                "signal":  "bearish",
                "close":   round(float(c2), 4),
                "bar_index": i,
            })

        # Three White Soldiers: 3 consecutive green candles each closing higher
        if c0 > o0 and c1 > o1 and c2 > o2 and c1 > c0 and c2 > c1:
            results.append({
                "date":    date,
                "pattern": "Three White Soldiers",
                "signal":  "bullish",
                "close":   round(float(c2), 4),
                "bar_index": i,
            })

        # Three Black Crows: 3 consecutive red candles each closing lower
        if c0 < o0 and c1 < o1 and c2 < o2 and c1 < c0 and c2 < c1:
            results.append({
                "date":    date,
                "pattern": "Three Black Crows",
                "signal":  "bearish",
                "close":   round(float(c2), 4),
                "bar_index": i,
            })

    # Remove bar_index helper, deduplicate same date+pattern, sort newest-first
    seen: set[tuple] = set()
    unique: list[dict] = []
    for r in reversed(results):   # iterate newest first
        key = (r["date"], r["pattern"])
        if key not in seen:
            seen.add(key)
            r.pop("bar_index", None)
            unique.append(r)

    return unique

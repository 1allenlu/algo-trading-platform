"""
Regime Detection Service — Phase 35.

Classifies each trading day as Bull / Bear / Sideways using a rolling
20-day return threshold approach (rule-based, no model required).

Classification rules:
  ret20 > +5%  → "bull"
  ret20 < -5%  → "bear"
  otherwise    → "sideways"

The threshold is intentionally simple and transparent — a practitioner can
swap in an HMM (hmmlearn) or Markov-switching model later by replacing
`_classify_series()` without changing the API contract.
"""

from __future__ import annotations

import pandas as pd
from loguru import logger


# Rolling window and thresholds (can be made configurable later)
WINDOW     = 20     # trading days
BULL_THRESH = 0.05  # +5% rolling return → bull
BEAR_THRESH = -0.05 # -5% rolling return → bear


def detect_regimes(
    closes: pd.Series,
    limit: int = 252,
) -> dict:
    """
    Classify each bar in `closes` as bull / bear / sideways.

    Parameters
    ----------
    closes : pd.Series of daily closing prices, sorted ascending, indexed by date
    limit  : maximum number of bars to return (most recent N)

    Returns
    -------
    {
      "bars": [{"date": str, "close": float, "regime": str, "ret20": float}, ...],
      "current": str,
      "bull_pct": float,
      "bear_pct": float,
      "sideways_pct": float,
    }
    """
    if len(closes) < WINDOW + 1:
        raise ValueError(
            f"Need at least {WINDOW + 1} bars of price history for regime detection."
        )

    closes = closes.sort_index()

    # 20-day rolling return
    ret20 = closes.pct_change(WINDOW)

    # Classify
    regime = ret20.apply(_classify)

    # Combine into a DataFrame, drop leading NaNs
    df = pd.DataFrame({
        "close":  closes,
        "ret20":  ret20,
        "regime": regime,
    }).dropna()

    # Keep most recent `limit` bars
    df = df.iloc[-limit:]

    bars = []
    for idx, row in df.iterrows():
        date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
        bars.append({
            "date":   date_str,
            "close":  round(float(row["close"]), 4),
            "regime": str(row["regime"]),
            "ret20":  round(float(row["ret20"]), 6),
        })

    if not bars:
        return {
            "bars":         [],
            "current":      "sideways",
            "bull_pct":     0.0,
            "bear_pct":     0.0,
            "sideways_pct": 1.0,
        }

    regimes = [b["regime"] for b in bars]
    total   = len(regimes)

    return {
        "bars":         bars,
        "current":      regimes[-1],
        "bull_pct":     round(regimes.count("bull")     / total, 4),
        "bear_pct":     round(regimes.count("bear")     / total, 4),
        "sideways_pct": round(regimes.count("sideways") / total, 4),
    }


def _classify(ret: float) -> str:
    if pd.isna(ret):
        return "sideways"
    if ret > BULL_THRESH:
        return "bull"
    if ret < BEAR_THRESH:
        return "bear"
    return "sideways"

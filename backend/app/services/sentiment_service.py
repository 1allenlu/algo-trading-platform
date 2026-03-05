"""
Sentiment service — Phase 6.

Derives a market sentiment score entirely from OHLCV price/momentum patterns.
No external data source required — uses only closing prices already in the DB.

Scoring model (three additive components, clamped to [-1, +1]):

  Component 1 — RSI(14)                         weight: ±0.5
    RSI > 70  → overbought (bearish signal)
    RSI < 30  → oversold   (bullish signal)
    RSI 40-60 → neutral band
    Linear interpolation in transition zones (60-70 and 30-40).

  Component 2 — Price vs SMA(50)                weight: ±0.3
    price > SMA50 * 1.02  → bullish momentum
    price < SMA50 * 0.98  → bearish momentum
    else                  → neutral

  Component 3 — Price vs SMA(200)               weight: ±0.2
    price > SMA200 → long-term uptrend (bullish)
    price < SMA200 → long-term downtrend (bearish)

Final label:
  score >= +0.4  → "bullish"
  score <= -0.4  → "bearish"
  else           → "neutral"
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

# Import indicator functions from the mounted ml-engine package.
# The docker-compose.yml adds PYTHONPATH=/ so `import ml_engine` works.
from ml_engine.features.technical import rsi, sma


def compute_sentiment(df: pd.DataFrame) -> dict[str, Any]:
    """
    Compute sentiment score from a single-symbol OHLCV DataFrame.

    Args:
        df: DataFrame with at minimum a 'close' column, indexed by timestamp
            in ascending chronological order. Requires >= 200 rows for SMA(200).

    Returns:
        {
          "score":           float,  # [-1, +1] composite
          "label":           str,    # "bullish" | "bearish" | "neutral"
          "rsi_14":          float,  # Latest RSI value (0-100)
          "price_vs_sma50":  float,  # (close / sma50 - 1) as fraction
          "price_vs_sma200": float,  # (close / sma200 - 1) as fraction
          "components": {
            "rsi_component":    float,
            "sma50_component":  float,
            "sma200_component": float,
          }
        }
    """
    close = df["close"]
    latest_close = float(close.iloc[-1])

    # ── Compute indicators ────────────────────────────────────────────────────
    rsi_series   = rsi(close, 14)
    sma50_series = sma(close, 50)
    sma200_series = sma(close, 200)

    latest_rsi    = float(rsi_series.iloc[-1])
    latest_sma50  = float(sma50_series.iloc[-1])
    latest_sma200 = float(sma200_series.iloc[-1])

    # ── Component 1: RSI score ────────────────────────────────────────────────
    # Continuous mapping so small RSI changes have small score effects.
    if latest_rsi > 70:
        # Overbought zone: RSI 70→100 maps to score 0→-0.5
        rsi_score = -0.5 * (latest_rsi - 70) / 30
        rsi_score = max(rsi_score, -0.5)
    elif latest_rsi > 60:
        # Transition zone 60-70: score fades from 0 toward -0.5
        rsi_score = -0.5 * (latest_rsi - 60) / 10
    elif latest_rsi < 30:
        # Oversold zone: RSI 30→0 maps to score 0→+0.5
        rsi_score = 0.5 * (30 - latest_rsi) / 30
        rsi_score = min(rsi_score, 0.5)
    elif latest_rsi < 40:
        # Transition zone 40-30: score fades from 0 toward +0.5
        rsi_score = 0.5 * (40 - latest_rsi) / 10
    else:
        # Neutral band (RSI 40-60)
        rsi_score = 0.0

    # ── Component 2: Price vs SMA(50) ─────────────────────────────────────────
    price_vs_sma50 = (latest_close / latest_sma50 - 1) if latest_sma50 > 0 else 0.0
    if price_vs_sma50 > 0.02:
        sma50_score = 0.3
    elif price_vs_sma50 < -0.02:
        sma50_score = -0.3
    else:
        sma50_score = 0.0

    # ── Component 3: Price vs SMA(200) ────────────────────────────────────────
    price_vs_sma200 = (latest_close / latest_sma200 - 1) if latest_sma200 > 0 else 0.0
    sma200_score = 0.2 if price_vs_sma200 > 0 else -0.2

    # ── Composite score ────────────────────────────────────────────────────────
    total = float(np.clip(rsi_score + sma50_score + sma200_score, -1.0, 1.0))

    if total >= 0.4:
        label = "bullish"
    elif total <= -0.4:
        label = "bearish"
    else:
        label = "neutral"

    return {
        "score":           round(total, 4),
        "label":           label,
        "rsi_14":          round(latest_rsi, 2),
        "price_vs_sma50":  round(price_vs_sma50, 4),
        "price_vs_sma200": round(price_vs_sma200, 4),
        "components": {
            "rsi_component":    round(rsi_score, 4),
            "sma50_component":  round(sma50_score, 4),
            "sma200_component": round(sma200_score, 4),
        },
    }

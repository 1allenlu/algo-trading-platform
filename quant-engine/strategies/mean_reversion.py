"""
Mean Reversion Strategy — Bollinger Band Signals.

Hypothesis: large deviations from a moving average tend to revert.
When price strays far outside its typical trading range (±2σ), it is
statistically likely to return toward the mean.

Best suited for:
  - Range-bound markets (indices, broad ETFs like SPY/QQQ)
  - High-liquidity assets with low transaction costs

Underperforms in:
  - Strong trending markets (momentum dominates)
  - Low-liquidity stocks (signal degrades, costs eat returns)

Algorithm:
  1. Compute SMA(window) and Bollinger Bands: SMA ± num_std * rolling_std
  2. Measure BB %B: normalized position within the bands
     %B = (price - lower) / (upper - lower) — 0=lower band, 1=upper band
  3. Entry: price crosses below lower band (oversold) → go long
             price crosses above upper band (overbought) → go short
  4. Exit:  price returns within 10% of SMA → take profit
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .base import BaseStrategy


class MeanReversionStrategy(BaseStrategy):
    """
    Single or multi-asset mean reversion using Bollinger Bands.

    Args:
        window:       SMA and rolling std lookback (default 20 days).
        num_std:      Number of standard deviations for band width (default 2.0).
        position_size: Fraction of portfolio per asset (default 0.5).
    """

    name = "mean_reversion"

    def __init__(
        self,
        window:        int   = 20,
        num_std:       float = 2.0,
        position_size: float = 0.5,
    ):
        self.window        = window
        self.num_std       = num_std
        self.position_size = position_size

    def generate_signals(self, data: dict[str, pd.DataFrame]) -> pd.DataFrame:
        """
        Generate long/short signals for each symbol using Bollinger Bands.

        The %B indicator positions price within the Bollinger Band:
          %B  =  (price - lower_band) / (upper_band - lower_band)
          %B > 1  → overbought (above upper band) → short
          %B < 0  → oversold  (below lower band) → long
          %B ≈ 0.5 → at SMA → exit position
        """
        all_signals: dict[str, pd.Series] = {}

        for sym, df in data.items():
            close = df["close"].sort_index()

            # Bollinger Bands
            sma   = close.rolling(self.window).mean()
            std   = close.rolling(self.window).std()
            upper = sma + self.num_std * std
            lower = sma - self.num_std * std
            band_width = upper - lower + 1e-10

            # %B: 0 = at lower band, 1 = at upper band
            pct_b = (close - lower) / band_width

            signal   = pd.Series(0.0, index=close.index)
            position = 0

            for i in range(len(close)):
                pb = pct_b.iloc[i]
                if np.isnan(pb):
                    continue

                if position == 0:
                    if pb < 0.0:     # Price crossed below lower band → long
                        position = 1
                    elif pb > 1.0:   # Price crossed above upper band → short
                        position = -1
                else:
                    # Exit when price returns close to SMA (50% of band)
                    if abs(pb - 0.5) < 0.1:
                        position = 0
                    # Reverse if price hits the opposite extreme
                    elif position == 1 and pb > 1.0:
                        position = -1
                    elif position == -1 and pb < 0.0:
                        position = 1

                signal.iloc[i] = float(position) * self.position_size

            all_signals[sym] = signal

        return pd.DataFrame(all_signals)

    def get_default_params(self) -> dict:
        return {
            "window":        self.window,
            "num_std":       self.num_std,
            "position_size": self.position_size,
        }

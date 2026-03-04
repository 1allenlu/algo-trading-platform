"""
Cross-Sectional Momentum Strategy.

Based on Jegadeesh & Titman (1993): stocks that performed well over the past
6–12 months tend to continue outperforming over the next 3–12 months.

Algorithm:
  1. Each month, rank all assets by their 12-1 month return (skip last month).
     Skipping the last month avoids the short-term reversal effect where
     last-month winners tend to reverse.
  2. Go equally long in the top N performers.
     (We only go long — simpler, more realistic for retail traders.)
  3. Hold until next rebalance.

Why equal weighting?
  Simple, robust, and avoids over-concentrating in the single top performer.
  Risk-parity weighting could improve Sharpe but adds complexity.

Typical performance: Sharpe ~0.5–1.0 in US equities (pre-cost).
Main risk: momentum crashes — sharp reversals during market stress.
"""

from __future__ import annotations

import pandas as pd

from .base import BaseStrategy


class MomentumStrategy(BaseStrategy):
    """
    Cross-sectional momentum with monthly rebalancing.

    Args:
        lookback_months: Return window for ranking (default 12 months).
        skip_months:     Months to skip at end of window to avoid reversal (default 1).
        top_n:           Number of top-ranked assets to hold long (default 2).
        rebalance_freq:  Pandas offset alias for rebalance schedule (default "ME" = month-end).
    """

    name = "momentum"

    def __init__(
        self,
        lookback_months: int = 12,
        skip_months:     int = 1,
        top_n:           int = 2,
        rebalance_freq:  str = "ME",   # "ME" = month-end, "QE" = quarter-end
    ):
        self.lookback_months = lookback_months
        self.skip_months     = skip_months
        self.top_n           = top_n
        self.rebalance_freq  = rebalance_freq

    def generate_signals(self, data: dict[str, pd.DataFrame]) -> pd.DataFrame:
        """
        Generate equal-weight long signals for top momentum assets.

        Returns a DataFrame where each cell is either:
          1/top_n  (long, equal weight among winners)
          0        (not selected)
        """
        # Build aligned close price matrix
        closes = pd.DataFrame(
            {sym: df["close"] for sym, df in data.items()}
        ).sort_index().ffill()

        # Momentum score: return from (lookback) months ago to (skip) months ago
        # Example: lookback=12, skip=1 → return from 12 months ago to 1 month ago
        lookback_days = self.lookback_months * 21   # ~21 trading days per month
        skip_days     = self.skip_months * 21

        # pct_change across the lookback window, ignoring the skip period
        mom_score = closes.shift(skip_days) / closes.shift(lookback_days) - 1

        # Month-end rebalance dates within our data range
        rebalance_dates = set(
            pd.date_range(
                start=closes.index[0],
                end=closes.index[-1],
                freq=self.rebalance_freq,
            ).normalize()
        )
        # Normalize index too, to handle timezone-aware comparisons
        normalized_index = closes.index.normalize()

        signals       = pd.DataFrame(0.0, index=closes.index, columns=closes.columns)
        current_alloc = pd.Series(0.0, index=closes.columns)

        for i, dt in enumerate(closes.index):
            # Rebalance on month-end (or first day of data)
            if normalized_index[i] in rebalance_dates or i == 0:
                scores = mom_score.iloc[i]
                valid  = scores.dropna()
                n      = min(self.top_n, len(valid))
                if n > 0:
                    winners       = valid.nlargest(n).index
                    current_alloc = pd.Series(0.0, index=closes.columns)
                    current_alloc[winners] = 1.0 / n   # Equal weight

            signals.iloc[i] = current_alloc

        return signals

    def get_default_params(self) -> dict:
        return {
            "lookback_months": self.lookback_months,
            "skip_months":     self.skip_months,
            "top_n":           self.top_n,
            "rebalance_freq":  self.rebalance_freq,
        }

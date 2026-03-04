"""
Pairs Trading Strategy — Engle-Granger Cointegration.

Two assets whose prices tend to move together (cointegrated) will occasionally
diverge. This strategy bets on the divergence reverting to the historical mean.

Algorithm:
  1. Fit hedge ratio: OLS(price_A ~ price_B) on training period (first 60% of data)
     hedge_ratio answers: "how many $ of B neutralizes $1 of A?"
  2. Spread = price_A - hedge_ratio * price_B
     A stationary spread (confirmed by Engle-Granger test) means the pair
     is cointegrated and the spread will mean-revert.
  3. Z-score = (spread - rolling_mean) / rolling_std  (60-day window)
  4. Entry:  |z| > entry_threshold (default 2.0) → bet on reversion
     - z > +2: spread too wide   → short A, long B
     - z < -2: spread too narrow → long A, short B
  5. Exit:   |z| < exit_threshold (default 0.5) → spread converged, take profit
     Stop:   |z| > stop_loss (default 3.5) → diverging further, cut losses
     Time:   position held > max_holding days → forced exit

Why OLS on training period only?
  Fitting the hedge ratio on ALL data would introduce lookahead bias — we'd be
  using future prices to determine today's trade. Using the first 60% ensures
  the signal generation is fully out-of-sample.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from statsmodels.regression.linear_model import OLS
from statsmodels.tsa.stattools import coint

from .base import BaseStrategy


class PairsTradingStrategy(BaseStrategy):
    """
    Dollar-neutral pairs trading on a cointegrated pair.

    Args:
        entry_threshold: Z-score level to enter a position (default 2.0).
        exit_threshold:  Z-score level to exit a position (default 0.5).
        stop_loss:       Z-score level to cut losses if spread keeps widening.
        lookback:        Rolling window (days) for z-score normalization.
        max_holding:     Max days to hold before forced exit.
        train_frac:      Fraction of data used to estimate hedge ratio (no lookahead).
        position_size:   Weight allocated to each leg, e.g. 0.5 = 50% per side.
    """

    name = "pairs_trading"

    def __init__(
        self,
        entry_threshold: float = 2.0,
        exit_threshold:  float = 0.5,
        stop_loss:       float = 3.5,
        lookback:        int   = 60,
        max_holding:     int   = 30,
        train_frac:      float = 0.6,
        position_size:   float = 0.5,
    ):
        self.entry_threshold = entry_threshold
        self.exit_threshold  = exit_threshold
        self.stop_loss       = stop_loss
        self.lookback        = lookback
        self.max_holding     = max_holding
        self.train_frac      = train_frac
        self.position_size   = position_size

    # ── Helpers ───────────────────────────────────────────────────────────────

    def check_cointegration(
        self, price_a: pd.Series, price_b: pd.Series
    ) -> tuple[bool, float]:
        """
        Engle-Granger two-step cointegration test.

        Returns (is_cointegrated, p_value).
        p_value < 0.05 means the spread is stationary → pairs trade is valid.
        """
        _, p_value, _ = coint(price_a, price_b)
        return bool(p_value < 0.05), float(p_value)

    def _fit_hedge_ratio(
        self, price_a: pd.Series, price_b: pd.Series
    ) -> float:
        """
        OLS regression: price_A = hedge_ratio * price_B + ε
        Only fit on the training portion to avoid lookahead bias.
        """
        n_train = max(int(len(price_a) * self.train_frac), self.lookback * 2)
        n_train = min(n_train, len(price_a))
        result  = OLS(price_a.iloc[:n_train], price_b.iloc[:n_train]).fit()
        return float(result.params.iloc[0])

    def _rolling_zscore(self, spread: pd.Series) -> pd.Series:
        """Normalize spread to a z-score using rolling mean and std (no lookahead)."""
        mean = spread.rolling(self.lookback).mean()
        std  = spread.rolling(self.lookback).std()
        return (spread - mean) / (std + 1e-10)

    # ── Main ──────────────────────────────────────────────────────────────────

    def generate_signals(self, data: dict[str, pd.DataFrame]) -> pd.DataFrame:
        """
        Generate long/short signals for the pair.

        Signal interpretation:
          sig_A = +position_size, sig_B = -position_size → long spread (long A, short B)
          sig_A = -position_size, sig_B = +position_size → short spread (short A, long B)
          Both = 0 → flat
        """
        if len(data) != 2:
            raise ValueError("Pairs trading requires exactly 2 symbols")

        sym_a, sym_b = list(data.keys())
        close_a = data[sym_a]["close"].sort_index()
        close_b = data[sym_b]["close"].sort_index()

        # Align on shared trading days
        close_a, close_b = close_a.align(close_b, join="inner")

        hedge_ratio = self._fit_hedge_ratio(close_a, close_b)
        spread      = close_a - hedge_ratio * close_b
        zscore      = self._rolling_zscore(spread)

        # State machine: iterate day-by-day to track position + holding period.
        # We can't vectorize because entry depends on the previous position state.
        sig_a     = pd.Series(0.0, index=zscore.index)
        sig_b     = pd.Series(0.0, index=zscore.index)
        position  = 0    # 0=flat, 1=long_spread, -1=short_spread
        entry_idx = None

        for i in range(len(zscore)):
            z = zscore.iloc[i]
            if np.isnan(z):
                continue

            if position == 0:
                if z > self.entry_threshold:
                    position  = -1   # Short spread: spread will shrink
                    entry_idx = i
                elif z < -self.entry_threshold:
                    position  = 1    # Long spread: spread will grow
                    entry_idx = i
            else:
                days_held = (i - entry_idx) if entry_idx is not None else 0
                if (
                    abs(z) < self.exit_threshold
                    or abs(z) > self.stop_loss
                    or days_held >= self.max_holding
                ):
                    position  = 0
                    entry_idx = None

            sig_a.iloc[i] = float(position) * self.position_size
            sig_b.iloc[i] = float(-position) * self.position_size

        return pd.DataFrame({sym_a: sig_a, sym_b: sig_b})

    def get_default_params(self) -> dict:
        return {
            "entry_threshold": self.entry_threshold,
            "exit_threshold":  self.exit_threshold,
            "stop_loss":       self.stop_loss,
            "lookback":        self.lookback,
            "max_holding":     self.max_holding,
        }

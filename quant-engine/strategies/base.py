"""
Abstract base class for all quant trading strategies.

Every strategy must implement:
  - generate_signals(data): given OHLCV DataFrames, return a signal DataFrame
  - get_default_params(): return a dict of default parameter values

Signal convention:
  +1  = 100% long that asset
  -1  = 100% short that asset
   0  = flat (no position)
  Fractional values are allowed (e.g., 0.5 = half-sized position).
  Multi-asset: columns represent different symbols.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd


class BaseStrategy(ABC):
    """Common interface for all trading strategies."""

    name: str = "base"

    @abstractmethod
    def generate_signals(self, data: dict[str, pd.DataFrame]) -> pd.DataFrame:
        """
        Convert OHLCV data into trading signals.

        Args:
            data: dict mapping symbol → OHLCV DataFrame
                  Each DataFrame has columns: open, high, low, close, volume
                  Indexed by timezone-aware or naive datetime.

        Returns:
            DataFrame indexed by date, one column per symbol.
            Values: position weights in [-1, +1].
        """
        ...

    @abstractmethod
    def get_default_params(self) -> dict:
        """Return a dict of {param_name: default_value} for this strategy."""
        ...

"""Strategy registry — maps strategy names to their classes."""

from .base import BaseStrategy
from .mean_reversion import MeanReversionStrategy
from .momentum import MomentumStrategy
from .pairs_trading import PairsTradingStrategy

# ── Registry ──────────────────────────────────────────────────────────────────
# Central map of strategy name → class. Add new strategies here.

REGISTRY: dict[str, type[BaseStrategy]] = {
    "pairs_trading":   PairsTradingStrategy,
    "momentum":        MomentumStrategy,
    "mean_reversion":  MeanReversionStrategy,
}

# Human-readable metadata for the API / frontend
STRATEGY_INFO: dict[str, dict] = {
    "pairs_trading": {
        "name":            "Pairs Trading",
        "description":     "Cointegration-based stat-arb. Trades the spread between two correlated assets back toward its historical mean.",
        "method":          "Engle-Granger cointegration + OLS hedge ratio",
        "default_symbols": ["SPY", "QQQ"],
        "min_symbols":     2,
        "max_symbols":     2,
        "tags":            ["market-neutral", "mean-reverting", "stat-arb"],
    },
    "momentum": {
        "name":            "Cross-Sectional Momentum",
        "description":     "Ranks assets by 12-1 month return and goes long the top performers. Rebalances monthly.",
        "method":          "Jegadeesh-Titman (1993) momentum factor",
        "default_symbols": ["SPY", "QQQ", "AAPL", "MSFT", "NVDA"],
        "min_symbols":     3,
        "max_symbols":     20,
        "tags":            ["long-only", "trend-following", "factor"],
    },
    "mean_reversion": {
        "name":            "Mean Reversion",
        "description":     "Fades large price moves using Bollinger Bands. Long when oversold, short when overbought.",
        "method":          "Bollinger Band %B with SMA reversion exit",
        "default_symbols": ["SPY"],
        "min_symbols":     1,
        "max_symbols":     5,
        "tags":            ["contrarian", "mean-reverting", "volatility"],
    },
}


def get_strategy(name: str, params: dict | None = None) -> BaseStrategy:
    """Instantiate a strategy by name with optional parameter overrides."""
    cls = REGISTRY.get(name)
    if cls is None:
        raise ValueError(f"Unknown strategy '{name}'. Available: {list(REGISTRY)}")
    return cls(**(params or {}))

"""
Value at Risk (VaR) and Conditional VaR (CVaR) calculations.

VaR answers: "What is the maximum loss I expect with X% confidence over 1 day?"
CVaR answers: "If I exceed VaR, what is my expected loss?" (the average of the tail)

Three methods:
  Historical:    Directly use empirical return percentiles. No distribution assumption.
                 Most accurate if history is representative. Sensitive to sample size.
  Parametric:    Assume returns are normally distributed. Fast, analytical.
                 Underestimates tail risk (fat tails in real markets).
  Cornish-Fisher: Parametric VaR adjusted for observed skewness and kurtosis.
                 Better than plain parametric for non-normal returns.

All values are returned as positive fractions (e.g., 0.025 = lose 2.5% of portfolio).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import norm


def historical_var(returns: pd.Series, confidence: float = 0.95) -> float:
    """
    Historical simulation VaR.
    Ranks observed daily returns and finds the (1 - confidence) percentile.

    Example: 95% VaR = the 5th percentile of daily returns, negated.
    """
    if len(returns) < 10:
        return float("nan")
    return float(-np.percentile(returns.dropna(), (1 - confidence) * 100))


def parametric_var(returns: pd.Series, confidence: float = 0.95) -> float:
    """
    Parametric (variance-covariance) VaR.
    Assumes returns are normally distributed.

    VaR = -(μ + z_α * σ)
    where z_α is the confidence-level quantile of the standard normal distribution.
    """
    r = returns.dropna()
    if len(r) < 10:
        return float("nan")
    mu    = float(r.mean())
    sigma = float(r.std())
    z     = norm.ppf(1 - confidence)   # e.g. -1.645 for 95%
    return float(-(mu + z * sigma))


def cornish_fisher_var(returns: pd.Series, confidence: float = 0.95) -> float:
    """
    Cornish-Fisher adjusted VaR — accounts for skewness and excess kurtosis.

    Most real return distributions have negative skew (large drawdowns more likely
    than large gains) and excess kurtosis (fat tails). This adjustment improves
    on plain parametric VaR without requiring a full non-parametric approach.
    """
    r = returns.dropna()
    if len(r) < 30:
        return parametric_var(returns, confidence)

    mu    = float(r.mean())
    sigma = float(r.std())
    skew  = float(r.skew())
    kurt  = float(r.kurt())      # Excess kurtosis (normal = 0)
    z     = norm.ppf(1 - confidence)

    # Cornish-Fisher expansion of the quantile
    z_cf = (
        z
        + (z**2 - 1) * skew / 6
        + (z**3 - 3 * z) * kurt / 24
        - (2 * z**3 - 5 * z) * skew**2 / 36
    )
    return float(-(mu + z_cf * sigma))


def cvar(returns: pd.Series, confidence: float = 0.95) -> float:
    """
    Conditional VaR (CVaR) / Expected Shortfall (ES).

    The average loss given that the loss exceeds VaR.
    Always >= VaR; a more conservative risk measure.
    Required by Basel III for internal risk models.
    """
    r   = returns.dropna()
    var = historical_var(r, confidence)
    # Tail: all returns worse than -VaR (negative returns beyond the threshold)
    tail = r[r <= -var]
    return float(-tail.mean()) if len(tail) > 0 else var


def portfolio_var(
    weights:    np.ndarray,
    returns_df: pd.DataFrame,
    confidence: float = 0.95,
) -> float:
    """
    Historical VaR for a multi-asset portfolio given weight vector.

    Computes daily portfolio returns then applies historical VaR.
    """
    port_returns = (returns_df * weights).sum(axis=1)
    return historical_var(port_returns, confidence)

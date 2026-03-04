"""
Mean-Variance Portfolio Optimization (Markowitz, 1952).

Harry Markowitz showed that for a given expected return level, there exists
a portfolio with minimum variance — the "efficient frontier." Portfolios on
this frontier are called Pareto-optimal (can't improve return without more risk).

Two approaches used here:
  1. Monte Carlo simulation: generate thousands of random long-only portfolios.
     Fast, visual, shows the full shape of the portfolio possibility space.
     The cloud of portfolios makes the efficient frontier obvious.

  2. Constrained optimization (scipy): solve the exact min-variance problem
     for specific targets (max Sharpe, min vol) and for the frontier itself.
     More precise than Monte Carlo but requires scipy.

Assumptions:
  - Long-only (w_i >= 0): no short selling
  - Fully invested (sum(w) = 1): 100% allocation
  - Risk-free rate: 4% annual (for Sharpe calculation)
  - Expected returns estimated from historical daily returns × 252
  - Covariance matrix estimated from daily returns × 252

Limitations:
  - Historical returns are a noisy estimate of future returns
  - Optimization is sensitive to small changes in expected returns
  - In practice, add regularization (shrinkage) or use Black-Litterman
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize

TRADING_DAYS = 252
RISK_FREE     = 0.04


# ── Random portfolio simulation ───────────────────────────────────────────────

def generate_random_portfolios(
    returns_df: pd.DataFrame,
    n:          int = 1000,
) -> list[dict]:
    """
    Monte Carlo portfolio simulation.

    Generates `n` random long-only fully-invested portfolios using Dirichlet
    distribution (which guarantees all weights sum to 1 and are non-negative).

    Returns:
        List of dicts: {return_ann, volatility, sharpe}
        Weights are NOT included to keep the response small.
    """
    mu    = returns_df.mean() * TRADING_DAYS
    cov   = returns_df.cov()  * TRADING_DAYS
    n_assets = len(returns_df.columns)

    results = []
    rng = np.random.default_rng(42)   # Fixed seed for reproducibility

    for _ in range(n):
        w    = rng.dirichlet(np.ones(n_assets))
        r    = float(w @ mu)
        vol  = float(np.sqrt(w @ cov.values @ w))
        sharpe = (r - RISK_FREE) / (vol + 1e-10)
        results.append({
            "return_ann": round(r, 4),
            "volatility": round(vol, 4),
            "sharpe":     round(sharpe, 4),
        })
    return results


# ── Constrained optimization ──────────────────────────────────────────────────

def _solve(objective, n_assets: int, constraints: list, bounds=None) -> np.ndarray | None:
    """Run scipy SLSQP with multiple random restarts for robustness."""
    rng = np.random.default_rng(0)
    best_result = None

    for _ in range(5):
        w0 = rng.dirichlet(np.ones(n_assets))
        res = minimize(
            objective,
            x0          = w0,
            constraints = constraints,
            bounds      = bounds or [(0.0, 1.0)] * n_assets,
            method      = "SLSQP",
            options     = {"ftol": 1e-9, "maxiter": 1000},
        )
        if res.success and (best_result is None or res.fun < best_result.fun):
            best_result = res

    return best_result.x if best_result is not None and best_result.success else None


def max_sharpe_weights(
    returns_df:    pd.DataFrame,
    risk_free:     float = RISK_FREE,
) -> np.ndarray | None:
    """
    Find the portfolio with the highest Sharpe ratio (tangency portfolio).

    The tangency portfolio is the point on the efficient frontier where a line
    from the risk-free rate is tangent — it gives the best risk/reward tradeoff.
    """
    mu       = returns_df.mean() * TRADING_DAYS
    cov      = returns_df.cov()  * TRADING_DAYS
    n        = len(mu)

    def neg_sharpe(w: np.ndarray) -> float:
        r   = float(w @ mu)
        vol = float(np.sqrt(w @ cov.values @ w))
        return -(r - risk_free) / (vol + 1e-10)

    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]
    return _solve(neg_sharpe, n, constraints)


def min_vol_weights(returns_df: pd.DataFrame) -> np.ndarray | None:
    """
    Find the minimum variance portfolio (leftmost point on the frontier).

    This is the portfolio with the lowest possible volatility regardless of
    expected return — maximum diversification benefit.
    """
    cov = returns_df.cov() * TRADING_DAYS
    n   = cov.shape[0]

    def portfolio_vol(w: np.ndarray) -> float:
        return float(np.sqrt(w @ cov.values @ w))

    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1}]
    return _solve(portfolio_vol, n, constraints)


def efficient_frontier_points(
    returns_df: pd.DataFrame,
    n_points:   int = 40,
) -> list[dict]:
    """
    Compute the efficient frontier by sweeping target return levels.

    For each target return, find the min-variance portfolio that achieves it.
    Returns only feasible points (where the optimizer converged).

    Returns:
        List of dicts: {return_ann, volatility, sharpe, weights: [float...]}
    """
    mu    = returns_df.mean() * TRADING_DAYS
    cov   = returns_df.cov()  * TRADING_DAYS
    n     = len(mu)

    # Sweep from min possible return to max possible return
    r_min    = float(mu.min())
    r_max    = float(mu.max())
    targets  = np.linspace(r_min, r_max, n_points)

    frontier = []
    for target_r in targets:
        def portfolio_vol(w: np.ndarray) -> float:
            return float(np.sqrt(w @ cov.values @ w))

        constraints = [
            {"type": "eq", "fun": lambda w: np.sum(w) - 1},
            {"type": "eq", "fun": lambda w, t=target_r: float(w @ mu) - t},
        ]
        w = _solve(portfolio_vol, n, constraints)
        if w is None:
            continue

        r    = float(w @ mu)
        vol  = float(np.sqrt(w @ cov.values @ w))
        sharpe = (r - RISK_FREE) / (vol + 1e-10)

        frontier.append({
            "return_ann": round(r, 4),
            "volatility": round(vol, 4),
            "sharpe":     round(sharpe, 4),
            "weights":    [round(float(wi), 4) for wi in w],
        })

    return frontier


# ── Combined analysis ─────────────────────────────────────────────────────────

def compute_frontier(
    returns_df:        pd.DataFrame,
    n_random:          int = 800,
    n_frontier_points: int = 40,
) -> dict:
    """
    Run the full Markowitz analysis: random portfolios + efficient frontier.

    Returns dict with:
      symbols:       list of symbol names
      random:        random portfolio cloud (return_ann, volatility, sharpe)
      frontier:      efficient frontier points (with weights)
      max_sharpe:    dict with return_ann, volatility, sharpe, weights
      min_vol:       dict with return_ann, volatility, sharpe, weights
    """
    symbols = list(returns_df.columns)
    mu      = returns_df.mean() * TRADING_DAYS
    cov     = returns_df.cov()  * TRADING_DAYS

    def _portfolio_stats(w: np.ndarray) -> dict:
        r   = float(w @ mu)
        vol = float(np.sqrt(w @ cov.values @ w))
        return {
            "return_ann": round(r, 4),
            "volatility": round(vol, 4),
            "sharpe":     round((r - RISK_FREE) / (vol + 1e-10), 4),
            "weights":    [round(float(wi), 4) for wi in w],
        }

    random_portfolios = generate_random_portfolios(returns_df, n_random)
    frontier          = efficient_frontier_points(returns_df, n_frontier_points)

    # Optimal portfolios
    w_sharpe = max_sharpe_weights(returns_df)
    w_minvol = min_vol_weights(returns_df)

    max_sharpe = _portfolio_stats(w_sharpe) if w_sharpe is not None else None
    min_vol    = _portfolio_stats(w_minvol) if w_minvol is not None else None

    # Fallback: use best from random portfolios if scipy failed
    if max_sharpe is None and random_portfolios:
        best = max(random_portfolios, key=lambda p: p["sharpe"])
        max_sharpe = best

    return {
        "symbols":   symbols,
        "random":    random_portfolios,
        "frontier":  frontier,
        "max_sharpe": max_sharpe,
        "min_vol":    min_vol,
    }

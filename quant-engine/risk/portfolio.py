"""
Portfolio-level risk analytics.

Given a dict of closing price Series (one per symbol) and an optional weight
vector, computes:
  - Per-asset:  annualized return, volatility, Sharpe, beta vs benchmark, max drawdown, VaR
  - Portfolio:  weighted volatility, Sharpe, max drawdown, VaR, CVaR
  - Correlations: full pairwise correlation matrix

Why daily returns?
  We compute everything from daily log/simple returns, then annualize by
  multiplying by sqrt(252) for volatility and 252 for return — the standard
  convention for equity daily-bar data.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .var import cvar, historical_var, portfolio_var

TRADING_DAYS = 252
RISK_FREE     = 0.04   # 4% annual — approximate current T-bill rate


def compute_risk_metrics(
    closes:           dict[str, pd.Series],
    weights:          list[float] | None = None,
    benchmark_symbol: str | None = None,
) -> dict:
    """
    Compute comprehensive portfolio risk metrics.

    Args:
        closes:           Dict mapping symbol → pd.Series of daily close prices.
        weights:          Portfolio weights (must sum to 1). Equal-weight if None.
        benchmark_symbol: Symbol to use as benchmark for beta/alpha (e.g. "SPY").
                          Uses first symbol if not found in closes.

    Returns:
        {
          symbols:          list[str]
          weights:          list[float]
          assets:           list[dict]  — per-asset metrics
          correlation:      list[list[float]]  — NxN matrix
          portfolio_*:      float  — portfolio-level metrics
        }
    """
    symbols = list(closes.keys())
    n       = len(symbols)

    if weights is None:
        w = [1 / n] * n
    else:
        # Normalize to sum to 1 (handles floating-point rounding)
        total = sum(weights)
        w = [wi / total for wi in weights]

    w_arr = np.array(w)

    # ── Build aligned returns matrix ──────────────────────────────────────────
    price_df   = pd.DataFrame(closes).sort_index().ffill()
    returns_df = price_df.pct_change().dropna()

    # Annualized stats helpers
    ann_return = lambda r: float(r.mean() * TRADING_DAYS)
    ann_vol    = lambda r: float(r.std() * np.sqrt(TRADING_DAYS))
    daily_rfr  = RISK_FREE / TRADING_DAYS

    # ── Benchmark (for beta) ──────────────────────────────────────────────────
    bm_sym = benchmark_symbol if benchmark_symbol in returns_df.columns else symbols[0]
    bm_ret = returns_df[bm_sym]
    bm_var = float(bm_ret.var())

    # ── Per-asset metrics ─────────────────────────────────────────────────────
    assets = []
    for sym in symbols:
        r          = returns_df[sym]
        prices     = price_df[sym]
        ann_r      = ann_return(r)
        ann_v      = ann_vol(r)
        sharpe     = (ann_r - RISK_FREE) / (ann_v + 1e-10)
        var_95     = historical_var(r, 0.95)

        # Beta: sensitivity to benchmark returns
        # Beta = Cov(asset, benchmark) / Var(benchmark)
        beta = float(r.cov(bm_ret) / (bm_var + 1e-10)) if sym != bm_sym else 1.0

        # Max drawdown
        rolling_max  = prices.cummax()
        drawdown_ser = (prices - rolling_max) / rolling_max
        max_dd       = float(drawdown_ser.min())

        assets.append({
            "symbol":        sym,
            "annual_return": round(ann_r, 4),
            "annual_vol":    round(ann_v, 4),
            "sharpe":        round(sharpe, 4),
            "max_drawdown":  round(max_dd, 4),
            "beta":          round(beta, 4),
            "var_95":        round(var_95, 4),
        })

    # ── Correlation matrix ────────────────────────────────────────────────────
    corr = returns_df[symbols].corr()
    correlation = [[round(float(corr.loc[s1, s2]), 4) for s2 in symbols] for s1 in symbols]

    # ── Portfolio-level metrics ───────────────────────────────────────────────
    port_returns  = (returns_df[symbols] * w_arr).sum(axis=1)
    port_ann_r    = ann_return(port_returns)
    port_ann_v    = ann_vol(port_returns)
    port_sharpe   = (port_ann_r - RISK_FREE) / (port_ann_v + 1e-10)
    port_var_95   = portfolio_var(w_arr, returns_df[symbols], 0.95)
    port_cvar_95  = cvar(port_returns, 0.95)

    # Portfolio drawdown
    port_equity   = (1 + port_returns).cumprod()
    rolling_max   = port_equity.cummax()
    port_max_dd   = float(((port_equity - rolling_max) / rolling_max).min())

    # Matrix-form portfolio volatility: sqrt(w^T Σ w)
    cov_matrix    = returns_df[symbols].cov() * TRADING_DAYS
    port_vol_mat  = float(np.sqrt(w_arr @ cov_matrix.values @ w_arr))

    return {
        "symbols":             symbols,
        "weights":             [round(wi, 4) for wi in w],
        "assets":              assets,
        "correlation":         correlation,
        "portfolio_return":    round(port_ann_r, 4),
        "portfolio_vol":       round(port_vol_mat, 4),
        "portfolio_sharpe":    round(port_sharpe, 4),
        "portfolio_max_drawdown": round(port_max_dd, 4),
        "portfolio_var_95":    round(port_var_95, 4),
        "portfolio_cvar_95":   round(port_cvar_95, 4),
        "n_days":              len(returns_df),
    }

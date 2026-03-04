"""
Portfolio performance metrics for strategy evaluation.

Standard quant finance metrics. All assume daily returns unless noted.

Key metrics explained:
  Sharpe:   (return - risk_free) / volatility  — reward per unit of total risk
  Sortino:  (return - risk_free) / downside_vol — reward per unit of downside risk
            (better than Sharpe because upside volatility is not "bad")
  Calmar:   CAGR / abs(max_drawdown)            — return per unit of worst loss
  Max DD:   Largest peak-to-trough decline      — worst historical loss
  CAGR:     Compound Annual Growth Rate         — annualized total return
"""

from __future__ import annotations

import numpy as np
import pandas as pd

TRADING_DAYS = 252   # Standard: ~252 trading days per calendar year


def compute_metrics(
    equity_curve: pd.Series,
    risk_free_rate: float = 0.04,   # 4% annual (approx current T-bill rate)
) -> dict[str, float]:
    """
    Compute comprehensive strategy performance metrics.

    Args:
        equity_curve:   Daily portfolio value indexed by date. Must have >= 2 points.
        risk_free_rate: Annual risk-free rate for Sharpe/Sortino calculation.

    Returns:
        Dict of named metrics, all rounded to 4 decimal places.
    """
    returns = equity_curve.pct_change().dropna()
    if len(returns) < 2:
        return {k: 0.0 for k in ["total_return", "cagr", "annual_vol",
                                   "sharpe_ratio", "sortino_ratio",
                                   "max_drawdown", "calmar_ratio", "win_rate"]}

    # ── Return metrics ────────────────────────────────────────────────────────
    total_return = float(equity_curve.iloc[-1] / equity_curve.iloc[0] - 1)

    # CAGR: annualize total return over the actual number of years
    n_years = len(equity_curve) / TRADING_DAYS
    cagr    = float((1 + total_return) ** (1 / max(n_years, 1 / TRADING_DAYS)) - 1)

    # ── Risk metrics ─────────────────────────────────────────────────────────
    daily_rfr       = risk_free_rate / TRADING_DAYS
    excess_returns  = returns - daily_rfr
    annual_vol      = float(returns.std() * np.sqrt(TRADING_DAYS))

    # Sharpe: annualized excess return / annualized volatility
    sharpe = float(
        (excess_returns.mean() * TRADING_DAYS)
        / (returns.std() * np.sqrt(TRADING_DAYS) + 1e-10)
    )

    # Sortino: like Sharpe but only penalizes returns below the risk-free rate
    downside        = returns[returns < daily_rfr]
    downside_vol    = float(downside.std() * np.sqrt(TRADING_DAYS)) if len(downside) > 1 else 1e-10
    sortino         = float((excess_returns.mean() * TRADING_DAYS) / (downside_vol + 1e-10))

    # ── Drawdown metrics ─────────────────────────────────────────────────────
    # Drawdown = how far we are from the running peak (high-water mark)
    rolling_max  = equity_curve.cummax()
    drawdown     = (equity_curve - rolling_max) / rolling_max
    max_drawdown = float(drawdown.min())   # Negative number; most negative = worst

    # Calmar: reward per unit of worst-case loss
    calmar = float(cagr / (abs(max_drawdown) + 1e-10))

    # ── Win rate ─────────────────────────────────────────────────────────────
    # Fraction of trading days with positive returns
    win_rate = float((returns > 0).sum() / max(len(returns), 1))

    return {
        "total_return":  round(total_return, 4),
        "cagr":          round(cagr, 4),
        "annual_vol":    round(annual_vol, 4),
        "sharpe_ratio":  round(sharpe, 4),
        "sortino_ratio": round(sortino, 4),
        "max_drawdown":  round(max_drawdown, 4),
        "calmar_ratio":  round(calmar, 4),
        "win_rate":      round(win_rate, 4),
    }


def compute_drawdown_series(equity_curve: pd.Series) -> pd.Series:
    """Return the daily drawdown series (fraction from peak, always ≤ 0)."""
    rolling_max = equity_curve.cummax()
    return (equity_curve - rolling_max) / rolling_max

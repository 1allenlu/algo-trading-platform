"""
Monte Carlo Portfolio Simulation — Phase 34.

Uses Geometric Brownian Motion (GBM) to project portfolio value over a given
time horizon.  Returns percentile fan bands (p5/p25/p50/p75/p95) and summary
statistics useful for risk reporting.

Math:
  S[t+1] = S[t] * exp( (mu - 0.5*sigma²)*dt + sigma*sqrt(dt)*Z )

  where:
    mu    = annualised portfolio drift (weighted mean of daily returns × 252)
    sigma = annualised portfolio volatility (weighted covariance × sqrt(252))
    dt    = 1/252  (one trading day)
    Z     ~ N(0,1)

All simulation is vectorised — no Python-level loops over paths.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def run_monte_carlo(
    closes: dict[str, pd.Series],
    weights: list[float] | None = None,
    n_sims: int = 1000,
    horizon_days: int = 252,
) -> dict:
    """
    Run a GBM Monte Carlo simulation for a weighted portfolio.

    Parameters
    ----------
    closes       : {symbol: pd.Series of closing prices (ascending)}
    weights      : portfolio weights summing to 1.0 (equal-weight if None)
    n_sims       : number of simulated paths
    horizon_days : projection horizon in trading days

    Returns
    -------
    {
      "paths": [{"day": int, "p5": float, "p25": float, "p50": float, "p75": float, "p95": float}, ...],
      "stats": {
          "prob_profit":          float,  # fraction of paths ending > 1.0
          "median_return":        float,  # annualised, fractional
          "p5_return":            float,  # worst-case 5th-pct, fractional
          "median_max_drawdown":  float,  # median of per-path max drawdown, fractional
          "p95_max_drawdown":     float,  # 95th pct max drawdown (severe scenario)
      },
      "initial_value": 1.0,
    }
    """
    symbols = list(closes.keys())
    n = len(symbols)

    if weights is None:
        w = np.full(n, 1.0 / n)
    else:
        w = np.array(weights, dtype=float)
        w = w / w.sum()  # normalise

    # Build aligned daily-return matrix (drop NaN rows)
    price_df = pd.DataFrame(closes).sort_index().ffill()
    ret_df   = price_df.pct_change().dropna()

    if len(ret_df) < 30:
        raise ValueError("Need at least 30 days of return history for Monte Carlo.")

    # ── GBM parameters ────────────────────────────────────────────────────────
    daily_ret  = ret_df.values                    # shape (T, n)
    port_daily = daily_ret @ w                    # scalar daily portfolio return (T,)

    mu_daily    = float(port_daily.mean())        # daily drift
    sigma_daily = float(port_daily.std(ddof=1))   # daily vol

    dt = 1.0  # step size = 1 day (already in daily units)

    # GBM drift per step: (mu - 0.5*sigma²)*dt
    drift = (mu_daily - 0.5 * sigma_daily**2) * dt

    # ── Simulate paths ─────────────────────────────────────────────────────────
    # Z[day, sim]
    Z     = np.random.standard_normal((horizon_days, n_sims))
    shocks = drift + sigma_daily * np.sqrt(dt) * Z   # (horizon_days, n_sims)

    # log returns → cumulative price
    log_paths     = np.cumsum(shocks, axis=0)          # (horizon_days, n_sims)
    # Prepend day-0 (= 1.0) by shifting index
    price_paths   = np.exp(log_paths)                  # relative to start = 1.0

    # ── Percentile fan bands ───────────────────────────────────────────────────
    pct = np.percentile(price_paths, [5, 25, 50, 75, 95], axis=1)  # (5, horizon_days)

    paths = []
    for day_idx in range(horizon_days):
        paths.append({
            "day": day_idx + 1,
            "p5":  round(float(pct[0, day_idx]), 6),
            "p25": round(float(pct[1, day_idx]), 6),
            "p50": round(float(pct[2, day_idx]), 6),
            "p75": round(float(pct[3, day_idx]), 6),
            "p95": round(float(pct[4, day_idx]), 6),
        })

    # ── Summary statistics ─────────────────────────────────────────────────────
    final_values = price_paths[-1, :]   # terminal portfolio value (relative)

    prob_profit   = float(np.mean(final_values > 1.0))
    median_return = float(np.median(final_values) - 1.0)
    p5_return     = float(np.percentile(final_values, 5) - 1.0)

    # Max drawdown for each path: (peak - trough) / peak
    # Prepend 1.0 as day-0 row
    full_paths  = np.vstack([np.ones((1, n_sims)), price_paths])  # (horizon_days+1, n_sims)
    peak        = np.maximum.accumulate(full_paths, axis=0)
    drawdowns   = (full_paths - peak) / peak                       # ≤ 0
    max_dd_each = np.min(drawdowns, axis=0)                        # per-path minimum (most negative)
    max_dd_each = np.abs(max_dd_each)                              # positive fraction

    median_max_dd = float(np.median(max_dd_each))
    p95_max_dd    = float(np.percentile(max_dd_each, 95))

    return {
        "paths":         paths,
        "initial_value": 1.0,
        "stats": {
            "prob_profit":         round(prob_profit,   4),
            "median_return":       round(median_return, 4),
            "p5_return":           round(p5_return,     4),
            "median_max_drawdown": round(median_max_dd, 4),
            "p95_max_drawdown":    round(p95_max_dd,    4),
        },
    }

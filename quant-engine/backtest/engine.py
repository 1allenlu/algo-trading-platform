"""
Vectorized Backtesting Engine.

Design principles:
  - Vectorized (pandas/numpy): operates on entire time-series at once, fast
  - Daily-bar granularity: signal computed at close, position taken at next open
    (implemented via shift(1): yesterday's signal → today's return)
  - Transaction costs: commission + slippage deducted on position changes
  - Supports multi-asset portfolios (signals = DataFrame of weights per symbol)

Position convention:
  Signal weight W on day T means:
    - Hold W * portfolio_value dollars in that asset from close T to close T+1
    - W > 0 = long, W < 0 = short, W = 0 = flat
    - Sum of |weights| can exceed 1.0 (leverage), but strategies should keep it ≤ 1.0

Returns formula (per day):
  portfolio_return[t] = Σ(signal[t-1] * asset_return[t]) - transaction_cost[t]

Transaction cost:
  cost[t] = Σ |signal[t] - signal[t-1]| * (commission + slippage)
  Default: 0.10% commission + 0.05% slippage = 0.15% per position change
"""

from __future__ import annotations

import pandas as pd

from .metrics import compute_drawdown_series, compute_metrics


class BacktestEngine:
    """
    Runs a vectorized portfolio backtest.

    Args:
        initial_capital:  Starting portfolio value in dollars (default $100,000).
        commission:       One-way commission as a fraction (default 0.001 = 0.1%).
        slippage:         One-way slippage as a fraction (default 0.0005 = 0.05%).
    """

    def __init__(
        self,
        initial_capital: float = 100_000.0,
        commission:      float = 0.001,    # 0.1% per side
        slippage:        float = 0.0005,   # 0.05% per side
    ):
        self.initial_capital = initial_capital
        self.commission      = commission
        self.slippage        = slippage

    def run(
        self,
        signals:   pd.DataFrame,            # (dates × symbols) weights in [-1, 1]
        prices:    pd.DataFrame,            # (dates × symbols) close prices
        benchmark: pd.Series | None = None, # Optional benchmark close price
    ) -> dict:
        """
        Execute the backtest and return a results dict.

        Returns:
            equity_curve       (pd.Series) — portfolio value over time
            drawdown           (pd.Series) — daily drawdown from peak (≤ 0)
            metrics            (dict)      — Sharpe, CAGR, max_drawdown, etc.
            benchmark_curve    (pd.Series | None)
            benchmark_metrics  (dict | None)
            portfolio_returns  (pd.Series) — daily returns
            trades             (list[dict]) — simplified trade log
            num_trades         (int)
        """
        # ── Align signals and prices on common dates ──────────────────────────
        symbols     = signals.columns.tolist()
        prices_aln  = prices[symbols].reindex(signals.index).ffill()

        # ── Daily asset returns (close-to-close) ──────────────────────────────
        asset_returns = prices_aln.pct_change().fillna(0.0)

        # ── Transaction costs ─────────────────────────────────────────────────
        # Cost is incurred whenever position weight changes (trade occurs)
        pos_changes      = signals.diff().fillna(signals.iloc[0].abs())
        daily_trade_cost = pos_changes.abs().sum(axis=1) * (self.commission + self.slippage)

        # ── Portfolio daily return ─────────────────────────────────────────────
        # shift(1): use yesterday's signal for today's return
        # (signal determined at close T; trade executes at open T+1 ≈ close T)
        portfolio_returns = (signals.shift(1).fillna(0.0) * asset_returns).sum(axis=1)
        portfolio_returns -= daily_trade_cost

        # ── Equity curve ─────────────────────────────────────────────────────
        equity_curve       = self.initial_capital * (1 + portfolio_returns).cumprod()
        equity_curve.iloc[0] = self.initial_capital

        # ── Metrics ──────────────────────────────────────────────────────────
        metrics  = compute_metrics(equity_curve)
        drawdown = compute_drawdown_series(equity_curve)

        # ── Benchmark comparison ──────────────────────────────────────────────
        benchmark_curve   = None
        benchmark_metrics = None
        if benchmark is not None:
            bm_aligned        = benchmark.reindex(equity_curve.index).ffill()
            benchmark_curve   = self.initial_capital * (bm_aligned / bm_aligned.iloc[0])
            benchmark_metrics = compute_metrics(benchmark_curve)

        # ── Trade log ────────────────────────────────────────────────────────
        trades     = self._build_trade_log(signals, prices_aln)
        num_trades = len(trades)

        return {
            "equity_curve":      equity_curve,
            "drawdown":          drawdown,
            "metrics":           metrics,
            "benchmark_curve":   benchmark_curve,
            "benchmark_metrics": benchmark_metrics,
            "portfolio_returns": portfolio_returns,
            "trades":            trades,
            "num_trades":        num_trades,
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _build_trade_log(
        self,
        signals: pd.DataFrame,
        prices:  pd.DataFrame,
    ) -> list[dict]:
        """
        Build a simplified trade log from position changes.
        A trade occurs whenever any signal weight changes meaningfully (> 1%).
        """
        trades     = []
        changes    = signals.diff().fillna(signals)

        for dt, row in changes.iterrows():
            for sym, delta in row.items():
                if abs(delta) > 0.01:
                    price = prices.loc[dt, sym] if dt in prices.index else None
                    if price is None or pd.isna(price):
                        continue
                    trades.append({
                        "date":   str(dt)[:10],
                        "symbol": str(sym),
                        "side":   "buy" if delta > 0 else "sell",
                        "price":  round(float(price), 2),
                        "size":   round(abs(float(delta)), 4),
                    })

        return trades[:500]   # Cap to keep API response manageable

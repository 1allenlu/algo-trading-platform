"""
Walk-Forward Optimization — Phase 28.

Splits the full OHLCV history into N rolling windows and runs a grid-search
parameter optimization on the *training* slice of each window, then evaluates
the best params on the *test* slice.  This prevents look-ahead bias and
measures parameter stability across market regimes.

Architecture
------------
- Data is loaded once from PostgreSQL (asyncpg connection string).
- Each window runs the backtest engine in-process (no subprocess / no asyncio).
- Results are returned as a plain dict so the route handler can serialize them.

Window structure:
  |<------ window_days ------>|
  |<-- train (train_ratio) -->|<-- test -->|
  ↑                                        ↑
  start                                   end

The window slides forward by `step_days` between windows.
"""

from __future__ import annotations

import itertools
import sys
from pathlib import Path
from typing import Any

import asyncpg
from loguru import logger

# Ensure quant_engine is importable from PYTHONPATH=/
sys.path.insert(0, "/")

TRADING_DAYS = 252


# ── Public entry point ────────────────────────────────────────────────────────

def run_walk_forward(
    strategy:    str,
    symbols:     list[str],
    param_grid:  dict[str, list],
    database_url: str,
    n_windows:   int   = 5,
    train_ratio: float = 0.7,
    objective:   str   = "sharpe",
    max_trials:  int   = 50,
) -> dict[str, Any]:
    """
    Run walk-forward optimization synchronously.

    Returns
    -------
    {
      strategy, symbols, objective, n_windows, train_ratio,
      windows: [
        {
          window_idx, train_start, train_end, test_start, test_end,
          best_params, train_metrics, test_metrics,
          oos_sharpe, oos_return, oos_max_dd
        }
      ],
      summary: {
        avg_oos_sharpe, avg_oos_return, stability_score,
        recommended_params, best_window_idx
      }
    }
    """
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        data = loop.run_until_complete(_load_data(database_url, symbols))
    finally:
        loop.close()

    if not data:
        return {"error": "No market data found. Run `make ingest` first."}

    # Use the shortest symbol's bar count as reference
    min_bars = min(len(v) for v in data.values())
    if min_bars < 60:
        return {"error": f"Not enough data ({min_bars} bars). Need at least 60."}

    combos = _cartesian(param_grid, max_trials)
    if not combos:
        return {"error": "param_grid produced no combinations."}

    window_size = min_bars // n_windows
    step        = window_size

    results = []
    for wi in range(n_windows):
        start_idx  = wi * step
        end_idx    = start_idx + window_size
        if end_idx > min_bars:
            break
        train_end  = start_idx + int(window_size * train_ratio)
        test_start = train_end

        # Slice data for this window
        train_data = {s: rows[start_idx:train_end]  for s, rows in data.items()}
        test_data  = {s: rows[test_start:end_idx]   for s, rows in data.items()}

        # Grid search on train slice
        best_params, train_metrics = _grid_search(
            strategy, symbols, combos, train_data, objective
        )

        # Evaluate best params on OOS test slice
        test_metrics = _run_single(strategy, symbols, best_params, test_data)

        def _date(rows: list, idx: int) -> str | None:
            try:
                return list(rows.values())[0][idx]["timestamp"][:10]
            except (IndexError, KeyError):
                return None

        results.append({
            "window_idx":  wi,
            "train_start": _date(train_data, 0),
            "train_end":   _date(train_data, -1),
            "test_start":  _date(test_data, 0),
            "test_end":    _date(test_data, -1),
            "best_params": best_params,
            "train_metrics": train_metrics,
            "test_metrics":  test_metrics,
            "oos_sharpe":  test_metrics.get("sharpe_ratio", 0),
            "oos_return":  test_metrics.get("total_return", 0),
            "oos_max_dd":  test_metrics.get("max_drawdown", 0),
        })

    if not results:
        return {"error": "No windows completed."}

    summary = _summarise(results, param_grid, objective)

    return {
        "strategy":    strategy,
        "symbols":     symbols,
        "objective":   objective,
        "n_windows":   len(results),
        "train_ratio": train_ratio,
        "windows":     results,
        "summary":     summary,
    }


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _load_data(database_url: str, symbols: list[str]) -> dict[str, list[dict]]:
    """Load OHLCV rows from PostgreSQL using asyncpg (no ORM needed here)."""
    pg_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(pg_url)
    try:
        data: dict[str, list[dict]] = {}
        for sym in symbols:
            rows = await conn.fetch(
                """
                SELECT timestamp, open, high, low, close, volume
                FROM market_data
                WHERE symbol = $1
                ORDER BY timestamp ASC
                """,
                sym.upper(),
            )
            data[sym.upper()] = [dict(r) for r in rows]
        return data
    finally:
        await conn.close()


def _cartesian(param_grid: dict[str, list], max_trials: int) -> list[dict]:
    keys   = list(param_grid.keys())
    values = list(param_grid.values())
    combos = [dict(zip(keys, c)) for c in itertools.product(*values)]
    return combos[:max_trials]


def _grid_search(
    strategy: str,
    symbols:  list[str],
    combos:   list[dict],
    data:     dict[str, list[dict]],
    objective: str,
) -> tuple[dict, dict]:
    best_params  : dict = combos[0]
    best_metrics : dict = {}
    best_score   : float = float("-inf")

    for params in combos:
        try:
            metrics = _run_single(strategy, symbols, params, data)
            score   = _objective_value(metrics, objective)
            if score > best_score:
                best_score   = score
                best_params  = params
                best_metrics = metrics
        except Exception as exc:
            logger.debug(f"[wfo] trial failed: {exc}")

    return best_params, best_metrics


def _run_single(
    strategy: str,
    symbols:  list[str],
    params:   dict,
    data:     dict[str, list[dict]],
) -> dict:
    """Run the BacktestEngine with pre-loaded data and return metrics dict."""
    from quant_engine.backtest.engine import BacktestEngine
    from quant_engine.backtest.metrics import compute_metrics
    import pandas as pd

    # Convert raw dicts to DataFrames keyed by symbol
    dfs: dict[str, pd.DataFrame] = {}
    for sym, rows in data.items():
        if not rows:
            continue
        df = pd.DataFrame(rows)
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.set_index("timestamp").sort_index()
        df.columns = [c.lower() for c in df.columns]
        dfs[sym] = df

    if not dfs:
        return {}

    engine  = BacktestEngine(dfs, commission=0.001, slippage=0.0005)
    equity  = engine.run(strategy=strategy, symbols=symbols, params=params)

    if equity is None or len(equity) < 2:
        return {}

    return compute_metrics(equity)


def _objective_value(metrics: dict, objective: str) -> float:
    mapping = {
        "sharpe":       metrics.get("sharpe_ratio", float("-inf")),
        "total_return": metrics.get("total_return", float("-inf")),
        "calmar":       metrics.get("calmar_ratio", float("-inf")),
        "sortino":      metrics.get("sortino_ratio", float("-inf")),
    }
    return float(mapping.get(objective, float("-inf")))


def _summarise(results: list[dict], param_grid: dict, objective: str) -> dict:
    oos_sharpes  = [r["oos_sharpe"]  for r in results]
    oos_returns  = [r["oos_return"]  for r in results]

    avg_sharpe = sum(oos_sharpes)  / len(oos_sharpes)
    avg_return = sum(oos_returns)  / len(oos_returns)

    # Stability: fraction of windows with positive OOS return
    stability  = sum(1 for r in oos_returns if r > 0) / len(oos_returns)

    # Recommended params: best single OOS window by objective
    best_win   = max(results, key=lambda r: r["oos_sharpe"])

    return {
        "avg_oos_sharpe":     round(avg_sharpe, 4),
        "avg_oos_return":     round(avg_return, 4),
        "stability_score":    round(stability, 2),   # 0-1, higher = more consistent
        "recommended_params": best_win["best_params"],
        "best_window_idx":    best_win["window_idx"],
    }

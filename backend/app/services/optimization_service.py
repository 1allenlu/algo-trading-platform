"""
Strategy Optimization Service — Phase 10.

Runs a grid search over user-specified parameter ranges for any backtest strategy.
Each parameter combination is a "trial" — the strategy is backtested with those
params in-memory (no subprocess), results collected, then ranked by an objective.

Architecture:
  - Runs in a daemon thread (started from the route handler), not a subprocess.
  - Market data is loaded once from the DB, then reused across all trials.
  - The BacktestEngine and strategy classes are imported directly (PYTHONPATH=/).
  - Progress is persisted to the DB after each trial so the frontend can poll.

Supported objectives (all are maximised):
  sharpe       → Sharpe ratio (risk-adjusted return)
  total_return → Raw cumulative return
  calmar       → CAGR / max_drawdown (tail-risk-adjusted)
  sortino      → Sortino ratio (downside-deviation-adjusted)

Default parameter search spaces per strategy:
  These are defined in PARAM_SPACES below and used by the frontend to pre-populate
  the grid form. The actual values searched depend on what the user submits.
"""

from __future__ import annotations

import asyncio
import itertools
import json
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import asyncpg
from loguru import logger

from app.core.config import settings
from app.models.database import AsyncSessionLocal, OptimizationRun

# ── Parameter search spaces ───────────────────────────────────────────────────
# Default grids shown in the frontend. Each entry is a list of candidate values.

PARAM_SPACES: dict[str, dict[str, list]] = {
    "pairs_trading": {
        "lookback":        [40, 60, 80],
        "entry_threshold": [1.5, 2.0, 2.5],
        "exit_threshold":  [0.3, 0.5, 0.75],
        "stop_loss":       [3.0, 3.5, 4.0],
    },
    "momentum": {
        "lookback_months": [6, 9, 12],
        "top_n":           [1, 2, 3],
    },
    "mean_reversion": {
        "window":        [10, 20, 30],
        "num_std":       [1.5, 2.0, 2.5],
        "position_size": [0.3, 0.5, 0.7],
    },
}

MAX_TRIALS = 50   # Cap to prevent runaway grid searches


# ── Combination generator ──────────────────────────────────────────────────────

def generate_combinations(
    param_grid: dict[str, list],
    max_trials: int = MAX_TRIALS,
) -> list[dict]:
    """
    Cartesian product of parameter lists, capped at max_trials.
    e.g. {"window": [10, 20], "std": [1.5, 2.0]} → [{"window":10,"std":1.5}, …]
    """
    if not param_grid:
        return [{}]
    keys   = list(param_grid.keys())
    values = [param_grid[k] for k in keys]
    combos = [dict(zip(keys, combo)) for combo in itertools.product(*values)]
    return combos[:max_trials]


# ── DB helpers (sync, for use inside daemon threads) ─────────────────────────

def _sync_update(opt_id: int, **fields) -> None:
    """Synchronously update an optimization_runs row from within a thread."""
    async def _go() -> None:
        db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
        conn   = await asyncpg.connect(db_url)
        try:
            set_clause = ", ".join(f"{k}=${i+2}" for i, k in enumerate(fields))
            vals       = [fields[k] for k in fields]
            await conn.execute(
                f"UPDATE optimization_runs SET {set_clause} WHERE id=$1",
                opt_id, *vals,
            )
        finally:
            await conn.close()
    asyncio.run(_go())


def _sync_load_data(symbols: list[str]) -> dict:
    """Load price data for all symbols from the DB (sync wrapper)."""
    db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

    async def _go() -> dict:
        import pandas as pd
        conn   = await asyncpg.connect(db_url)
        result = {}
        try:
            for sym in symbols:
                rows = await conn.fetch(
                    """
                    SELECT timestamp, open, high, low, close, volume
                    FROM market_data WHERE symbol = $1 ORDER BY timestamp ASC
                    """,
                    sym,
                )
                if not rows:
                    raise ValueError(f"No data for {sym}. Run `make ingest` first.")
                df = pd.DataFrame([dict(r) for r in rows])
                df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_localize(None)
                df = df.set_index("timestamp").sort_index()
                result[sym] = df
        finally:
            await conn.close()
        return result

    return asyncio.run(_go())


# ── Trial runner ──────────────────────────────────────────────────────────────

def _run_trial(
    strategy_name: str,
    symbols:       list[str],
    params:        dict,
    price_data:    dict,
) -> dict | None:
    """
    Run a single backtest trial in-memory. Returns a metrics dict or None on error.
    Imports BacktestEngine + strategy classes directly (PYTHONPATH=/).
    """
    try:
        # Dynamic import — path is already set by PYTHONPATH=/ in the container
        if "/" not in sys.path:
            sys.path.insert(0, "/")

        from quant_engine.backtest.engine import BacktestEngine
        from quant_engine.strategies import get_strategy

        import pandas as pd

        strat     = get_strategy(strategy_name, params)
        signals   = strat.generate_signals(price_data)

        prices_df = pd.DataFrame(
            {sym: price_data[sym]["close"] for sym in symbols}
        ).reindex(signals.index).ffill()

        benchmark = prices_df.iloc[:, 0]
        engine    = BacktestEngine(initial_capital=100_000.0)
        results   = engine.run(signals=signals, prices=prices_df, benchmark=benchmark)

        m = results["metrics"]
        return {
            "params":       params,
            "sharpe":       round(float(m.get("sharpe_ratio", 0)), 4),
            "total_return": round(float(m.get("total_return", 0)), 4),
            "cagr":         round(float(m.get("cagr", 0)), 4),
            "max_drawdown": round(float(m.get("max_drawdown", 0)), 4),
            "calmar":       round(float(m.get("calmar_ratio", 0)), 4),
            "sortino":      round(float(m.get("sortino_ratio", 0)), 4),
            "num_trades":   int(results.get("num_trades", 0)),
        }
    except Exception as exc:
        logger.warning(f"Optimization trial error ({params}): {exc}")
        return None


# ── Main optimization task ────────────────────────────────────────────────────

def _run_optimization_thread(
    opt_id:     int,
    strategy:   str,
    symbols:    list[str],
    param_grid: dict[str, list],
    objective:  str,
) -> None:
    """
    Daemon thread: loads data, runs all trials, saves results.
    Called from start_optimization() — never call this directly.
    """
    logger.info(f"[opt-{opt_id}] Starting optimization: {strategy} symbols={symbols}")

    try:
        # ── 1. Mark as running ────────────────────────────────────────────────
        _sync_update(opt_id, status="running")

        # ── 2. Generate param combinations ───────────────────────────────────
        combos = generate_combinations(param_grid)
        _sync_update(opt_id, total_trials=len(combos))
        logger.info(f"[opt-{opt_id}] {len(combos)} trials to run")

        # ── 3. Load data once ─────────────────────────────────────────────────
        price_data = _sync_load_data(symbols)

        # ── 4. Run each trial ─────────────────────────────────────────────────
        all_results: list[dict] = []
        for i, params in enumerate(combos, 1):
            result = _run_trial(strategy, symbols, params, price_data)
            if result:
                all_results.append(result)
            _sync_update(opt_id, completed_trials=i)
            logger.debug(f"[opt-{opt_id}] Trial {i}/{len(combos)}: {params}")

        # ── 5. Rank by objective ──────────────────────────────────────────────
        if not all_results:
            raise ValueError("All trials failed — check strategy configuration")

        obj_key = {
            "sharpe":       "sharpe",
            "total_return": "total_return",
            "calmar":       "calmar",
            "sortino":      "sortino",
        }.get(objective, "sharpe")

        all_results.sort(key=lambda r: r.get(obj_key, float("-inf")), reverse=True)
        best   = all_results[0]

        # ── 6. Persist final results ──────────────────────────────────────────
        _sync_update(
            opt_id,
            status           = "done",
            results_json     = json.dumps(all_results),
            best_params_json = json.dumps(best["params"]),
            best_sharpe      = best["sharpe"],
            best_return      = best["total_return"],
            completed_at     = datetime.now(timezone.utc),
        )
        logger.info(
            f"[opt-{opt_id}] Done — best {obj_key}={best[obj_key]:.3f} "
            f"with params={best['params']}"
        )

    except Exception as exc:
        logger.exception(f"[opt-{opt_id}] Optimization failed: {exc}")
        _sync_update(opt_id, status="failed", error=str(exc)[:2000])


def start_optimization(
    opt_id:     int,
    strategy:   str,
    symbols:    list[str],
    param_grid: dict[str, list],
    objective:  str,
) -> None:
    """Start the optimization as a daemon thread. Non-blocking."""
    t = threading.Thread(
        target = _run_optimization_thread,
        args   = (opt_id, strategy, symbols, param_grid, objective),
        daemon = True,
        name   = f"optimize-{opt_id}",
    )
    t.start()
    logger.info(f"Optimization thread started: opt_id={opt_id}")

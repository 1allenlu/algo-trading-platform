"""
Backtest runner script — Phase 3.

Loads market data, runs a strategy backtest, and saves results to the DB.
Called as a subprocess by the backend service (backtest_service.py).

The run_id must already exist in the backtest_runs table with status='running'.
This script updates the row with final results (or marks it 'failed' on error).

Usage:
    python /quant_engine/backtest/runner.py \\
        --run-id 1 \\
        --strategy pairs_trading \\
        --symbols SPY QQQ \\
        --database-url postgresql://trading:trading@postgres:5432/trading_db
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import asyncpg
import numpy as np
import pandas as pd

# Ensure quant_engine is importable when PYTHONPATH=/
_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR.parent.parent) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR.parent.parent))

from quant_engine.backtest.engine import BacktestEngine
from quant_engine.strategies import STRATEGY_INFO, get_strategy


def log(level: str, msg: str) -> None:
    print(f"{datetime.now().strftime('%H:%M:%S')} | {level:<8} | {msg}", flush=True)


# ── Data loading ──────────────────────────────────────────────────────────────

async def fetch_prices(
    symbols: list[str],
    db_url:  str,
) -> dict[str, pd.DataFrame]:
    """
    Load OHLCV data from the database for each symbol.
    Returns dict mapping symbol → DataFrame (indexed by date).
    """
    pg_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    conn   = await asyncpg.connect(pg_url)
    try:
        result = {}
        for symbol in symbols:
            rows = await conn.fetch(
                """
                SELECT timestamp, open, high, low, close, volume
                FROM market_data
                WHERE symbol = $1
                ORDER BY timestamp ASC
                """,
                symbol,
            )
            if not rows:
                raise ValueError(f"No market data found for {symbol}. Run `make ingest` first.")

            df             = pd.DataFrame([dict(r) for r in rows])
            df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_localize(None)
            df             = df.set_index("timestamp").sort_index()
            result[symbol]  = df

        return result
    finally:
        await conn.close()


# ── DB updates ────────────────────────────────────────────────────────────────

async def mark_done(run_id: int, payload: dict, db_url: str) -> None:
    """Write final backtest results to the backtest_runs row."""
    pg_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    conn   = await asyncpg.connect(pg_url)
    try:
        await conn.execute(
            """
            UPDATE backtest_runs SET
                status            = 'done',
                total_return      = $2,
                cagr              = $3,
                sharpe_ratio      = $4,
                sortino_ratio     = $5,
                max_drawdown      = $6,
                calmar_ratio      = $7,
                win_rate          = $8,
                num_trades        = $9,
                equity_curve      = $10,
                benchmark_metrics = $11,
                trades            = $12
            WHERE id = $1
            """,
            run_id,
            payload["total_return"],
            payload["cagr"],
            payload["sharpe_ratio"],
            payload["sortino_ratio"],
            payload["max_drawdown"],
            payload["calmar_ratio"],
            payload["win_rate"],
            payload["num_trades"],
            payload["equity_curve"],
            payload["benchmark_metrics"],
            payload["trades"],
        )
    finally:
        await conn.close()


async def mark_failed(run_id: int, error: str, db_url: str) -> None:
    """Mark a backtest run as failed with an error message."""
    pg_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    conn   = await asyncpg.connect(pg_url)
    try:
        await conn.execute(
            "UPDATE backtest_runs SET status = 'failed', error = $2 WHERE id = $1",
            run_id, error[:2000],
        )
    finally:
        await conn.close()


# ── Core runner ───────────────────────────────────────────────────────────────

async def run_backtest(
    run_id:   int,
    strategy: str,
    symbols:  list[str],
    params:   dict,
    db_url:   str,
) -> None:
    """Load data → generate signals → backtest → save results."""
    log("INFO", f"Backtest | run_id={run_id} | strategy={strategy} | symbols={symbols}")

    # ── 1. Load price data ────────────────────────────────────────────────────
    log("INFO", "Loading market data...")
    price_data = await fetch_prices(symbols, db_url)
    for sym, df in price_data.items():
        log("OK", f"  {sym}: {len(df)} bars  ({df.index[0].date()} → {df.index[-1].date()})")

    # ── 2. Generate signals ───────────────────────────────────────────────────
    log("INFO", f"Generating signals ({strategy})...")
    strat   = get_strategy(strategy, params)
    signals = strat.generate_signals(price_data)

    n_positions = int((signals.abs() > 0.01).any(axis=1).sum())
    log("OK", f"  {len(signals)} signal bars | {n_positions} bars with open positions")

    # ── 3. Build aligned price matrix for the engine ─────────────────────────
    prices_df = pd.DataFrame(
        {sym: price_data[sym]["close"] for sym in symbols}
    ).reindex(signals.index).ffill()

    # Benchmark: use first symbol (usually SPY) as buy-and-hold reference
    benchmark = prices_df.iloc[:, 0]

    # ── 4. Run backtest engine ────────────────────────────────────────────────
    # Extract cost params injected by the API route (dunder-prefixed to avoid
    # clashing with strategy-specific params).  Fall back to engine defaults.
    commission = params.pop("__commission__", 0.001)
    slippage   = params.pop("__slippage__",   0.0005)

    log("INFO", f"Running backtest engine (commission={commission:.4%}, slippage={slippage:.4%})...")
    engine  = BacktestEngine(
        initial_capital = 100_000.0,
        commission      = commission,
        slippage        = slippage,
    )
    results = engine.run(signals=signals, prices=prices_df, benchmark=benchmark)

    m = results["metrics"]
    log("OK",   f"  Total return:  {m['total_return']:+.1%}")
    log("OK",   f"  CAGR:          {m['cagr']:+.1%}")
    log("OK",   f"  Sharpe ratio:  {m['sharpe_ratio']:.3f}")
    log("OK",   f"  Max drawdown:  {m['max_drawdown']:.1%}")
    log("OK",   f"  Num trades:    {results['num_trades']}")

    # ── 5. Serialize equity curve (weekly samples to reduce storage) ──────────
    eq   = results["equity_curve"]
    dd   = results["drawdown"]
    # Resample to weekly end-of-period to keep JSON small (~260 points for 5yr)
    eq_w = eq.resample("W").last()
    dd_w = dd.resample("W").last()

    equity_json = json.dumps([
        {
            "date":     str(dt.date()),
            "value":    round(float(v), 2),
            "drawdown": round(float(d), 4),
        }
        for dt, v, d in zip(eq_w.index, eq_w.values, dd_w.values)
        if not (np.isnan(v) or np.isnan(d))
    ])

    bm_metrics_json: str | None = None
    if results["benchmark_metrics"]:
        bm_metrics_json = json.dumps(results["benchmark_metrics"])

    trades_json = json.dumps(results["trades"])

    # ── 6. Save results to DB (skipped when run_id=0, i.e. CLI/dev mode) ────────
    if run_id > 0:
        log("INFO", "Saving results to database...")
        await mark_done(
            run_id,
            {
                "total_return":      m["total_return"],
                "cagr":              m["cagr"],
                "sharpe_ratio":      m["sharpe_ratio"],
                "sortino_ratio":     m["sortino_ratio"],
                "max_drawdown":      m["max_drawdown"],
                "calmar_ratio":      m["calmar_ratio"],
                "win_rate":          m["win_rate"],
                "num_trades":        results["num_trades"],
                "equity_curve":      equity_json,
                "benchmark_metrics": bm_metrics_json,
                "trades":            trades_json,
            },
            db_url,
        )
    log("OK", f"✓ Backtest complete — run_id={run_id}")


# ── CLI entry point ───────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Run a strategy backtest")
    parser.add_argument("--run-id",      type=int, required=True)
    parser.add_argument("--strategy",    required=True,
                        choices=list(STRATEGY_INFO.keys()))
    parser.add_argument("--symbols",     nargs="+", required=True)
    parser.add_argument("--params",      default="{}", help="JSON strategy params")
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL", "postgresql://trading:trading@localhost:5432/trading_db"),
    )
    args = parser.parse_args()

    params = json.loads(args.params)

    try:
        asyncio.run(
            run_backtest(
                run_id   = args.run_id,
                strategy = args.strategy,
                symbols  = [s.upper() for s in args.symbols],
                params   = params,
                db_url   = args.database_url,
            )
        )
    except Exception as exc:
        log("ERROR", f"Backtest failed: {exc}")
        import traceback; traceback.print_exc()
        if args.run_id > 0:   # Only update DB when triggered via API
            asyncio.run(mark_failed(args.run_id, str(exc), args.database_url))
        sys.exit(1)


if __name__ == "__main__":
    main()

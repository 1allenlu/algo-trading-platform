"""
Backtest API routes — Phase 3.

POST /api/backtest/run           — kick off a new backtest
GET  /api/backtest/list          — list recent backtest runs
GET  /api/backtest/{run_id}      — get status/results for a run
"""

from __future__ import annotations

import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.schemas import (
    BacktestListResponse,
    BacktestListItem,
    BacktestMetrics,
    BacktestRequest,
    BacktestRunResponse,
    EquityPoint,
    TradeRecord,
)
from app.services import backtest_service

router = APIRouter()


# ── Helper: parse JSON fields from a BacktestRun ORM row ─────────────────────

def _parse_run(run) -> BacktestRunResponse:
    """Convert a BacktestRun ORM object to a BacktestRunResponse Pydantic model."""
    symbols = run.symbols.split(",") if run.symbols else []

    equity_curve = None
    if run.equity_curve:
        try:
            raw = json.loads(run.equity_curve)
            equity_curve = [EquityPoint(**pt) for pt in raw]
        except Exception:
            equity_curve = None

    benchmark_metrics = None
    if run.benchmark_metrics:
        try:
            bm = json.loads(run.benchmark_metrics)
            benchmark_metrics = BacktestMetrics(**bm)
        except Exception:
            benchmark_metrics = None

    trades = None
    if run.trades:
        try:
            raw = json.loads(run.trades)
            trades = [TradeRecord(**t) for t in raw]
        except Exception:
            trades = None

    return BacktestRunResponse(
        id            = run.id,
        strategy_name = run.strategy_name,
        symbols       = symbols,
        status        = run.status,
        error         = run.error,
        total_return  = run.total_return,
        cagr          = run.cagr,
        sharpe_ratio  = run.sharpe_ratio,
        sortino_ratio = run.sortino_ratio,
        max_drawdown  = run.max_drawdown,
        calmar_ratio  = run.calmar_ratio,
        win_rate      = run.win_rate,
        num_trades    = run.num_trades,
        equity_curve      = equity_curve,
        benchmark_metrics = benchmark_metrics,
        trades            = trades,
        created_at    = run.created_at,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/run", response_model=BacktestRunResponse)
async def run_backtest(
    request:    BacktestRequest,
    bg_tasks:   BackgroundTasks,
    session:    AsyncSession = Depends(get_db),
) -> BacktestRunResponse:
    """
    Start a new backtest asynchronously.

    Creates a DB row immediately (status='running'), then runs the backtest
    in the background. Poll GET /api/backtest/{run_id} for results.
    """
    logger.info(f"Backtest request: strategy={request.strategy}, symbols={request.symbols}")

    # Inject commission/slippage into params so runner.py can extract them.
    # Use dunder-prefixed keys to avoid colliding with strategy-specific params.
    merged_params = {
        **request.params,
        "__commission__": request.commission_pct,
        "__slippage__":   request.slippage_pct,
    }

    # Insert DB row and get ID
    run_id = await backtest_service.create_run(
        session  = session,
        strategy = request.strategy,
        symbols  = request.symbols,
        params   = merged_params,
    )

    # Schedule the subprocess (non-blocking)
    bg_tasks.add_task(
        backtest_service.start_subprocess,
        run_id   = run_id,
        strategy = request.strategy,
        symbols  = request.symbols,
        params   = merged_params,
    )

    # Return immediately with the run_id so the client can start polling
    run = await backtest_service.get_run(run_id, session)
    return _parse_run(run)


@router.get("/list", response_model=BacktestListResponse)
async def list_backtests(
    limit:   int     = 20,
    session: AsyncSession = Depends(get_db),
) -> BacktestListResponse:
    """List the most recent backtest runs (summary only, no equity curve)."""
    runs = await backtest_service.list_runs(session, limit=limit)

    items = [
        BacktestListItem(
            id            = r.id,
            strategy_name = r.strategy_name,
            symbols       = r.symbols.split(",") if r.symbols else [],
            status        = r.status,
            sharpe_ratio  = r.sharpe_ratio,
            total_return  = r.total_return,
            max_drawdown  = r.max_drawdown,
            created_at    = r.created_at,
        )
        for r in runs
    ]
    return BacktestListResponse(runs=items, count=len(items))


@router.get("/{run_id}", response_model=BacktestRunResponse)
async def get_backtest(
    run_id:  int,
    session: AsyncSession = Depends(get_db),
) -> BacktestRunResponse:
    """Get the full results (or current status) of a backtest run."""
    run = await backtest_service.get_run(run_id, session)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Backtest run {run_id} not found")
    return _parse_run(run)

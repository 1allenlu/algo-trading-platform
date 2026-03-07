"""
Strategy Optimization routes — Phase 10.

Runs grid-search hyperparameter optimization for any backtest strategy.
Each "optimization run" tests N parameter combinations in-memory and ranks
them by a user-chosen objective metric (Sharpe, total return, Calmar, Sortino).

Endpoints:
  POST /api/optimize/run         → create job + start thread → {opt_id, total_trials}
  GET  /api/optimize/{opt_id}    → status, progress, and results when done
  GET  /api/optimize/list        → recent optimization runs (summary)
  GET  /api/optimize/params      → default param grids per strategy (for UI)
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal, OptimizationRun
from app.services.optimization_service import (
    PARAM_SPACES,
    generate_combinations,
    start_optimization,
    MAX_TRIALS,
)

router = APIRouter()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ── Request / response schemas ────────────────────────────────────────────────

class OptimizeRequest(BaseModel):
    strategy:   str               = Field(description="Strategy name: pairs_trading | momentum | mean_reversion")
    symbols:    list[str]         = Field(description="Symbol list (must match strategy requirements)")
    param_grid: dict[str, list]   = Field(description="Dict of param_name → list of values to try")
    objective:  str               = Field(
        default="sharpe",
        description="Metric to maximise: sharpe | total_return | calmar | sortino",
    )

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "strategy":   "mean_reversion",
            "symbols":    ["SPY"],
            "param_grid": {"window": [10, 20, 30], "num_std": [1.5, 2.0, 2.5]},
            "objective":  "sharpe",
        }
    })


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/params")
async def get_default_params() -> dict:
    """Return the default parameter search grids for each strategy."""
    return PARAM_SPACES


@router.post("/run", status_code=202)
async def run_optimization(
    body: OptimizeRequest,
    db:   AsyncSession = Depends(get_db),
) -> dict:
    """
    Launch a hyperparameter grid search.

    Creates an optimization_runs row, then starts a daemon thread.
    Returns immediately with the opt_id — poll GET /api/optimize/{opt_id} for progress.
    """
    valid_objectives = {"sharpe", "total_return", "calmar", "sortino"}
    if body.objective not in valid_objectives:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid objective '{body.objective}'. Must be one of: {sorted(valid_objectives)}",
        )
    if not body.param_grid:
        raise HTTPException(status_code=400, detail="param_grid must not be empty")

    combos = generate_combinations(body.param_grid)
    total  = min(len(combos), MAX_TRIALS)

    run = OptimizationRun(
        strategy        = body.strategy,
        symbols         = ",".join(s.upper() for s in body.symbols),
        param_grid_json = json.dumps(body.param_grid),
        objective       = body.objective,
        status          = "queued",
        total_trials    = total,
        completed_trials = 0,
        created_at      = datetime.now(timezone.utc),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    start_optimization(
        opt_id     = int(run.id),
        strategy   = body.strategy,
        symbols    = [s.upper() for s in body.symbols],
        param_grid = body.param_grid,
        objective  = body.objective,
    )

    logger.info(f"Optimization run {run.id} launched: {body.strategy} {total} trials")
    return {"opt_id": run.id, "total_trials": total, "status": "queued"}


@router.get("/list")
async def list_optimizations(
    limit: int = 20,
    db:    AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return recent optimization runs (newest first, summary only)."""
    rows = (await db.scalars(
        select(OptimizationRun)
        .order_by(OptimizationRun.created_at.desc())
        .limit(limit)
    )).all()

    return [
        {
            "id":               r.id,
            "strategy":         r.strategy,
            "symbols":          r.symbols.split(","),
            "objective":        r.objective,
            "status":           r.status,
            "total_trials":     r.total_trials,
            "completed_trials": r.completed_trials,
            "best_sharpe":      r.best_sharpe,
            "best_return":      r.best_return,
            "best_params":      json.loads(r.best_params_json) if r.best_params_json else None,
            "created_at":       r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/{opt_id}")
async def get_optimization(
    opt_id: int,
    db:     AsyncSession = Depends(get_db),
) -> dict:
    """
    Return full details for one optimization run.
    When status='done', includes the ranked results list and best params.
    """
    run = await db.get(OptimizationRun, opt_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Optimization run {opt_id} not found")

    results = json.loads(run.results_json) if run.results_json else []

    return {
        "id":               run.id,
        "strategy":         run.strategy,
        "symbols":          run.symbols.split(","),
        "param_grid":       json.loads(run.param_grid_json),
        "objective":        run.objective,
        "status":           run.status,
        "error":            run.error,
        "total_trials":     run.total_trials,
        "completed_trials": run.completed_trials,
        "results":          results,           # list[TrialResult], sorted by objective
        "best_params":      json.loads(run.best_params_json) if run.best_params_json else None,
        "best_sharpe":      run.best_sharpe,
        "best_return":      run.best_return,
        "created_at":       run.created_at.isoformat(),
        "completed_at":     run.completed_at.isoformat() if run.completed_at else None,
    }

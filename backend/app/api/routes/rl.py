"""
Reinforcement Learning Agent API routes — Phase 42.

Endpoints:
  POST /api/rl/train/{symbol}    Train Q-table on DB price history; saves to /tmp
  GET  /api/rl/predict/{symbol}  Return greedy action from saved Q-table
  GET  /api/rl/status/{symbol}   Check if a Q-table exists for this symbol
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.database import MarketData

router = APIRouter()

# Q-tables stored in /tmp/rl_models/{symbol}.json inside the container
_MODEL_DIR = Path("/tmp/rl_models")


def _q_path(symbol: str) -> Path:
    return _MODEL_DIR / f"{symbol.upper()}.json"


async def _load_closes(symbol: str, db: AsyncSession) -> np.ndarray:
    rows = await db.execute(
        select(MarketData.close)
        .where(MarketData.symbol == symbol.upper())
        .order_by(MarketData.timestamp.asc())
    )
    closes = np.array([float(r[0]) for r in rows.all()])
    if len(closes) < 50:
        raise HTTPException(status_code=422, detail=f"Not enough data for {symbol} (need ≥50 bars)")
    return closes


# ── Train ─────────────────────────────────────────────────────────────────────

async def _run_training(symbol: str, n_episodes: int, db_url: str) -> None:
    """Background training task — runs synchronously in executor thread."""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession as _AS
    from sqlalchemy.orm import sessionmaker
    from app.models.database import MarketData as MD
    from sqlalchemy import select as _sel

    engine = create_async_engine(db_url, echo=False)
    async with engine.connect() as conn:
        rows = await conn.execute(
            _sel(MD.close)
            .where(MD.symbol == symbol.upper())
            .order_by(MD.timestamp.asc())
        )
        closes = np.array([float(r[0]) for r in rows.all()])
    await engine.dispose()

    if len(closes) < 50:
        logger.warning(f"[rl] Not enough data for {symbol}")
        return

    # Import from ml_engine (PYTHONPATH=/  in container)
    from ml_engine.rl_agent import train, save_q_table  # type: ignore
    logger.info(f"[rl] Training Q-table for {symbol} ({n_episodes} episodes, {len(closes)} bars)")
    q_table = train(closes, n_episodes=n_episodes)
    save_q_table(q_table, _q_path(symbol))
    logger.info(f"[rl] Q-table saved for {symbol} ({len(q_table)} states)")


@router.post("/train/{symbol}")
async def train_rl(
    symbol: str,
    background_tasks: BackgroundTasks,
    n_episodes: int = Query(default=50, ge=5, le=500),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Trigger Q-table training for the given symbol.
    Runs in the background; returns immediately.
    """
    # Verify data exists before queueing
    await _load_closes(symbol, db)

    from app.core.config import settings
    background_tasks.add_task(
        _run_training, symbol=symbol.upper(), n_episodes=n_episodes, db_url=settings.DATABASE_URL
    )
    return {
        "symbol":     symbol.upper(),
        "status":     "training_started",
        "n_episodes": n_episodes,
        "message":    f"Q-table training queued for {symbol.upper()}. Poll /api/rl/status/{symbol.upper()} to check completion.",
    }


# ── Predict ───────────────────────────────────────────────────────────────────

@router.get("/predict/{symbol}")
async def predict_rl(
    symbol: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Return greedy action recommendation from the saved Q-table.
    Raises 404 if no Q-table exists (train first).
    """
    path = _q_path(symbol)
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No trained Q-table for {symbol}. Call POST /api/rl/train/{symbol} first.",
        )

    closes = await _load_closes(symbol, db)

    try:
        from ml_engine.rl_agent import predict, load_q_table  # type: ignore
        q_table = load_q_table(path)
        result  = predict(closes, q_table)
    except Exception as exc:
        logger.exception(f"[rl] predict({symbol}) failed: {exc}")
        raise HTTPException(status_code=500, detail="Prediction failed")

    return {
        "symbol":  symbol.upper(),
        "bars_used": len(closes),
        **result,
    }


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status/{symbol}")
async def rl_status(symbol: str) -> dict:
    """Check whether a trained Q-table exists for this symbol."""
    path = _q_path(symbol)
    if path.exists():
        stat    = path.stat()
        size_kb = stat.st_size / 1024
        return {
            "symbol":   symbol.upper(),
            "trained":  True,
            "size_kb":  round(size_kb, 1),
            "modified": stat.st_mtime,
        }
    return {"symbol": symbol.upper(), "trained": False}

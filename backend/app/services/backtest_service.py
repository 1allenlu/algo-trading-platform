"""
Backtest service — manages backtest job lifecycle.

Flow:
  1. Route handler calls create_run() → inserts DB row → returns run_id
  2. Route handler schedules start_subprocess(run_id, ...) as BackgroundTask
  3. BackgroundTask spawns a daemon thread
  4. Thread runs the backtest runner script as a subprocess
  5. Runner updates the DB row directly (status, metrics, equity_curve, etc.)
  6. Client polls GET /api/backtest/{run_id} which queries the DB

This DB-backed approach (vs in-memory dict used by ML training) is cleaner
for backtests: results survive backend restarts and can be browsed later.
"""

from __future__ import annotations

import json
import subprocess
import sys
import threading
from datetime import datetime, timezone

import asyncpg
from loguru import logger
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.database import BacktestRun


# ── DB helpers ────────────────────────────────────────────────────────────────

async def create_run(
    session:  AsyncSession,
    strategy: str,
    symbols:  list[str],
    params:   dict,
) -> int:
    """
    Insert a new backtest_runs row with status='running'.
    Returns the new row's integer ID.
    """
    run = BacktestRun(
        strategy_name = strategy,
        symbols       = ",".join(s.upper() for s in symbols),
        params        = json.dumps(params),
        status        = "running",
        created_at    = datetime.now(timezone.utc),
    )
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return int(run.id)


async def get_run(run_id: int, session: AsyncSession) -> BacktestRun | None:
    """Fetch a BacktestRun row by id."""
    result = await session.execute(
        select(BacktestRun).where(BacktestRun.id == run_id)
    )
    return result.scalar_one_or_none()


async def list_runs(session: AsyncSession, limit: int = 20) -> list[BacktestRun]:
    """Return the most recent backtest runs."""
    result = await session.execute(
        select(BacktestRun).order_by(desc(BacktestRun.created_at)).limit(limit)
    )
    return list(result.scalars().all())


# ── Subprocess management ─────────────────────────────────────────────────────

def start_subprocess(
    run_id:   int,
    strategy: str,
    symbols:  list[str],
    params:   dict,
) -> None:
    """
    Start the backtest runner as a background daemon thread.
    Non-blocking — returns immediately. The thread manages the subprocess.
    """
    db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    t = threading.Thread(
        target  = _run_subprocess,
        args    = (run_id, strategy, symbols, params, db_url),
        daemon  = True,
        name    = f"backtest-{run_id}",
    )
    t.start()
    logger.info(f"Backtest subprocess thread started: run_id={run_id}, strategy={strategy}")


def _run_subprocess(
    run_id:   int,
    strategy: str,
    symbols:  list[str],
    params:   dict,
    db_url:   str,
) -> None:
    """
    Runs in a daemon thread. Launches runner.py and waits for completion.
    The runner.py script updates the DB row itself on success or failure.
    If the subprocess crashes unexpectedly, this thread marks the run failed.
    """
    cmd = [
        sys.executable,
        "/quant_engine/backtest/runner.py",
        "--run-id",   str(run_id),
        "--strategy", strategy,
        "--symbols",  *[s.upper() for s in symbols],
        "--params",   json.dumps(params),
        "--database-url", db_url,
    ]

    logger.info(f"[backtest-{run_id}] Starting subprocess: {strategy} {symbols}")
    try:
        proc = subprocess.run(
            cmd,
            capture_output = True,
            text           = True,
            timeout        = 300,     # 5-minute timeout
            env            = {"PYTHONPATH": "/", "HOME": "/root", "PATH": "/usr/local/bin:/usr/bin:/bin"},
        )
        if proc.stdout:
            logger.info(f"[backtest-{run_id}] stdout:\n{proc.stdout.strip()}")
        if proc.returncode != 0:
            err = proc.stderr[-1000:] if proc.stderr else "Unknown error"
            logger.error(f"[backtest-{run_id}] Subprocess failed (rc={proc.returncode}): {err}")
            _sync_mark_failed(run_id, err, db_url)

    except subprocess.TimeoutExpired:
        logger.error(f"[backtest-{run_id}] Timed out after 300s")
        _sync_mark_failed(run_id, "Backtest timed out (>5 min)", db_url)

    except Exception as exc:
        logger.exception(f"[backtest-{run_id}] Unexpected error: {exc}")
        _sync_mark_failed(run_id, str(exc), db_url)


def _sync_mark_failed(run_id: int, error: str, db_url: str) -> None:
    """
    Synchronously mark a run as failed via asyncpg.
    Called from a plain thread (not an async context), so we use asyncio.run().
    """
    import asyncio

    async def _update() -> None:
        conn = await asyncpg.connect(db_url)
        try:
            await conn.execute(
                "UPDATE backtest_runs SET status='failed', error=$2 WHERE id=$1",
                run_id, error[:2000],
            )
        finally:
            await conn.close()

    try:
        asyncio.run(_update())
    except Exception as e:
        logger.error(f"[backtest-{run_id}] Failed to mark run as failed in DB: {e}")

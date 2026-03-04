"""
ML service — Phase 2.

Bridges the FastAPI backend with the ml_engine training/prediction code.

Responsibilities:
  1. Trigger model training as a background task (no blocking)
  2. Track job status in memory (simple dict, survives single process only)
  3. Query ml_models and ml_predictions tables for the API to serve
  4. Parse JSON blobs (feature_importance, params) from the DB

Architecture note:
  - Training is CPU-bound and takes 30-120s for XGBoost.
  - We use FastAPI BackgroundTasks (thread pool) — adequate for demo scale.
  - For production: replace with Celery + Redis queue.
  - The ml_engine package is mounted from /ml_engine into the backend container.
"""

from __future__ import annotations

import json
import subprocess
import sys
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from loguru import logger
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import MLModel, MLPrediction


# ── In-memory job tracker ─────────────────────────────────────────────────────
# Maps job_id → {status, result, error}
# Resets on container restart — acceptable for demo/Phase 2.

_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()


def _set_job(job_id: str, **kwargs: Any) -> None:
    with _jobs_lock:
        _jobs.setdefault(job_id, {}).update(kwargs)


def get_job_status(job_id: str) -> dict[str, Any] | None:
    with _jobs_lock:
        return _jobs.get(job_id)


# ── Training runner ───────────────────────────────────────────────────────────

def _run_training_subprocess(
    job_id:     str,
    symbol:     str,
    model_type: str,
    db_url:     str,
) -> None:
    """
    Run training as a subprocess (isolates heavy computation + PyPI imports).

    The ml_engine train.py script is called with the same DB URL the backend uses,
    swapping the asyncpg driver prefix for a plain postgresql:// URL.

    This function runs in a background thread (via FastAPI BackgroundTasks).
    """
    _set_job(job_id, status="running", started_at=datetime.now(tz=timezone.utc).isoformat())
    logger.info(f"[job={job_id}] Training {model_type} for {symbol}")

    try:
        # Locate train.py relative to the mounted ml_engine directory
        train_script = Path("/ml_engine/train.py")
        if not train_script.exists():
            # Fallback: try relative path (local dev without Docker)
            train_script = Path(__file__).parent.parent.parent.parent / "ml-engine" / "train.py"

        if not train_script.exists():
            raise FileNotFoundError(
                f"ml_engine/train.py not found at {train_script}. "
                "Ensure ml-engine is mounted at /ml_engine in docker-compose."
            )

        # Convert asyncpg URL to plain postgresql:// for the subprocess
        pg_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

        result = subprocess.run(
            [
                sys.executable,
                str(train_script),
                "--symbol", symbol,
                "--model",  model_type,
                "--database-url", pg_url,
                "--output-dir", "/data/models",
            ],
            capture_output=True,
            text=True,
            timeout=600,     # 10-minute max training time
        )

        if result.returncode == 0:
            logger.info(f"[job={job_id}] Training completed successfully")
            _set_job(
                job_id,
                status="done",
                result={"output": result.stdout[-2000:]},   # Last 2000 chars of output
                completed_at=datetime.now(tz=timezone.utc).isoformat(),
            )
        else:
            error_msg = result.stderr[-1000:] or result.stdout[-1000:]
            logger.error(f"[job={job_id}] Training failed: {error_msg}")
            _set_job(job_id, status="failed", error=error_msg)

    except subprocess.TimeoutExpired:
        _set_job(job_id, status="failed", error="Training timed out after 10 minutes")
    except Exception as exc:
        _set_job(job_id, status="failed", error=str(exc))
        logger.exception(f"[job={job_id}] Unexpected error during training")


def start_training_job(symbol: str, model_type: str, db_url: str) -> str:
    """
    Kick off a training job in a background thread.

    Returns the job_id immediately so the caller can poll for status.
    """
    job_id = str(uuid.uuid4())[:8]     # Short ID for readability
    _set_job(job_id, status="queued", symbol=symbol, model_type=model_type)

    thread = threading.Thread(
        target=_run_training_subprocess,
        args=(job_id, symbol, model_type, db_url),
        daemon=True,
    )
    thread.start()

    logger.info(f"Training job queued: job_id={job_id} symbol={symbol} model={model_type}")
    return job_id


# ── DB query helpers ──────────────────────────────────────────────────────────

def _parse_json_field(value: str | None) -> dict | None:
    """Safely parse a JSON string field from the DB."""
    if value is None:
        return None
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return None


async def list_models(db: AsyncSession) -> list[MLModel]:
    """Return all trained models, newest first."""
    result = await db.execute(
        select(MLModel).order_by(desc(MLModel.created_at))
    )
    models = list(result.scalars().all())

    # Parse JSON fields (SQLAlchemy stores them as Text)
    for m in models:
        if isinstance(m.feature_importance, str):
            m.feature_importance = _parse_json_field(m.feature_importance)
        if isinstance(m.params, str):
            m.params = _parse_json_field(m.params)

    return models


async def get_latest_model(
    db: AsyncSession, symbol: str, model_type: str = "xgboost"
) -> MLModel | None:
    """Return the latest trained model for a (symbol, model_type) pair."""
    result = await db.execute(
        select(MLModel)
        .where(MLModel.symbol == symbol.upper())
        .where(MLModel.model_type == model_type)
        .order_by(desc(MLModel.version))
        .limit(1)
    )
    model = result.scalar_one_or_none()
    if model and isinstance(model.feature_importance, str):
        model.feature_importance = _parse_json_field(model.feature_importance)
    return model


async def get_predictions(
    db:       AsyncSession,
    symbol:   str,
    model_id: int,
    limit:    int = 60,
) -> list[MLPrediction]:
    """Return the N most recent predictions for a (symbol, model_id) pair."""
    result = await db.execute(
        select(MLPrediction)
        .where(MLPrediction.symbol == symbol.upper())
        .where(MLPrediction.model_id == model_id)
        .order_by(desc(MLPrediction.timestamp))
        .limit(limit)
    )
    # Return in chronological order (ascending)
    return list(reversed(result.scalars().all()))

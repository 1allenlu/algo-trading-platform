"""
ML API routes — Phase 2.

Endpoints:
  POST /api/ml/train                    Trigger model training (async job)
  GET  /api/ml/status/{job_id}          Poll training job status
  GET  /api/ml/models                   List all trained models
  GET  /api/ml/predict/{symbol}         Latest predictions for a symbol
  GET  /api/ml/features/{symbol}        Feature importance for best model

All training is non-blocking: POST /api/ml/train returns a job_id immediately,
and the client polls /api/ml/status/{job_id} until status == "done" | "failed".
"""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.models.schemas import (
    MLModelInfo,
    MLModelsResponse,
    MLPredictResponse,
    PredictionBar,
    TrainJobResponse,
    TrainRequest,
    TrainStatusResponse,
)
from app.services import ml_service

router = APIRouter()


# ── POST /api/ml/train ────────────────────────────────────────────────────────

@router.post(
    "/train",
    response_model=TrainJobResponse,
    summary="Trigger ML model training",
)
async def train_model(
    body: TrainRequest,
    db:   AsyncSession = Depends(get_db),
) -> TrainJobResponse:
    """
    Start an asynchronous training job.

    Returns a `job_id` immediately. Poll `GET /api/ml/status/{job_id}`
    to check when training finishes (~1-3 min for XGBoost on 5yr data).

    The trained model is saved to `/data/models/` and its metrics are
    recorded in the `ml_models` table.
    """
    symbol     = body.symbol.upper().strip()
    model_type = body.model_type.lower()

    if model_type not in ("xgboost", "lstm"):
        raise HTTPException(status_code=422, detail="model_type must be 'xgboost' or 'lstm'")

    if model_type == "lstm":
        raise HTTPException(
            status_code=422,
            detail=(
                "LSTM training requires PyTorch which is not installed in the backend container. "
                "Run: docker compose exec backend python /ml_engine/train.py --symbol SPY --model lstm"
            ),
        )

    job_id = ml_service.start_training_job(
        symbol=symbol,
        model_type=model_type,
        db_url=settings.DATABASE_URL,
    )

    logger.info(f"Training job started: job_id={job_id} symbol={symbol} model={model_type}")

    return TrainJobResponse(
        job_id=job_id,
        symbol=symbol,
        model_type=model_type,
        status="queued",
        message=f"Training {model_type} for {symbol}. Poll /api/ml/status/{job_id} for updates.",
    )


# ── GET /api/ml/status/{job_id} ───────────────────────────────────────────────

@router.get(
    "/status/{job_id}",
    response_model=TrainStatusResponse,
    summary="Poll training job status",
)
async def get_train_status(job_id: str) -> TrainStatusResponse:
    """
    Check the status of a training job.

    Status values:
      - `queued`  — job is waiting to start
      - `running` — training in progress
      - `done`    — training completed successfully (result contains metrics)
      - `failed`  — training failed (error contains the message)
    """
    job = ml_service.get_job_status(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    return TrainStatusResponse(
        job_id=job_id,
        status=job.get("status", "unknown"),
        result=job.get("result"),
        error=job.get("error"),
    )


# ── GET /api/ml/models ────────────────────────────────────────────────────────

@router.get(
    "/models",
    response_model=MLModelsResponse,
    summary="List all trained ML models",
)
async def list_models(db: AsyncSession = Depends(get_db)) -> MLModelsResponse:
    """
    Return all trained models with their metrics and feature importance.

    Sorted newest first. Each entry shows accuracy, F1, AUC, and top features.
    """
    models = await ml_service.list_models(db)

    model_infos = []
    for m in models:
        fi = m.feature_importance if isinstance(m.feature_importance, dict) else {}
        model_infos.append(
            MLModelInfo(
                id=m.id,
                name=m.name,
                symbol=m.symbol,
                model_type=m.model_type,
                version=m.version,
                accuracy=m.accuracy,
                f1_score=m.f1_score,
                roc_auc=m.roc_auc,
                train_samples=m.train_samples,
                test_samples=m.test_samples,
                feature_count=m.feature_count,
                feature_importance=dict(list(fi.items())[:15]),   # Top 15 features
                created_at=m.created_at,
            )
        )

    return MLModelsResponse(models=model_infos, count=len(model_infos))


# ── GET /api/ml/predict/{symbol} ─────────────────────────────────────────────

@router.get(
    "/predict/{symbol}",
    response_model=MLPredictResponse,
    summary="Get ML predictions for a symbol",
)
async def get_predictions(
    symbol: str,
    limit: Annotated[int, Query(ge=1, le=500, description="Number of recent predictions")] = 60,
    model_type: Annotated[str, Query(description="Model type: 'xgboost' or 'lstm'")] = "xgboost",
    db: AsyncSession = Depends(get_db),
) -> MLPredictResponse:
    """
    Return recent ML predictions from the best trained model for `symbol`.

    Each bar shows: date, predicted direction (up/down), and confidence (0.5-1.0).
    Predictions are pre-computed at training time — no model inference at request time.
    """
    symbol = symbol.upper().strip()

    model = await ml_service.get_latest_model(db, symbol, model_type)
    if model is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No trained {model_type} model found for '{symbol}'. "
                f"Train one via POST /api/ml/train with {{symbol: '{symbol}', model_type: '{model_type}'}}"
            ),
        )

    predictions = await ml_service.get_predictions(db, symbol, model.id, limit=limit)
    if not predictions:
        raise HTTPException(
            status_code=404,
            detail=f"No predictions stored for model '{model.name}'. Retrain the model.",
        )

    bars = [
        PredictionBar(
            timestamp=p.timestamp,
            predicted_dir=p.predicted_dir,
            confidence=p.confidence,
            actual_return=p.actual_return,
        )
        for p in predictions
    ]

    return MLPredictResponse(
        symbol=symbol,
        model_name=model.name,
        model_type=model.model_type,
        accuracy=model.accuracy,
        bars=bars,
        count=len(bars),
    )


# ── GET /api/ml/features/{symbol} ────────────────────────────────────────────

@router.get(
    "/features/{symbol}",
    summary="Get feature importance for the best model",
)
async def get_feature_importance(
    symbol:     str,
    model_type: Annotated[str, Query()] = "xgboost",
    top_n:      Annotated[int, Query(ge=5, le=42)] = 20,
    db:         AsyncSession = Depends(get_db),
) -> dict:
    """
    Return the top N most important features for the best trained model.

    Feature importance is XGBoost's gain-based importance:
    average gain when the feature is used in a split (higher = more useful).
    """
    symbol = symbol.upper().strip()
    model  = await ml_service.get_latest_model(db, symbol, model_type)

    if model is None:
        raise HTTPException(
            status_code=404,
            detail=f"No trained {model_type} model for '{symbol}'.",
        )

    fi = model.feature_importance if isinstance(model.feature_importance, dict) else {}
    # Return top N, sorted descending
    top_features = dict(sorted(fi.items(), key=lambda x: x[1], reverse=True)[:top_n])

    return {
        "symbol":     symbol,
        "model_name": model.name,
        "model_type": model.model_type,
        "accuracy":   model.accuracy,
        "features":   top_features,
        "count":      len(top_features),
    }

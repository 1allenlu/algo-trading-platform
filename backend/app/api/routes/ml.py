"""
ML API routes — Phase 2 + Phase 6.

Endpoints:
  POST /api/ml/train                    Trigger model training (async job)
  GET  /api/ml/status/{job_id}          Poll training job status
  GET  /api/ml/models                   List all trained models
  GET  /api/ml/predict/{symbol}         Latest predictions for a symbol
  GET  /api/ml/features/{symbol}        Feature importance for best model
  GET  /api/ml/shap/{symbol}            SHAP explainability (Phase 6)
  GET  /api/ml/sentiment/{symbol}       RSI+MA sentiment score (Phase 6)
  GET  /api/ml/signal/{symbol}          Composite BUY/HOLD/SELL signal (Phase 6)

All training is non-blocking: POST /api/ml/train returns a job_id immediately,
and the client polls /api/ml/status/{job_id} until status == "done" | "failed".
"""

import asyncio
from typing import Annotated

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.models.database import MarketData
from app.models.schemas import (
    MLModelInfo,
    MLModelsResponse,
    MLPredictResponse,
    PredictionBar,
    RegimeBar,
    RegimeResponse,
    SHAPFeatureContribution,
    SHAPResponse,
    SentimentComponents,
    SentimentResponse,
    SignalResponse,
    SubSignal,
    SubSignals,
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


# ── Phase 6: Advanced ML endpoints ───────────────────────────────────────────


def _build_ohlcv_df(ohlcv_rows: list) -> pd.DataFrame:
    """Build a dated OHLCV DataFrame from ORM rows (shared by Phase 6 routes)."""
    df = pd.DataFrame([
        {
            "open": r.open, "high": r.high, "low": r.low,
            "close": r.close, "volume": r.volume,
        }
        for r in ohlcv_rows
    ])
    df.index = pd.to_datetime([r.timestamp for r in ohlcv_rows], utc=True)
    return df


# ── GET /api/ml/sentiment/{symbol} ───────────────────────────────────────────

@router.get(
    "/sentiment/{symbol}",
    response_model=SentimentResponse,
    summary="RSI + moving-average sentiment score (Phase 6)",
)
async def get_sentiment(
    symbol: str,
    db:     AsyncSession = Depends(get_db),
) -> SentimentResponse:
    """
    Derive a market sentiment score from price/momentum patterns.

    No external data needed — computed from the closing prices already in the DB.

    Score range: -1.0 (very bearish) to +1.0 (very bullish).
    Components: RSI(14) zone, price vs SMA(50), price vs SMA(200).
    """
    symbol = symbol.upper().strip()

    result = await db.execute(
        select(MarketData)
        .where(MarketData.symbol == symbol)
        .order_by(MarketData.timestamp.asc())
    )
    ohlcv_rows = result.scalars().all()

    if len(ohlcv_rows) < 210:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 210 bars for '{symbol}' to compute sentiment. "
                   f"Currently have {len(ohlcv_rows)} bars. Run 'make ingest' first.",
        )

    df = _build_ohlcv_df(ohlcv_rows)

    from app.services.sentiment_service import compute_sentiment
    data = compute_sentiment(df)

    return SentimentResponse(
        symbol=symbol,
        score=data["score"],
        label=data["label"],
        rsi_14=data["rsi_14"],
        price_vs_sma50=data["price_vs_sma50"],
        price_vs_sma200=data["price_vs_sma200"],
        components=SentimentComponents(**data["components"]),
    )


# ── GET /api/ml/signal/{symbol} ──────────────────────────────────────────────

@router.get(
    "/signal/{symbol}",
    response_model=SignalResponse,
    summary="Composite BUY/HOLD/SELL signal (Phase 6)",
)
async def get_composite_signal(
    symbol: str,
    db:     AsyncSession = Depends(get_db),
) -> SignalResponse:
    """
    Aggregate ML, sentiment, and technical signals into a single action.

    Requires a trained XGBoost model (POST /api/ml/train) and stored predictions.
    Weights: ML 50%, Sentiment 30%, Technical 20%.
    BUY when composite > +0.35, SELL when < -0.35, else HOLD.
    """
    symbol = symbol.upper().strip()

    # ── 1. Get latest stored ML prediction (avoids model reload) ─────────────
    model = await ml_service.get_latest_model(db, symbol, "xgboost")
    if model is None:
        raise HTTPException(
            status_code=404,
            detail=f"No trained xgboost model for '{symbol}'. Train first via POST /api/ml/train.",
        )

    preds = await ml_service.get_predictions(db, symbol, model.id, limit=1)
    if not preds:
        raise HTTPException(
            status_code=404,
            detail="No predictions stored. Retrain the model.",
        )
    pred = preds[-1]

    # ── 2. Load OHLCV and compute sentiment + MACD inline ────────────────────
    result = await db.execute(
        select(MarketData)
        .where(MarketData.symbol == symbol)
        .order_by(MarketData.timestamp.asc())
    )
    ohlcv_rows = result.scalars().all()

    if len(ohlcv_rows) < 210:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 210 bars for '{symbol}'. Currently have {len(ohlcv_rows)}.",
        )

    df = _build_ohlcv_df(ohlcv_rows)

    from ml_engine.features.technical import macd as compute_macd
    from app.services.sentiment_service import compute_sentiment

    sentiment = compute_sentiment(df)
    _, _, macd_hist_series = compute_macd(df["close"])

    latest_features = {
        "rsi_14":    sentiment["rsi_14"],
        "macd_hist": float(macd_hist_series.iloc[-1]),
    }

    # ── 3. Aggregate ──────────────────────────────────────────────────────────
    from app.services.signal_service import compute_composite_signal
    data = compute_composite_signal(
        ml_direction=pred.predicted_dir,
        ml_confidence=pred.confidence,
        sentiment_score=sentiment["score"],
        latest_features=latest_features,
    )

    return SignalResponse(
        symbol=symbol,
        signal=data["signal"],
        confidence=data["confidence"],
        score=data["score"],
        reasoning=data["reasoning"],
        sub_signals=SubSignals(
            ml        = SubSignal(**data["sub_signals"]["ml"]),
            sentiment = SubSignal(**data["sub_signals"]["sentiment"]),
            technical = SubSignal(**data["sub_signals"]["technical"]),
        ),
    )


# ── GET /api/ml/shap/{symbol} ────────────────────────────────────────────────

@router.get(
    "/shap/{symbol}",
    response_model=SHAPResponse,
    summary="SHAP feature explanations for the latest prediction (Phase 6)",
)
async def get_shap_values(
    symbol:     str,
    model_type: Annotated[str, Query()] = "xgboost",
    top_n:      Annotated[int, Query(ge=5, le=40)] = 12,
    db:         AsyncSession = Depends(get_db),
) -> SHAPResponse:
    """
    Compute SHAP values for the most recent bar's XGBoost prediction.

    Uses shap.TreeExplainer (exact, no approximation).
    Positive SHAP value → feature pushes prediction toward UP.
    Negative SHAP value → feature pushes prediction toward DOWN.

    This endpoint takes ~100-300ms (CPU-bound model load + SHAP inference).
    """
    symbol = symbol.upper().strip()

    model = await ml_service.get_latest_model(db, symbol, model_type)
    if model is None:
        raise HTTPException(
            status_code=404,
            detail=f"No trained {model_type} model for '{symbol}'. "
                   f"Train one via POST /api/ml/train.",
        )

    result = await db.execute(
        select(MarketData)
        .where(MarketData.symbol == symbol)
        .order_by(MarketData.timestamp.asc())
    )
    ohlcv_rows = result.scalars().all()

    if len(ohlcv_rows) < 210:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 210 bars for '{symbol}'. Currently have {len(ohlcv_rows)}.",
        )

    df = _build_ohlcv_df(ohlcv_rows)

    # Build feature matrix using the same pipeline as training
    from ml_engine.features.technical import compute_features, FEATURE_COLUMNS
    feat = compute_features(df)
    feat_cols = [c for c in FEATURE_COLUMNS if c in feat.columns]

    if feat.empty or len(feat_cols) == 0:
        raise HTTPException(status_code=400, detail="Feature computation returned empty result.")

    latest_X = feat[feat_cols].values[-1:]   # Shape (1, n_features)

    # Run SHAP in a thread pool — CPU-bound, ~100-300ms
    from app.services.shap_service import compute_shap_values
    data = await asyncio.to_thread(
        compute_shap_values,
        model.model_path,
        latest_X,
        feat_cols,
        top_n,
    )

    direction = "up" if data["predicted_proba"] >= 0.5 else "down"

    return SHAPResponse(
        symbol=symbol,
        model_name=model.name,
        base_value=data["base_value"],
        predicted_proba=data["predicted_proba"],
        predicted_dir=direction,
        features=[SHAPFeatureContribution(**f) for f in data["features"]],
        count=len(data["features"]),
    )


# ── GET /api/ml/regimes/{symbol} (Phase 35) ───────────────────────────────────

@router.get(
    "/regimes/{symbol}",
    response_model=RegimeResponse,
    summary="Market regime classification (Phase 35)",
)
async def get_regimes(
    symbol: str,
    limit:  Annotated[int, Query(ge=30, le=1260)] = 252,
    db:     AsyncSession = Depends(get_db),
) -> RegimeResponse:
    """
    Classify each trading day as Bull / Bear / Sideways using a rolling
    20-day return threshold (>+5% = bull, <-5% = bear, else sideways).

    Returns the most recent `limit` bars with regime labels, plus aggregate
    statistics (bull_pct, bear_pct, sideways_pct) and the current regime.
    """
    symbol = symbol.upper().strip()

    rows = await db.execute(
        select(MarketData.timestamp, MarketData.close)
        .where(MarketData.symbol == symbol)
        .order_by(MarketData.timestamp.asc())
    )
    data = rows.fetchall()

    if not data:
        raise HTTPException(
            status_code=404,
            detail=f"No market data for '{symbol}'. Run `make ingest` first.",
        )

    closes = pd.Series(
        [float(r[1]) for r in data],
        index=pd.to_datetime([r[0] for r in data]),
        name=symbol,
    )

    try:
        from app.services.regime_service import detect_regimes
        result = detect_regimes(closes, limit=limit)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        logger.exception(f"Regime detection failed: {exc}")
        raise HTTPException(500, f"Regime detection failed: {exc}")

    return RegimeResponse(
        symbol       = symbol,
        bars         = [RegimeBar(**b) for b in result["bars"]],
        current      = result["current"],
        bull_pct     = result["bull_pct"],
        bear_pct     = result["bear_pct"],
        sideways_pct = result["sideways_pct"],
    )


# ── GET /api/ml/ensemble/{symbol} (Phase 49) ──────────────────────────────────

@router.get(
    "/ensemble/{symbol}",
    summary="Ensemble XGBoost + LSTM stacked prediction (Phase 49)",
)
async def get_ensemble_prediction(
    symbol: str,
    db:     AsyncSession = Depends(get_db),
) -> dict:
    """
    Accuracy-weighted meta-learner that blends XGBoost and LSTM signals.

    Each model's vote is scaled by its test accuracy. The blended score maps to
    buy (> +0.1) / sell (< -0.1) / hold. Returns individual model details so
    the UI can render a model-comparison breakdown.
    """
    return await ml_service.get_ensemble_prediction(db, symbol.upper().strip())

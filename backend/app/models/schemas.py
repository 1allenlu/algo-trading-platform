"""
Pydantic v2 schemas for request/response validation.

Separation from SQLAlchemy models:
  - ORM models define the database shape (columns, indexes)
  - Pydantic schemas define the API shape (what's exposed to clients)
  - from_attributes=True enables ORM → Pydantic conversion
"""

from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


# ── Market Data ───────────────────────────────────────────────────────────────

class OHLCVBar(BaseModel):
    """A single OHLCV candlestick bar."""
    model_config = ConfigDict(from_attributes=True)  # Allow .model_validate(orm_obj)

    symbol:    str
    timestamp: datetime
    open:      float = Field(ge=0, description="Opening price")
    high:      float = Field(ge=0, description="Day's high price")
    low:       float = Field(ge=0, description="Day's low price")
    close:     float = Field(ge=0, description="Closing price")
    volume:    int   = Field(ge=0, description="Trading volume (shares)")


class MarketDataResponse(BaseModel):
    """API response wrapping a list of OHLCV bars with metadata."""
    symbol:     str
    bars:       list[OHLCVBar]
    count:      int
    start_date: datetime | None = None
    end_date:   datetime | None = None


# ── Health Check ──────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    """System health status — used by Docker healthcheck + monitoring."""
    status:   str   # "healthy" | "degraded"
    database: str   # "healthy" | "unhealthy"
    redis:    str   # "healthy" | "unhealthy"
    version:  str


# ── ML — Model metadata ───────────────────────────────────────────────────────

class MLModelInfo(BaseModel):
    """Metadata for a trained ML model (read from ml_models table)."""
    model_config = ConfigDict(from_attributes=True)

    id:                 int
    name:               str
    symbol:             str
    model_type:         str
    version:            int
    accuracy:           float | None = None
    f1_score:           float | None = None
    roc_auc:            float | None = None
    train_samples:      int | None = None
    test_samples:       int | None = None
    feature_count:      int | None = None
    feature_importance: dict[str, float] | None = None   # Top features by importance
    created_at:         datetime


class MLModelsResponse(BaseModel):
    """List of trained models."""
    models: list[MLModelInfo]
    count:  int


# ── ML — Predictions ──────────────────────────────────────────────────────────

class PredictionBar(BaseModel):
    """A single model prediction for one date."""
    model_config = ConfigDict(from_attributes=True)

    timestamp:    datetime
    predicted_dir: str          # "up" | "down"
    confidence:   float         # P(predicted class) in [0.5, 1.0]
    actual_return: float | None = None


class MLPredictResponse(BaseModel):
    """Latest ML predictions for a symbol from its best model."""
    symbol:     str
    model_name: str
    model_type: str
    accuracy:   float | None
    bars:       list[PredictionBar]
    count:      int


# ── ML — Train request/response ───────────────────────────────────────────────

class TrainRequest(BaseModel):
    """Request body for POST /api/ml/train."""
    symbol:     str = Field(default="SPY", description="Ticker symbol to train on")
    model_type: str = Field(default="xgboost", description="'xgboost' or 'lstm'")

    model_config = ConfigDict(json_schema_extra={
        "example": {"symbol": "SPY", "model_type": "xgboost"}
    })


class TrainJobResponse(BaseModel):
    """Response for a triggered training job."""
    job_id:     str
    symbol:     str
    model_type: str
    status:     str   # "queued" | "running" | "done" | "failed"
    message:    str


class TrainStatusResponse(BaseModel):
    """Status of a training job."""
    job_id:  str
    status:  str          # "queued" | "running" | "done" | "failed"
    result:  dict[str, Any] | None = None    # Metrics when done
    error:   str | None = None

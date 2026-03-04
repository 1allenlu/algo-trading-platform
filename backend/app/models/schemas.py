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


# ── Backtest (Phase 3) ─────────────────────────────────────────────────────────

class BacktestRequest(BaseModel):
    """POST /api/backtest/run — kick off a backtest."""
    strategy: str = Field(description="Strategy name: pairs_trading | momentum | mean_reversion")
    symbols:  list[str] = Field(description="List of ticker symbols")
    params:   dict[str, Any] = Field(default_factory=dict, description="Optional strategy params")


class EquityPoint(BaseModel):
    """One point on the equity curve (weekly sampled)."""
    date:     str
    value:    float
    drawdown: float


class TradeRecord(BaseModel):
    """One trade in the trade log."""
    date:   str
    symbol: str
    side:   str    # "buy" | "sell"
    price:  float
    size:   float


class BacktestMetrics(BaseModel):
    """Performance metrics for a strategy or benchmark."""
    total_return:  float
    cagr:          float
    annual_vol:    float
    sharpe_ratio:  float
    sortino_ratio: float
    max_drawdown:  float
    calmar_ratio:  float
    win_rate:      float


class BacktestRunResponse(BaseModel):
    """Full response for a completed backtest (GET /api/backtest/{run_id})."""
    model_config = ConfigDict(from_attributes=True)

    id:            int
    strategy_name: str
    symbols:       list[str]
    status:        str
    error:         str | None = None

    # Metrics (null when still running)
    total_return:  float | None = None
    cagr:          float | None = None
    sharpe_ratio:  float | None = None
    sortino_ratio: float | None = None
    max_drawdown:  float | None = None
    calmar_ratio:  float | None = None
    win_rate:      float | None = None
    num_trades:    int | None = None

    equity_curve:      list[EquityPoint] | None = None
    benchmark_metrics: BacktestMetrics | None = None
    trades:            list[TradeRecord] | None = None

    created_at: datetime


class BacktestListItem(BaseModel):
    """Summary row for the backtest history list."""
    model_config = ConfigDict(from_attributes=True)

    id:            int
    strategy_name: str
    symbols:       list[str]
    status:        str
    sharpe_ratio:  float | None = None
    total_return:  float | None = None
    max_drawdown:  float | None = None
    created_at:    datetime


class BacktestListResponse(BaseModel):
    runs:  list[BacktestListItem]
    count: int


# ── Strategies (Phase 3) ───────────────────────────────────────────────────────

class StrategyInfo(BaseModel):
    """Metadata about an available strategy (GET /api/strategies)."""
    name:            str
    description:     str
    method:          str
    default_symbols: list[str]
    min_symbols:     int
    max_symbols:     int
    tags:            list[str]
    default_params:  dict[str, Any]


class StrategiesResponse(BaseModel):
    strategies: list[StrategyInfo]


# ── Risk Management (Phase 4) ─────────────────────────────────────────────────

class AssetRiskMetrics(BaseModel):
    """Risk profile for a single asset."""
    symbol:        str
    annual_return: float        # Annualized expected return
    annual_vol:    float        # Annualized volatility (σ)
    sharpe:        float        # Sharpe ratio (vs 4% risk-free)
    max_drawdown:  float        # Worst historical peak-to-trough (negative)
    beta:          float        # Sensitivity to benchmark (1.0 = moves 1:1)
    var_95:        float        # 1-day 95% historical VaR (positive fraction)


class PortfolioRiskResponse(BaseModel):
    """Complete portfolio risk analysis from GET /api/risk/analysis."""
    symbols:             list[str]
    weights:             list[float]
    assets:              list[AssetRiskMetrics]
    correlation:         list[list[float]]   # NxN pairwise correlation matrix
    portfolio_return:    float               # Weighted annualized return
    portfolio_vol:       float               # Portfolio annualized volatility
    portfolio_sharpe:    float               # Portfolio Sharpe ratio
    portfolio_max_drawdown: float            # Portfolio max drawdown
    portfolio_var_95:    float               # 1-day portfolio VaR (95%)
    portfolio_cvar_95:   float               # 1-day portfolio CVaR / Expected Shortfall
    n_days:              int                 # Number of trading days in analysis


class FrontierPoint(BaseModel):
    """One portfolio on the efficient frontier or random cloud."""
    return_ann: float
    volatility: float
    sharpe:     float
    weights:    list[float] | None = None    # Only for frontier/optimal points


class EfficientFrontierResponse(BaseModel):
    """Efficient frontier data from GET /api/risk/frontier."""
    symbols:    list[str]
    random:     list[FrontierPoint]          # Monte Carlo cloud (no weights)
    frontier:   list[FrontierPoint]          # Optimized frontier points (with weights)
    max_sharpe: FrontierPoint | None         # Tangency portfolio
    min_vol:    FrontierPoint | None         # Global minimum variance portfolio

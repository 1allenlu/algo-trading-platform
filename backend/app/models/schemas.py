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
    strategy:       str = Field(description="Strategy name: pairs_trading | momentum | mean_reversion")
    symbols:        list[str] = Field(description="List of ticker symbols")
    params:         dict[str, Any] = Field(default_factory=dict, description="Optional strategy params")
    commission_pct: float = Field(default=0.001, ge=0, le=0.05,
                                  description="One-way commission as fraction (0.001 = 0.1%)")
    slippage_pct:   float = Field(default=0.0005, ge=0, le=0.02,
                                  description="One-way slippage as fraction (0.0005 = 0.05%)")


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


# ── Paper Trading (Phase 5) ───────────────────────────────────────────────────

class AccountInfo(BaseModel):
    """Live Alpaca paper account snapshot."""
    equity:        float    # Total account value (cash + positions)
    cash:          float    # Free cash available
    buying_power:  float    # Available purchasing power
    day_pnl:       float    # Today's P&L in dollars
    day_pnl_pct:   float    # Today's P&L as fraction
    total_pnl:     float    # Total P&L vs $100k starting equity
    total_pnl_pct: float    # Total P&L as fraction


class PaperPosition(BaseModel):
    """An open position in the paper trading account."""
    symbol:            str
    qty:               float   # Shares held (negative = short)
    avg_entry_price:   float
    current_price:     float
    market_value:      float   # qty * current_price
    unrealized_pnl:    float   # In dollars
    unrealized_pnl_pct: float  # As fraction (e.g., 0.05 = +5%)


class PaperOrder(BaseModel):
    """A single order (pending or historical)."""
    id:               str
    symbol:           str
    side:             str    # "buy" | "sell"
    order_type:       str    # "market" | "limit" | "stop"
    qty:              float
    filled_qty:       float
    status:           str    # "new" | "partially_filled" | "filled" | "canceled" | "expired"
    filled_avg_price: float | None = None
    limit_price:      float | None = None
    created_at:       str    # ISO 8601


class PortfolioPoint(BaseModel):
    """One daily equity snapshot for the portfolio history chart."""
    timestamp: str     # ISO 8601
    equity:    float
    pnl_pct:   float   # Cumulative P&L fraction for that day


class PaperTradingState(BaseModel):
    """
    Full paper trading snapshot returned by GET /api/paper/state.
    Frontend polls this every 2 seconds.
    """
    account:           AccountInfo
    positions:         list[PaperPosition]
    orders:            list[PaperOrder]
    portfolio_history: list[PortfolioPoint]
    last_updated:      str    # ISO 8601 timestamp of this snapshot


class SubmitOrderRequest(BaseModel):
    """POST /api/paper/orders — place a new order."""
    symbol:      str   = Field(description="Ticker symbol, e.g. SPY")
    side:        str   = Field(pattern="^(buy|sell)$", description="'buy' or 'sell'")
    qty:         float = Field(gt=0, description="Number of shares")
    order_type:  str   = Field(default="market", pattern="^(market|limit)$")
    limit_price: float | None = Field(default=None, description="Required for limit orders")

    model_config = ConfigDict(json_schema_extra={
        "example": {"symbol": "SPY", "side": "buy", "qty": 10, "order_type": "market"}
    })


class OrderResponse(BaseModel):
    """Confirmation returned after submitting an order."""
    order_id: str
    status:   str
    message:  str


# ── Advanced ML (Phase 6) ─────────────────────────────────────────────────────

class SHAPFeatureContribution(BaseModel):
    """SHAP contribution for a single feature."""
    name:          str
    shap_value:    float   # Signed: >0 pushes toward "up", <0 toward "down"
    feature_value: float   # Raw (scaled) feature value for context


class SHAPResponse(BaseModel):
    """SHAP explainability for the latest prediction — GET /api/ml/shap/{symbol}."""
    symbol:          str
    model_name:      str
    base_value:      float   # E[f(X)] — model's average log-odds output
    predicted_proba: float   # P(up) for the latest bar
    predicted_dir:   str     # "up" | "down"
    features:        list[SHAPFeatureContribution]   # Top N by |SHAP|
    count:           int


class SentimentComponents(BaseModel):
    """Breakdown of the three sub-signals that make up the sentiment score."""
    rsi_component:    float   # RSI-based sub-score [-0.5, +0.5]
    sma50_component:  float   # Price vs 50-day MA sub-score [-0.3, +0.3]
    sma200_component: float   # Price vs 200-day MA sub-score [-0.2, +0.2]


class SentimentResponse(BaseModel):
    """RSI + moving-average sentiment score — GET /api/ml/sentiment/{symbol}."""
    symbol:          str
    score:           float               # [-1.0, +1.0] composite score
    label:           str                 # "bullish" | "bearish" | "neutral"
    rsi_14:          float               # Latest RSI(14) value (0-100)
    price_vs_sma50:  float               # (close/sma50 - 1) as fraction
    price_vs_sma200: float               # (close/sma200 - 1) as fraction
    components:      SentimentComponents


class SubSignal(BaseModel):
    """One input signal into the composite aggregator."""
    vote:  float   # Normalized [-1, +1] vote
    label: str     # Human-readable description


class SubSignals(BaseModel):
    """The three sub-signals combined in the composite signal aggregator."""
    ml:        SubSignal
    sentiment: SubSignal
    technical: SubSignal


class SignalResponse(BaseModel):
    """Composite BUY/HOLD/SELL signal — GET /api/ml/signal/{symbol}."""
    symbol:      str
    signal:      str          # "buy" | "hold" | "sell"
    confidence:  float        # abs(composite score) in [0, 1]
    score:       float        # Raw weighted composite in [-1, +1]
    reasoning:   list[str]    # Human-readable explanation bullet points
    sub_signals: SubSignals


# ── Alerts (Phase 8) ──────────────────────────────────────────────────────────

ALERT_CONDITIONS = {
    "price_above",
    "price_below",
    "change_pct_above",   # threshold is a percent, e.g. 2.0 means +2%
    "change_pct_below",   # threshold is a percent, e.g. -2.0 means -2%
}


class AlertRuleCreate(BaseModel):
    """POST /api/alerts/rules — create a new alert rule."""
    symbol:           str   = Field(description="Ticker, e.g. SPY")
    condition:        str   = Field(description="price_above|price_below|change_pct_above|change_pct_below")
    threshold:        float = Field(description="Trigger value (price in $ or percent for change_pct_*)")
    cooldown_seconds: int   = Field(default=60, ge=10, description="Minimum seconds between firings")

    model_config = ConfigDict(json_schema_extra={
        "example": {"symbol": "SPY", "condition": "price_above", "threshold": 500.0}
    })


class AlertRuleResponse(BaseModel):
    """A saved alert rule returned from the API."""
    model_config = ConfigDict(from_attributes=True)

    id:               int
    symbol:           str
    condition:        str
    threshold:        float
    is_active:        bool
    cooldown_seconds: int
    last_triggered_at: datetime | None = None
    created_at:       datetime


class AlertRulesListResponse(BaseModel):
    rules: list[AlertRuleResponse]
    count: int


class AlertEventResponse(BaseModel):
    """A fired alert event returned from the API."""
    model_config = ConfigDict(from_attributes=True)

    id:            int
    rule_id:       int
    symbol:        str
    condition:     str
    threshold:     float
    current_value: float
    message:       str
    triggered_at:  datetime
    acknowledged:  bool


class AlertEventsListResponse(BaseModel):
    events: list[AlertEventResponse]
    count:  int


class AlertEventWsMessage(BaseModel):
    """
    JSON payload sent over WS /ws/alerts when a rule fires.
    Frontend uses `type == "alert"` to distinguish from price ticks.
    """
    type:          str = "alert"
    id:            int
    rule_id:       int
    symbol:        str
    condition:     str
    threshold:     float
    current_value: float
    message:       str
    triggered_at:  str    # ISO 8601


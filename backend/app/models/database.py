"""
SQLAlchemy async engine + ORM models.

Architecture note:
  - We use SQLAlchemy 2.0 async API throughout (no legacy Session.execute patterns)
  - TimescaleDB hypertables are created via raw SQL in data/migrations/init.sql
    (TimescaleDB-specific DDL isn't expressible via SQLAlchemy's ORM)
  - The SQLAlchemy models mirror the hypertable schema so the ORM can query them
"""

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Float, func, Index, Integer, String, Text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# ── Async engine ──────────────────────────────────────────────────────────────
# pool_pre_ping=True: test connections before use (handles DB restarts gracefully)
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    echo=settings.DEBUG,          # Log SQL statements when DEBUG=true
    pool_pre_ping=True,
)

# ── Session factory ───────────────────────────────────────────────────────────
# expire_on_commit=False: keep model attributes accessible after commit
# (important for async — avoids lazy-load errors)
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


class MarketData(Base):
    """
    OHLCV (Open/High/Low/Close/Volume) market data.

    This table is converted to a TimescaleDB hypertable on first startup
    (see data/migrations/init.sql). TimescaleDB automatically partitions
    rows into time-based chunks, making range queries dramatically faster
    than plain PostgreSQL at scale (millions of rows / year of tick data).

    Primary key: (symbol, timestamp) — composite key prevents duplicates
    and is required for TimescaleDB hypertable creation.
    """

    __tablename__ = "market_data"

    symbol    = Column(String(20),           primary_key=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), primary_key=True, nullable=False)
    open      = Column(Float,                nullable=False)
    high      = Column(Float,                nullable=False)
    low       = Column(Float,                nullable=False)
    close     = Column(Float,                nullable=False)
    volume    = Column(BigInteger,           nullable=False)

    __table_args__ = (
        # Covering index: fast lookup by symbol within any date range
        Index("ix_market_data_symbol_ts", "symbol", "timestamp"),
    )

    def __repr__(self) -> str:
        return f"<MarketData {self.symbol} @ {self.timestamp} close={self.close}>"


# ── ML Models ─────────────────────────────────────────────────────────────────

class IntradayData(Base):
    """
    Sub-daily OHLCV bars — Phase 31.

    Stores 1m / 5m / 15m / 1h candles fetched from yfinance.
    Partitioned into 1-day TimescaleDB chunks (many rows per day).
    Composite PK (symbol, timestamp, timeframe) prevents duplicates.
    """

    __tablename__ = "intraday_data"

    symbol    = Column(String(20),              primary_key=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), primary_key=True, nullable=False)
    timeframe = Column(String(5),               primary_key=True, nullable=False)  # '1m'|'5m'|'15m'|'1h'
    open      = Column(Float,                   nullable=False)
    high      = Column(Float,                   nullable=False)
    low       = Column(Float,                   nullable=False)
    close     = Column(Float,                   nullable=False)
    volume    = Column(BigInteger,              nullable=False)

    __table_args__ = (
        Index("ix_intraday_symbol_tf_ts", "symbol", "timeframe", "timestamp"),
    )

    def __repr__(self) -> str:
        return f"<IntradayData {self.symbol} {self.timeframe} @ {self.timestamp} close={self.close}>"


# ── ML Models ─────────────────────────────────────────────────────────────────

class MLModel(Base):
    """
    Trained ML model metadata.

    Stores metrics, feature importance, and path to the model artifact.
    The actual model file (.joblib or .pt) lives in /data/models/.

    One row per training run. Version increments automatically per (symbol, model_type).
    """

    __tablename__ = "ml_models"

    id            = Column(Integer,              primary_key=True, autoincrement=True)
    name          = Column(String(100),          nullable=False)          # e.g. "SPY_xgboost_v1"
    symbol        = Column(String(20),           nullable=False)
    model_type    = Column(String(50),           nullable=False)          # "xgboost" | "lstm"
    version       = Column(Integer,              nullable=False, default=1)

    # Performance metrics (on held-out test set)
    accuracy      = Column(Float,               nullable=True)
    f1_score      = Column(Float,               nullable=True)
    roc_auc       = Column(Float,               nullable=True)

    # Dataset info
    train_samples = Column(Integer,             nullable=True)
    test_samples  = Column(Integer,             nullable=True)
    feature_count = Column(Integer,             nullable=True)

    # JSON blobs
    params             = Column(Text, nullable=True)   # Hyperparameters (JSON)
    feature_importance = Column(Text, nullable=True)   # {feature: importance} (JSON)

    model_path    = Column(String(500),          nullable=True)           # Path to artifact file
    created_at    = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_ml_models_symbol_type", "symbol", "model_type"),
    )

    def __repr__(self) -> str:
        return f"<MLModel {self.name} acc={self.accuracy}>"


class MLPrediction(Base):
    """
    Stored predictions from a trained ML model.

    Pre-computed predictions are stored here so the API can serve them
    without loading the model at request time. The training script
    populates this table after training completes.

    One row per (symbol, model_id, date).
    actual_return is filled in after the fact for performance tracking.
    """

    __tablename__ = "ml_predictions"

    id            = Column(Integer,              primary_key=True, autoincrement=True)
    symbol        = Column(String(20),           nullable=False)
    model_id      = Column(Integer,              nullable=False)          # FK to ml_models.id
    timestamp     = Column(DateTime(timezone=True), nullable=False)       # Market date
    predicted_dir = Column(String(10),           nullable=False)          # "up" | "down"
    confidence    = Column(Float,               nullable=False)           # P(predicted class)
    actual_return = Column(Float,               nullable=True)            # Filled after market close
    created_at    = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_ml_predictions_symbol_model", "symbol", "model_id", "timestamp"),
    )

    def __repr__(self) -> str:
        return f"<MLPrediction {self.symbol} {self.timestamp} {self.predicted_dir} {self.confidence:.2f}>"


# ── Backtest Runs (Phase 3) ────────────────────────────────────────────────────

class BacktestRun(Base):
    """
    A single backtest execution — strategy config + results.

    The backend creates this row (status='running') before spawning the
    runner subprocess. The runner updates it with results when done.
    status lifecycle: 'running' → 'done' | 'failed'
    """

    __tablename__ = "backtest_runs"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    strategy_name = Column(String(50),  nullable=False)   # "pairs_trading" | "momentum" | ...
    symbols       = Column(Text,        nullable=False)   # Comma-separated: "SPY,QQQ"
    params        = Column(Text,        nullable=True)    # JSON of strategy params

    # Job state
    status        = Column(String(20),  nullable=False, default="running")  # running|done|failed
    error         = Column(Text,        nullable=True)

    # Performance metrics (populated on completion)
    total_return  = Column(Float, nullable=True)
    cagr          = Column(Float, nullable=True)
    sharpe_ratio  = Column(Float, nullable=True)
    sortino_ratio = Column(Float, nullable=True)
    max_drawdown  = Column(Float, nullable=True)
    calmar_ratio  = Column(Float, nullable=True)
    win_rate      = Column(Float, nullable=True)
    num_trades    = Column(Integer, nullable=True)

    # JSON blobs for chart data
    equity_curve      = Column(Text, nullable=True)   # [{date, value, drawdown}]
    benchmark_metrics = Column(Text, nullable=True)   # {sharpe, cagr, ...}
    trades            = Column(Text, nullable=True)   # [{date, symbol, side, price, size}]

    created_at    = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_backtest_runs_strategy", "strategy_name"),
    )

    def __repr__(self) -> str:
        return f"<BacktestRun id={self.id} strategy={self.strategy_name} status={self.status}>"


# ── Paper Trading (Phase 5) ────────────────────────────────────────────────────

class PaperAccount(Base):
    """
    Single paper trading account. Always has at most one row (id=1).
    Stores the current cash balance; equity is computed on-the-fly from positions.
    Starting balance: $100,000.
    """

    __tablename__ = "paper_account"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    cash       = Column(Float,   nullable=False, default=100_000.0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: __import__('datetime').datetime.utcnow())

    def __repr__(self) -> str:
        return f"<PaperAccount cash={self.cash:.2f}>"


class PaperPosition(Base):
    """
    An open position in the paper trading account.
    One row per symbol (unique). Deleted when qty reaches zero.
    avg_entry_price is a weighted average updated on each buy.
    """

    __tablename__ = "paper_positions"

    id              = Column(Integer,    primary_key=True, autoincrement=True)
    symbol          = Column(String(20), nullable=False, unique=True)
    qty             = Column(Float,      nullable=False, default=0.0)
    avg_entry_price = Column(Float,      nullable=False, default=0.0)
    updated_at      = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<PaperPosition {self.symbol} qty={self.qty} avg={self.avg_entry_price:.2f}>"


class PaperOrder(Base):
    """
    An order (market or limit) in the paper trading account.

    Lifecycle:
      'new' → 'filled'   (market: immediate; limit: when price crosses)
      'new' → 'canceled' (via DELETE /api/paper/orders/{id})
    """

    __tablename__ = "paper_orders"

    id               = Column(Integer,    primary_key=True, autoincrement=True)
    symbol           = Column(String(20), nullable=False)
    side             = Column(String(4),  nullable=False)    # "buy" | "sell"
    order_type       = Column(String(20), nullable=False, default="market")  # market|limit|stop|stop_limit|trailing_stop
    qty              = Column(Float,      nullable=False)
    filled_qty       = Column(Float,      nullable=False, default=0.0)
    status           = Column(String(20), nullable=False, default="new")
    limit_price      = Column(Float,      nullable=True)
    stop_price       = Column(Float,      nullable=True)   # Phase 43: stop trigger price
    trail_pct        = Column(Float,      nullable=True)   # Phase 43: trailing stop % (0.05 = 5%)
    trail_price      = Column(Float,      nullable=True)   # Phase 43: current trailing stop level
    filled_avg_price = Column(Float,      nullable=True)
    created_at       = Column(DateTime(timezone=True), nullable=True)
    updated_at       = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_paper_orders_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<PaperOrder {self.side.upper()} {self.qty} {self.symbol} status={self.status}>"


class PaperEquityHistory(Base):
    """
    Daily equity snapshots for the portfolio history chart.
    At most one row per calendar day (unique recorded_at).
    Inserted the first time get_state() is called each day.
    """

    __tablename__ = "paper_equity_history"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    equity      = Column(Float,   nullable=False)
    cash        = Column(Float,   nullable=False)
    recorded_at = Column(Date,    nullable=False, unique=True)

    def __repr__(self) -> str:
        return f"<PaperEquityHistory {self.recorded_at} equity={self.equity:.2f}>"


# ── Live Orders (Phase 25) ────────────────────────────────────────────────────

class LiveOrder(Base):
    """
    A live order submitted to Alpaca (paper or real-money account).

    Lifecycle:
      'pending'  → 'accepted' (Alpaca acknowledged the order)
      'accepted' → 'filled'   (execution complete)
      'accepted' → 'canceled' (via DELETE /api/live/orders/{id})
      'pending'  → 'rejected' (Alpaca rejected — see error_message)
    """

    __tablename__ = "live_orders"

    id               = Column(Integer,  primary_key=True, autoincrement=True)
    alpaca_order_id  = Column(String(64), nullable=True)   # UUID from Alpaca
    symbol           = Column(String(20), nullable=False)
    side             = Column(String(4),  nullable=False)   # "buy" | "sell"
    order_type       = Column(String(10), nullable=False)   # "market" | "limit"
    qty              = Column(Float,      nullable=False)
    filled_qty       = Column(Float,      nullable=False, default=0.0)
    limit_price      = Column(Float,      nullable=True)
    filled_avg_price = Column(Float,      nullable=True)
    status           = Column(String(20), nullable=False, default="pending")
    error_message    = Column(Text,       nullable=True)
    submitted_at     = Column(DateTime(timezone=True), server_default=func.now())
    filled_at        = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_live_orders_alpaca_id", "alpaca_order_id"),
        Index("ix_live_orders_status",    "status"),
    )

    def __repr__(self) -> str:
        return f"<LiveOrder {self.side.upper()} {self.qty} {self.symbol} status={self.status}>"


# ── Alerts (Phase 8) ──────────────────────────────────────────────────────────

class AlertRule(Base):
    """
    A user-defined price alert rule.

    Condition types:
      price_above      — fires when tick.price >= threshold
      price_below      — fires when tick.price <= threshold
      change_pct_above — fires when tick.change_pct * 100 >= threshold  (e.g. +2%)
      change_pct_below — fires when tick.change_pct * 100 <= threshold  (e.g. -2%)

    cooldown_seconds prevents alert spam: a rule won't fire again until
    at least `cooldown_seconds` have elapsed since the last firing.
    """

    __tablename__ = "alert_rules"

    id              = Column(Integer,    primary_key=True, autoincrement=True)
    symbol          = Column(String(20), nullable=False)
    condition       = Column(String(30), nullable=False)   # see condition types above
    threshold       = Column(Float,      nullable=False)
    is_active       = Column(Boolean,    nullable=False, default=True)
    cooldown_seconds = Column(Integer,   nullable=False, default=60)
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_alert_rules_symbol", "symbol"),
    )

    def __repr__(self) -> str:
        return f"<AlertRule {self.symbol} {self.condition} {self.threshold} active={self.is_active}>"


class AlertEvent(Base):
    """
    A fired alert instance.  One row per rule trigger.
    `acknowledged` is set to True when the user dismisses the notification.
    """

    __tablename__ = "alert_events"

    id            = Column(Integer,    primary_key=True, autoincrement=True)
    rule_id       = Column(Integer,    nullable=False)   # FK to alert_rules.id
    symbol        = Column(String(20), nullable=False)
    condition     = Column(String(30), nullable=False)
    threshold     = Column(Float,      nullable=False)
    current_value = Column(Float,      nullable=False)   # price or change_pct% at trigger time
    message       = Column(Text,       nullable=False)
    triggered_at  = Column(DateTime(timezone=True), nullable=False)
    acknowledged  = Column(Boolean,    nullable=False, default=False)

    __table_args__ = (
        Index("ix_alert_events_rule", "rule_id"),
        Index("ix_alert_events_triggered", "triggered_at"),
    )

    def __repr__(self) -> str:
        return f"<AlertEvent rule={self.rule_id} {self.symbol} {self.message[:40]}>"


# ── Strategy Optimization (Phase 10) ─────────────────────────────────────────

class OptimizationRun(Base):
    """
    A hyperparameter optimization job — runs N backtest trials for a strategy
    with different parameter combinations and ranks them by an objective metric.

    status lifecycle: 'queued' → 'running' → 'done' | 'failed'

    Fields:
      param_grid_json   — JSON dict of {param: [value1, value2, …]} lists
      objective         — metric to maximise: "sharpe" | "total_return" | "calmar" | "sortino"
      total_trials      — total number of combinations to evaluate
      completed_trials  — number done so far (incremented during run)
      results_json      — JSON list of trial results sorted by objective (written on completion)
      best_params_json  — JSON dict of winning parameter set
      best_sharpe       — quick-access copy of best trial's Sharpe ratio
      best_return       — quick-access copy of best trial's total return
    """

    __tablename__ = "optimization_runs"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    strategy         = Column(String(50),  nullable=False)
    symbols          = Column(Text,        nullable=False)   # comma-separated
    param_grid_json  = Column(Text,        nullable=False)
    objective        = Column(String(20),  nullable=False, default="sharpe")

    # Job state
    status           = Column(String(20),  nullable=False, default="queued")
    error            = Column(Text,        nullable=True)
    total_trials     = Column(Integer,     nullable=False, default=0)
    completed_trials = Column(Integer,     nullable=False, default=0)

    # Results (populated on completion)
    results_json     = Column(Text,        nullable=True)   # list[TrialResult]
    best_params_json = Column(Text,        nullable=True)
    best_sharpe      = Column(Float,       nullable=True)
    best_return      = Column(Float,       nullable=True)

    created_at       = Column(DateTime(timezone=True), nullable=False)
    completed_at     = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_optimization_runs_strategy", "strategy"),
    )

    def __repr__(self) -> str:
        return f"<OptimizationRun id={self.id} {self.strategy} status={self.status} trials={self.completed_trials}/{self.total_trials}>"


# ── Signal-Based Auto Paper Trading (Phase 12) ────────────────────────────────

class AutoTradeConfig(Base):
    """
    Singleton configuration row for signal-based automated paper trading.
    Always has exactly one row (id=1), upserted on first access.

    Fields:
      enabled           — whether the background auto-trader is active
      symbols           — comma-separated list of symbols to monitor
      signal_threshold  — min composite signal confidence to trigger a trade [0,1]
      position_size_pct — fraction of current equity to allocate per new position
      check_interval_sec — seconds between each signal evaluation cycle
    """

    __tablename__ = "auto_trade_config"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    enabled            = Column(Boolean,  nullable=False, default=False)
    symbols            = Column(Text,     nullable=False, default="SPY,QQQ")
    signal_threshold   = Column(Float,    nullable=False, default=0.5)
    position_size_pct  = Column(Float,    nullable=False, default=0.05)
    check_interval_sec = Column(Integer,  nullable=False, default=60)
    updated_at         = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<AutoTradeConfig enabled={self.enabled} threshold={self.signal_threshold}>"


class AutoTradeLog(Base):
    """
    One row per auto-trading evaluation × symbol.

    action values:
      bought              — market buy placed successfully
      sold                — market sell placed successfully
      hold_signal         — signal was HOLD; skipped
      no_position_to_sell — SELL signal but no open position
      already_positioned  — BUY signal but position already exists
      low_confidence      — signal confidence below configured threshold
      insufficient_data   — fewer than 210 bars in DB
      error               — unexpected exception during evaluation
    """

    __tablename__ = "auto_trade_log"

    id         = Column(Integer,    primary_key=True, autoincrement=True)
    symbol     = Column(String(20), nullable=False)
    signal     = Column(String(10), nullable=False)   # buy | sell | hold
    confidence = Column(Float,      nullable=False)
    score      = Column(Float,      nullable=False)
    action     = Column(String(40), nullable=False)
    qty        = Column(Float,      nullable=True)
    price      = Column(Float,      nullable=True)
    reason     = Column(Text,       nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_auto_trade_log_symbol",     "symbol"),
        Index("ix_auto_trade_log_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<AutoTradeLog {self.symbol} {self.signal} → {self.action}>"


# ── Users (Phase 23) ──────────────────────────────────────────────────────────

class User(Base):
    """
    Multi-user account table — Phase 23.

    Supports two roles:
      admin  — full access, can manage other users
      viewer — read-only access (no order placement, no user management)

    Migration path from single-admin (Phase 17):
      When the table is empty, auth_service falls back to the env-var
      ADMIN_PASSWORD_HASH / ADMIN_USERNAME for backward compatibility.
      Creating the first admin user via POST /api/auth/users switches the
      system to DB-backed auth automatically.
    """

    __tablename__ = "users"

    id            = Column(Integer,    primary_key=True, autoincrement=True)
    username      = Column(String(100), nullable=False, unique=True)
    email         = Column(String(200), nullable=True)
    password_hash = Column(Text,        nullable=False)
    role          = Column(String(20),  nullable=False, default="viewer")   # "admin" | "viewer"
    is_active     = Column(Boolean,     nullable=False, default=True)
    created_at    = Column(DateTime(timezone=True), nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_users_username", "username"),
    )

    def __repr__(self) -> str:
        return f"<User {self.username} role={self.role} active={self.is_active}>"


# ── Trade Journal (Phase 36) ──────────────────────────────────────────────────

class TradeJournal(Base):
    """
    One row per paper-trading fill.  Created automatically when a paper order
    fills; the user can enrich the row later with notes, tags, and a rating.

    Relationship to paper orders:
      order_id is a soft reference to paper_orders.id (stored as string to
      avoid FK constraint issues with order deletions on reset).

    P&L lifecycle:
      buy  fill  → entry row created (exit_price=None, pnl=None)
      sell fill  → closest open buy row closed (exit_price + pnl populated)
    """

    __tablename__ = "trade_journal"

    id          = Column(Integer,    primary_key=True, autoincrement=True)
    order_id    = Column(String(64), nullable=True)     # soft ref to paper_orders.id
    symbol      = Column(String(20), nullable=False)
    side        = Column(String(4),  nullable=False)    # "buy" | "sell"
    qty         = Column(Float,      nullable=False)
    entry_price = Column(Float,      nullable=False)
    exit_price  = Column(Float,      nullable=True)     # set when trade closed
    pnl         = Column(Float,      nullable=True)     # realised P&L in dollars
    notes       = Column(Text,       nullable=True)
    tags        = Column(String(200), nullable=True)    # comma-separated
    rating      = Column(Integer,    nullable=True)     # 1–5
    entry_date  = Column(DateTime(timezone=True), nullable=False)
    exit_date   = Column(DateTime(timezone=True), nullable=True)
    created_at  = Column(DateTime(timezone=True), nullable=False, default=func.now())

    __table_args__ = (
        Index("ix_trade_journal_symbol",     "symbol"),
        Index("ix_trade_journal_entry_date", "entry_date"),
    )

    def __repr__(self) -> str:
        return f"<TradeJournal {self.side.upper()} {self.qty} {self.symbol} pnl={self.pnl}>"


# ── Custom Strategy Builder (Phase 48) ────────────────────────────────────────

class CustomStrategy(Base):
    """
    User-defined no-code strategy stored as a JSON rule set.

    conditions_json schema:
      {
        "buy_rules":  [{"indicator": "rsi", "period": 14, "op": "lt", "value": 30}, ...],
        "sell_rules": [{"indicator": "rsi", "period": 14, "op": "gt", "value": 70}, ...],
        "logic": "AND" | "OR"
      }

    Supported indicators: rsi, sma, ema, volume_ratio, change_pct
    Supported operators:  gt, lt, gte, lte, cross_above, cross_below
    """

    __tablename__ = "custom_strategies"

    id              = Column(Integer,     primary_key=True, autoincrement=True)
    name            = Column(String(100), nullable=False)
    description     = Column(Text,        nullable=True)
    conditions_json = Column(Text,        nullable=False)   # JSON rule set
    owner           = Column(String(100), nullable=True)    # username
    created_at      = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_custom_strategies_owner", "owner"),
    )

    def __repr__(self) -> str:
        return f"<CustomStrategy {self.name} owner={self.owner}>"


# ── Strategy Tournaments (Phase 52) ──────────────────────────────────────────

class TournamentRun(Base):
    """
    A paper-trading tournament: N named participants each run a different
    strategy configuration over the same historical window and are ranked
    by Sharpe ratio on a leaderboard.

    status lifecycle: 'pending' → 'running' → 'done' | 'failed'
    """

    __tablename__ = "tournament_runs"

    id          = Column(Integer,     primary_key=True, autoincrement=True)
    name        = Column(String(100), nullable=False)
    symbols     = Column(Text,        nullable=False)   # comma-separated
    start_date  = Column(String(20),  nullable=False)   # YYYY-MM-DD
    end_date    = Column(String(20),  nullable=False)   # YYYY-MM-DD
    status      = Column(String(20),  nullable=False, default="pending")
    error       = Column(Text,        nullable=True)
    created_at  = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_tournament_runs_created", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<TournamentRun {self.name} status={self.status}>"


class TournamentParticipant(Base):
    """
    One strategy configuration competing in a TournamentRun.

    strategy_config_json: {"strategy": "sma_cross", "fast": 10, "slow": 30}
    equity_curve_json:    list of {"date": "YYYY-MM-DD", "equity": float}
    """

    __tablename__ = "tournament_participants"

    id                   = Column(Integer,     primary_key=True, autoincrement=True)
    tournament_id        = Column(Integer,     nullable=False)
    name                 = Column(String(100), nullable=False)
    strategy_config_json = Column(Text,        nullable=False)
    status               = Column(String(20),  nullable=False, default="pending")

    # Populated after run completes
    total_return   = Column(Float, nullable=True)
    sharpe         = Column(Float, nullable=True)
    max_drawdown   = Column(Float, nullable=True)
    num_trades     = Column(Integer, nullable=True)
    final_equity   = Column(Float,  nullable=True)
    equity_curve_json = Column(Text, nullable=True)

    __table_args__ = (
        Index("ix_tournament_participants_tid", "tournament_id"),
    )

    def __repr__(self) -> str:
        return f"<TournamentParticipant {self.name} sharpe={self.sharpe}>"


# ── Public Portfolio Snapshot (Phase 54) ──────────────────────────────────────

class PortfolioSnapshot(Base):
    """
    Read-only shareable snapshot of a paper portfolio created on demand.
    Accessed via public GET /api/share/{token} — no authentication required.

    equity_curve_json: list of {"date": str, "equity": float}
    positions_json:    list of {symbol, qty, avg_price, current_price, pnl}
    stats_json:        {total_return, sharpe, max_drawdown, ...}
    """

    __tablename__ = "portfolio_snapshots"

    id                = Column(Integer,     primary_key=True, autoincrement=True)
    token             = Column(String(64),  nullable=False, unique=True)
    title             = Column(String(200), nullable=True)
    equity_curve_json = Column(Text,        nullable=False)
    positions_json    = Column(Text,        nullable=False)
    stats_json        = Column(Text,        nullable=False)
    created_at        = Column(DateTime(timezone=True), nullable=False)
    expires_at        = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_portfolio_snapshots_token", "token"),
    )

    def __repr__(self) -> str:
        return f"<PortfolioSnapshot token={self.token[:8]}… expires={self.expires_at}>"

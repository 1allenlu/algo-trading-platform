"""
SQLAlchemy async engine + ORM models.

Architecture note:
  - We use SQLAlchemy 2.0 async API throughout (no legacy Session.execute patterns)
  - TimescaleDB hypertables are created via raw SQL in data/migrations/init.sql
    (TimescaleDB-specific DDL isn't expressible via SQLAlchemy's ORM)
  - The SQLAlchemy models mirror the hypertable schema so the ORM can query them
"""

from sqlalchemy import BigInteger, Column, DateTime, Float, Index, Integer, String, Text
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

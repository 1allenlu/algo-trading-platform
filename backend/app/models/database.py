"""
SQLAlchemy async engine + ORM models.

Architecture note:
  - We use SQLAlchemy 2.0 async API throughout (no legacy Session.execute patterns)
  - TimescaleDB hypertables are created via raw SQL in data/migrations/init.sql
    (TimescaleDB-specific DDL isn't expressible via SQLAlchemy's ORM)
  - The SQLAlchemy models mirror the hypertable schema so the ORM can query them
"""

from sqlalchemy import BigInteger, Column, DateTime, Float, Index, String
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

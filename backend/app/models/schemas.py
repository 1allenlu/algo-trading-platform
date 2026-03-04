"""
Pydantic v2 schemas for request/response validation.

Separation from SQLAlchemy models:
  - ORM models define the database shape (columns, indexes)
  - Pydantic schemas define the API shape (what's exposed to clients)
  - from_attributes=True enables ORM → Pydantic conversion
"""

from datetime import datetime
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

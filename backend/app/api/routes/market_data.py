"""
Market data API routes.

Endpoint: GET /api/data/market/{symbol}

Returns OHLCV bars for a given ticker, with optional date filtering and
a limit parameter to control response size.

Phase 1 implementation: reads directly from the market_data table.
Phase 2+: responses will be cached in Redis and enriched with ML predictions.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.database import MarketData
from app.models.schemas import MarketDataResponse, OHLCVBar

router = APIRouter()


@router.get(
    "/market/{symbol}",
    response_model=MarketDataResponse,
    summary="Get OHLCV market data",
)
async def get_market_data(
    symbol: str,
    start_date: Annotated[
        datetime | None,
        Query(description="Filter from this date (ISO 8601, e.g. 2023-01-01T00:00:00Z)"),
    ] = None,
    end_date: Annotated[
        datetime | None,
        Query(description="Filter to this date (ISO 8601)"),
    ] = None,
    limit: Annotated[
        int,
        Query(ge=1, le=5000, description="Max bars to return (252 ≈ 1 trading year)"),
    ] = 252,
    db: AsyncSession = Depends(get_db),
) -> MarketDataResponse:
    """
    Return OHLCV daily bars for `symbol`.

    **limit** defaults to 252 (≈ 1 trading year). For 5 years use limit=1260.

    Data is queried descending (newest first) so LIMIT gives the most recent
    bars, then reversed to chronological order before returning.
    """
    symbol = symbol.upper().strip()
    logger.info(f"Market data request: {symbol} | {start_date} → {end_date} | limit={limit}")

    # Build query — ORDER BY DESC + LIMIT is an efficient TimescaleDB pattern
    stmt = (
        select(MarketData)
        .where(MarketData.symbol == symbol)
        .order_by(MarketData.timestamp.desc())
        .limit(limit)
    )

    if start_date:
        stmt = stmt.where(MarketData.timestamp >= start_date)
    if end_date:
        stmt = stmt.where(MarketData.timestamp <= end_date)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No data found for '{symbol}'. "
                "Run `make ingest` or `python data/ingestion/yfinance_loader.py` "
                "to populate the database."
            ),
        )

    # Reverse to chronological order (we queried DESC for LIMIT efficiency)
    rows = list(reversed(rows))

    bars = [
        OHLCVBar(
            symbol=row.symbol,
            timestamp=row.timestamp,
            open=row.open,
            high=row.high,
            low=row.low,
            close=row.close,
            volume=row.volume,
        )
        for row in rows
    ]

    return MarketDataResponse(
        symbol=symbol,
        bars=bars,
        count=len(bars),
        start_date=bars[0].timestamp,
        end_date=bars[-1].timestamp,
    )

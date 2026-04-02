"""
Intraday Data API routes — Phase 31.

GET  /api/intraday/{symbol}?timeframe=5m&limit=500  → list of OHLCV bars
POST /api/intraday/ingest                           → trigger yfinance download
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.intraday_service import VALID_TIMEFRAMES, get_intraday, ingest_intraday

router = APIRouter()


@router.get("/{symbol}")
async def get_intraday_bars(
    symbol:    str,
    timeframe: str = Query("5m", description="Bar interval: 1m | 5m | 15m | 1h"),
    limit:     int = Query(500,  ge=1, le=2000, description="Max bars to return"),
    db:        AsyncSession = Depends(get_db),
):
    """
    Return up to `limit` intraday OHLCV bars for a symbol in ascending order.

    Data must be pre-loaded via POST /api/intraday/ingest or `make ingest-intraday`.
    """
    if timeframe not in VALID_TIMEFRAMES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid timeframe '{timeframe}'. Valid: {sorted(VALID_TIMEFRAMES)}",
        )
    bars = await get_intraday(db, symbol.upper(), timeframe, limit)
    return {"symbol": symbol.upper(), "timeframe": timeframe, "bars": bars, "count": len(bars)}


@router.post("/ingest")
async def ingest_intraday_bars(
    payload: dict,
    db:      AsyncSession = Depends(get_db),
):
    """
    Download intraday bars from yfinance and store in the DB.

    Body: {"symbol": "SPY", "timeframe": "5m"}
    """
    symbol    = payload.get("symbol", "").upper()
    timeframe = payload.get("timeframe", "5m")

    if not symbol:
        raise HTTPException(status_code=422, detail="'symbol' is required")
    if timeframe not in VALID_TIMEFRAMES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid timeframe '{timeframe}'. Valid: {sorted(VALID_TIMEFRAMES)}",
        )

    try:
        result = await ingest_intraday(db, symbol, timeframe)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

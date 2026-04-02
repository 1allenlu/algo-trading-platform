"""
Pattern Recognition API route — Phase 41.

Endpoints:
  GET /api/patterns/{symbol}   Detect candlestick patterns for a symbol
    ?limit=252                 Number of bars to scan (default 252 = ~1 year)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import pandas as pd

from app.api.deps import get_db
from app.models.database import MarketData
from app.services.pattern_service import detect_patterns

router = APIRouter()


@router.get("/{symbol}")
async def get_patterns(
    symbol: str,
    limit: int = Query(default=252, ge=10, le=2000),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Return list of detected candlestick patterns for the given symbol.
    Scans the most recent `limit` daily bars stored in the DB.
    """
    rows = await db.execute(
        select(MarketData)
        .where(MarketData.symbol == symbol.upper())
        .order_by(MarketData.timestamp.asc())
        .limit(limit)
    )
    bars = rows.scalars().all()
    if not bars:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")

    df = pd.DataFrame([
        {
            "timestamp": b.timestamp,
            "open":      float(b.open),
            "high":      float(b.high),
            "low":       float(b.low),
            "close":     float(b.close),
        }
        for b in bars
    ])

    try:
        patterns = detect_patterns(df, limit=limit)
    except Exception as exc:
        logger.exception(f"[patterns] detect_patterns({symbol}) failed: {exc}")
        raise HTTPException(status_code=500, detail="Pattern detection failed")

    return {
        "symbol":   symbol.upper(),
        "patterns": patterns,
        "count":    len(patterns),
        "bars_scanned": len(df),
    }

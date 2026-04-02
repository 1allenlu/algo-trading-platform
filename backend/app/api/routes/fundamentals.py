"""
Fundamentals API route — Phase 40.

Endpoints:
  GET /api/fundamentals/{symbol}   Fetch fundamental data for one symbol
"""

from fastapi import APIRouter, HTTPException
from loguru import logger

from app.services.fundamentals_service import get_fundamentals

router = APIRouter()


@router.get("/{symbol}")
async def get_symbol_fundamentals(symbol: str) -> dict:
    """
    Return fundamental data for a stock symbol (P/E, EPS, revenue, market cap, etc.).
    Data sourced from yfinance (15-min delayed).
    """
    result = get_fundamentals(symbol)
    if "error" in result:
        raise HTTPException(status_code=502, detail=f"yfinance error: {result['error']}")
    return result

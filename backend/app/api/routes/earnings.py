"""
Earnings Calendar API routes — Phase 33.

GET /api/earnings/calendar?symbols=AAPL,MSFT,NVDA  → multi-symbol calendar
GET /api/earnings/{symbol}                          → single symbol earnings

IMPORTANT: /calendar must be defined BEFORE /{symbol} in this file so
FastAPI doesn't try to match the literal string "calendar" as a symbol.
"""

from fastapi import APIRouter, Query
from app.services.earnings_service import get_earnings_calendar, get_next_earnings

router = APIRouter()


@router.get("/calendar")
async def earnings_calendar(
    symbols: str = Query(
        "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,JPM,V,SPY",
        description="Comma-separated list of ticker symbols",
    ),
):
    """
    Return upcoming and historical earnings for multiple symbols.
    Results are sorted by next_earnings_date ascending (soonest first).
    """
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    return get_earnings_calendar(sym_list)


@router.get("/{symbol}")
async def get_symbol_earnings(symbol: str):
    """Return next earnings date + EPS estimate + 8 quarters of history for one symbol."""
    return get_next_earnings(symbol.upper())

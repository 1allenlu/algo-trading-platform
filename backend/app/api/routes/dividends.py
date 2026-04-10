"""
Dividend Tracker routes — Phase 71.

GET /api/dividends/calendar?symbols=AAPL,MSFT,JNJ,KO,PG
    → list of dividend summaries sorted by yield
GET /api/dividends/{symbol}
    → detailed dividend info + payment history for one symbol
"""

import asyncio
from fastapi import APIRouter

from app.services.dividend_service import get_dividend_calendar, get_dividend_summary

router = APIRouter()

DEFAULT_SYMBOLS = "AAPL,MSFT,JNJ,KO,PG,VZ,T,XOM,CVX,JPM,BAC,MCD,PEP,WMT,HD"


@router.get("/calendar")
async def dividend_calendar(
    symbols: str = DEFAULT_SYMBOLS,
) -> list[dict]:
    """Return dividend summary for each symbol, sorted by yield."""
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    return await asyncio.to_thread(get_dividend_calendar, sym_list)


@router.get("/{symbol}")
async def dividend_detail(symbol: str) -> dict:
    """Detailed dividend info + 12-quarter payment history for one symbol."""
    return await asyncio.to_thread(get_dividend_summary, symbol)

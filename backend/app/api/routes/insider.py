"""
Insider Transactions routes — Phase 76.

GET /api/insider/{symbol}  → recent insider buy/sell activity
"""

import asyncio
from fastapi import APIRouter, Query
from app.services.insider_service import get_insider_transactions

router = APIRouter()


@router.get("/{symbol}")
async def insider_transactions(
    symbol: str,
    limit:  int = Query(default=30, ge=1, le=100),
) -> list[dict]:
    """
    Return recent insider transactions for a symbol.
    Data sourced from yfinance (cached 2 hours).
    """
    return await asyncio.to_thread(
        get_insider_transactions, symbol.upper(), limit
    )

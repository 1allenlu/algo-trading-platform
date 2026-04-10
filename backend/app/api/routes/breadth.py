"""
Market Breadth routes — Phase 74.

GET /api/breadth/snapshot  → advance/decline, RSI distribution, sector heatmap
"""

import asyncio
from fastapi import APIRouter
from app.services.breadth_service import get_breadth_snapshot

router = APIRouter()


@router.get("/snapshot")
async def breadth_snapshot() -> dict:
    """
    Return aggregate breadth metrics and sector ETF performance.
    Data is derived from ~35 major equities + 11 SPDR sector ETFs.
    Cached 30 min server-side.
    """
    return await asyncio.to_thread(get_breadth_snapshot)

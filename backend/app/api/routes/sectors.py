"""
Sector Rotation routes — Phase 56.

Endpoints:
  GET /api/sectors/heatmap  → performance heatmap for 11 GICS sector ETFs
"""

import asyncio
from fastapi import APIRouter
from app.services.sector_service import get_sector_heatmap

router = APIRouter()


@router.get("/heatmap")
async def sector_heatmap() -> list[dict]:
    """
    Returns performance data for all 11 GICS sector ETFs across multiple
    time horizons: 1d, 5d, 1mo, 3mo, YTD.
    Data is cached 30 min. Fetches from yfinance (15-min delayed).
    """
    return await asyncio.to_thread(get_sector_heatmap)

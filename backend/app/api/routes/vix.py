"""VIX & Sentiment routes — Phase 60."""

import asyncio
from fastapi import APIRouter
from app.services.vix_service import get_vix_snapshot

router = APIRouter()


@router.get("/snapshot")
async def vix_snapshot() -> dict:
    """Current VIX, VVIX, VXN, fear/greed score, and 30-day VIX sparkline."""
    return await asyncio.to_thread(get_vix_snapshot)

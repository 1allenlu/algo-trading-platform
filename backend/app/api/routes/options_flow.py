"""
Options Flow Scanner routes — Phase 70.

GET /api/options-flow/scan?symbols=AAPL,TSLA,NVDA
    → list of unusual options activity rows sorted by flag + volume
"""

import asyncio
from fastapi import APIRouter, Query

from app.services.options_flow_service import scan_options_flow

router = APIRouter()

DEFAULT_SYMBOLS = "SPY,QQQ,AAPL,MSFT,NVDA,AMZN,TSLA,GOOGL,META,AMD"


@router.get("/scan")
async def options_flow_scan(
    symbols: str = Query(default=DEFAULT_SYMBOLS),
) -> list[dict]:
    """Scan symbols for unusual options activity (volume spikes, sweeps)."""
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    return await asyncio.to_thread(scan_options_flow, sym_list)

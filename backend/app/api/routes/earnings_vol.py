"""Earnings Volatility Screener routes — Phase 62."""

import asyncio
from fastapi import APIRouter, Query
from app.services.earnings_vol_service import screen_earnings_plays, get_earnings_play

router = APIRouter()

DEFAULT_SYMBOLS = "SPY,QQQ,AAPL,MSFT,NVDA,AMZN,TSLA,GOOGL,META,AMD"


@router.get("/screen")
async def screen(
    symbols: str = Query(default=DEFAULT_SYMBOLS),
) -> list[dict]:
    """Screen symbols for earnings volatility plays (straddle/directional setups)."""
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()][:15]
    return await asyncio.to_thread(screen_earnings_plays, sym_list)


@router.get("/{symbol}")
async def single(symbol: str) -> dict:
    """Earnings play detail for a single symbol."""
    result = await asyncio.to_thread(get_earnings_play, symbol)
    if not result:
        from fastapi import HTTPException
        raise HTTPException(404, f"No earnings data for {symbol}")
    return result

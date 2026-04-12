"""
Options Chain routes — Phase 27.

Endpoints:
  GET /api/options/{symbol}/expirations  → list of expiry date strings
  GET /api/options/{symbol}              → full call/put chain for one expiry
"""

import asyncio

from fastapi import APIRouter, Query
from app.services.options_service import get_expirations, get_options_chain, screen_options
from app.services.iv_surface_service import get_iv_term_structure

router = APIRouter()


@router.get("/{symbol}/expirations")
async def options_expirations(symbol: str) -> list[str]:
    """Available expiration dates for a ticker (nearest first)."""
    return get_expirations(symbol)


@router.get("/{symbol}")
async def options_chain(
    symbol: str,
    expiry: str | None = Query(default=None, description="Expiry date YYYY-MM-DD; defaults to nearest"),
) -> dict:
    """
    Full options chain (calls + puts) for one expiration.

    Fetched live from yfinance — typically 15-min delayed for free data.
    Set `expiry` to any date returned by .../expirations.
    """
    return get_options_chain(symbol, expiry)


@router.get("/iv-term/{symbol}")
async def iv_term_structure(symbol: str) -> list[dict]:
    """
    Phase 81: ATM implied volatility per expiry (term structure curve).

    Returns [{expiry, days_to_exp, atm_iv, call_iv, put_iv}] sorted by days ascending.
    Cached 30 minutes. Useful for visualizing the vol curve / contango / backwardation.
    """
    return await asyncio.to_thread(get_iv_term_structure, symbol.upper())


@router.get("/screen/scan")
async def screen_options_route(
    symbols:  str  = Query(default="SPY,QQQ,AAPL,MSFT,NVDA", description="Comma-separated tickers"),
    strategy: str  = Query(default="covered_call", pattern="^(covered_call|cash_secured_put|iron_condor)$"),
) -> list[dict]:
    """
    Phase 50: Scan symbols for options strategy opportunities.

    strategy:
      covered_call     — near-the-money calls with IV ≥ 20%, 0-8% OTM
      cash_secured_put — near-the-money puts with IV ≥ 20%, 0-8% OTM
      iron_condor      — balanced put + call spread with net positive credit

    Returns best matches per symbol sorted by IV / credit-to-risk.
    yfinance is slow (~1-3s per symbol) so limit to ≤ 10 symbols.
    """
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()][:10]
    return await asyncio.to_thread(screen_options, sym_list, strategy)

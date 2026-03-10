"""
Options Chain routes — Phase 27.

Endpoints:
  GET /api/options/{symbol}/expirations  → list of expiry date strings
  GET /api/options/{symbol}              → full call/put chain for one expiry
"""

from fastapi import APIRouter, Query
from app.services.options_service import get_expirations, get_options_chain

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

"""
Crypto API routes — Phase 32.

GET  /api/crypto/symbols   → list of supported pairs with latest price
POST /api/crypto/ingest    → download 5yr daily data for all crypto pairs
GET  /api/crypto/{symbol}  → single symbol bars (delegates to market_data)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.crypto_service import CRYPTO_SYMBOL_SET, get_crypto_symbols, ingest_crypto

router = APIRouter()


@router.get("/symbols")
async def list_crypto_symbols(db: AsyncSession = Depends(get_db)):
    """Return all supported crypto pairs with metadata and latest DB price."""
    return await get_crypto_symbols(db)


@router.post("/ingest")
async def ingest_crypto_data(db: AsyncSession = Depends(get_db)):
    """
    Trigger yfinance download for all supported crypto pairs.
    Upserts into market_data (same table as equities).
    May take 30-60 seconds.
    """
    try:
        return await ingest_crypto(db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

"""
Tax Report routes — Phase 47.

Endpoints:
  GET /api/tax/report?method=FIFO  → capital gains report (FIFO or LIFO)
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services.tax_service import get_tax_report

router = APIRouter()


@router.get("/report")
async def tax_report(
    method: str = Query(default="FIFO", pattern="^(FIFO|LIFO)$"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Compute capital gains tax report from paper trading fills.
    - method=FIFO (default): oldest lots matched first
    - method=LIFO: newest lots matched first

    Returns realized gains (short-term / long-term split),
    open lots, and potential wash-sale warnings.
    """
    return await get_tax_report(db, method=method)

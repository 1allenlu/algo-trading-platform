"""
Live Trading Routes — Phase 25.

Endpoints:
  GET  /api/live/state         — full snapshot: account + positions + recent orders
  POST /api/live/orders        — submit a market or limit order to Alpaca
  GET  /api/live/orders        — order history (DB, newest first)
  DELETE /api/live/orders/{id} — cancel an open order

All endpoints return a clear JSON error (not 500) when Alpaca keys are absent,
so the frontend can show a "Not configured" state gracefully.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.database import LiveOrder
from app.models.schemas import (
    LiveAccountInfo,
    LiveOrderSchema,
    LivePosition,
    LiveTradingState,
    SubmitLiveOrderRequest,
)
from app.services import alpaca_order_service as svc

router = APIRouter()


def _order_to_schema(row: LiveOrder) -> LiveOrderSchema:
    return LiveOrderSchema(
        id               = row.id,
        alpaca_order_id  = row.alpaca_order_id,
        symbol           = row.symbol,
        side             = row.side,
        order_type       = row.order_type,
        qty              = row.qty,
        filled_qty       = row.filled_qty,
        status           = row.status,
        limit_price      = row.limit_price,
        filled_avg_price = row.filled_avg_price,
        error_message    = row.error_message,
        submitted_at     = row.submitted_at.isoformat() if row.submitted_at else "",
    )


# ── GET /state ────────────────────────────────────────────────────────────────

@router.get("/state", response_model=LiveTradingState)
async def get_live_state(db: AsyncSession = Depends(get_db)) -> LiveTradingState:
    """
    Full live trading snapshot: account info, open positions, recent orders.
    Returns alpaca_enabled=False (no error) when keys are not configured.
    """
    if not svc.alpaca_enabled():
        orders = await svc.get_orders(db, limit=50)
        return LiveTradingState(
            alpaca_enabled = False,
            orders         = [_order_to_schema(o) for o in orders],
        )

    try:
        acc_dict  = svc.get_account()
        pos_dicts = svc.get_positions()
    except ValueError as exc:
        logger.warning(f"[live] get_live_state account/positions failed: {exc}")
        raise HTTPException(status_code=503, detail=str(exc))

    orders = await svc.get_orders(db, limit=50)

    account = LiveAccountInfo(**acc_dict)
    positions = [LivePosition(**p) for p in pos_dicts]

    return LiveTradingState(
        alpaca_enabled = True,
        account        = account,
        positions      = positions,
        orders         = [_order_to_schema(o) for o in orders],
    )


# ── POST /orders ──────────────────────────────────────────────────────────────

@router.post("/orders", response_model=LiveOrderSchema, status_code=201)
async def submit_order(
    request: SubmitLiveOrderRequest,
    db:      AsyncSession = Depends(get_db),
) -> LiveOrderSchema:
    """
    Submit a market or limit order to Alpaca.
    The order is persisted in live_orders regardless of Alpaca response.
    """
    if not svc.alpaca_enabled():
        raise HTTPException(
            status_code=503,
            detail="Alpaca API keys not configured — set ALPACA_API_KEY and ALPACA_SECRET_KEY",
        )

    if request.order_type == "limit" and request.limit_price is None:
        raise HTTPException(status_code=400, detail="limit_price is required for limit orders")

    try:
        row = await svc.submit_order(
            db          = db,
            symbol      = request.symbol,
            side        = request.side,
            qty         = request.qty,
            order_type  = request.order_type,
            limit_price = request.limit_price,
        )
    except ValueError as exc:
        logger.warning(f"[live] submit_order validation: {exc}")
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception(f"[live] submit_order unexpected: {exc}")
        raise HTTPException(status_code=500, detail="Order submission failed")

    return _order_to_schema(row)


# ── GET /orders ───────────────────────────────────────────────────────────────

@router.get("/orders", response_model=list[LiveOrderSchema])
async def get_orders(db: AsyncSession = Depends(get_db)) -> list[LiveOrderSchema]:
    """Return recent live orders from the DB, newest first (max 50)."""
    rows = await svc.get_orders(db, limit=50)
    return [_order_to_schema(r) for r in rows]


# ── DELETE /orders/{id} ───────────────────────────────────────────────────────

@router.delete("/orders/{order_id}")
async def cancel_order(
    order_id: int,
    db:       AsyncSession = Depends(get_db),
) -> dict:
    """Cancel an open order by its DB id."""
    if not svc.alpaca_enabled():
        raise HTTPException(status_code=503, detail="Alpaca API keys not configured")

    try:
        await svc.cancel_order(db, order_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception(f"[live] cancel_order unexpected: {exc}")
        raise HTTPException(status_code=500, detail="Cancel failed")

    return {"message": f"Order {order_id} canceled"}


# ── POST /orders/{id}/sync ────────────────────────────────────────────────────

@router.post("/orders/{order_id}/sync", response_model=LiveOrderSchema)
async def sync_order(
    order_id: int,
    db:       AsyncSession = Depends(get_db),
) -> LiveOrderSchema:
    """Re-fetch order status from Alpaca and update the DB row."""
    if not svc.alpaca_enabled():
        raise HTTPException(status_code=503, detail="Alpaca API keys not configured")

    try:
        row = await svc.sync_order_status(db, order_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return _order_to_schema(row)

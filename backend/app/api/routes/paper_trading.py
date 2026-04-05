"""
Paper Trading API routes — Phase 5.

GET    /api/paper/state          — full account snapshot (poll every 2s)
POST   /api/paper/orders         — submit a market or limit order
DELETE /api/paper/orders/{id}    — cancel an open order
POST   /api/paper/reset          — wipe all positions/orders and reset to $100k

Uses the self-contained paper_trading_service which fills orders at the
most recent close price in the local market_data table. No external API needed.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.schemas import (
    AccountInfo,
    OrderResponse,
    PaperOrder,
    PaperPosition,
    PaperTradingState,
    PortfolioPoint,
    SubmitOrderRequest,
)
from app.services import paper_trading_service as svc

router = APIRouter()


@router.get("/state", response_model=PaperTradingState)
async def get_paper_state(session: AsyncSession = Depends(get_db)) -> PaperTradingState:
    """
    Return a full account snapshot: equity, cash, open positions,
    recent orders, and portfolio equity history.

    Also processes any pending limit orders and records the daily snapshot.
    Frontend polls this every 2 seconds.
    """
    try:
        state = await svc.get_state(session)
    except Exception as exc:
        logger.exception(f"get_state failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    return PaperTradingState(
        account           = AccountInfo(**state["account"]),
        positions         = [PaperPosition(**p) for p in state["positions"]],
        orders            = [PaperOrder(**o)    for o in state["orders"]],
        portfolio_history = [PortfolioPoint(**h) for h in state["portfolio_history"]],
        last_updated      = state["last_updated"],
    )


@router.post("/orders", response_model=OrderResponse)
async def submit_order(
    request: SubmitOrderRequest,
    session: AsyncSession = Depends(get_db),
) -> OrderResponse:
    """
    Submit a market or limit order.

    Market orders fill immediately at the latest close price in the DB.
    Limit orders queue and fill on the next get_state() call when triggered.
    """
    if request.order_type == "limit" and request.limit_price is None:
        raise HTTPException(status_code=400, detail="limit_price is required for limit orders")
    if request.order_type == "stop" and request.stop_price is None:
        raise HTTPException(status_code=400, detail="stop_price is required for stop orders")
    if request.order_type == "stop_limit" and (request.stop_price is None or request.limit_price is None):
        raise HTTPException(status_code=400, detail="stop_price and limit_price are required for stop_limit orders")
    if request.order_type == "trailing_stop" and request.trail_pct is None:
        raise HTTPException(status_code=400, detail="trail_pct is required for trailing_stop orders")

    logger.info(
        f"Order: {request.side.upper()} {request.qty} {request.symbol} "
        f"({request.order_type or 'market'}"
        + (f" @ ${request.limit_price}" if request.limit_price else "")
        + ")"
    )

    try:
        result = await svc.submit_order(
            session,
            symbol      = request.symbol,
            side        = request.side,
            qty         = request.qty,
            order_type  = request.order_type or "market",
            limit_price = request.limit_price,
            stop_price  = request.stop_price,
            trail_pct   = request.trail_pct,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception(f"submit_order failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    return OrderResponse(**result)


@router.delete("/orders/{order_id}")
async def cancel_order(
    order_id: str,
    session:  AsyncSession = Depends(get_db),
) -> dict:
    """Cancel an open or partially-filled order by its integer ID."""
    try:
        await svc.cancel_order(session, int(order_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception(f"cancel_order failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    return {"message": f"Order {order_id} cancelled"}


@router.post("/reset")
async def reset_account(session: AsyncSession = Depends(get_db)) -> dict:
    """
    Reset the paper account: clears all positions, orders, and equity history,
    restoring cash to $100,000. Useful for starting fresh.
    """
    await svc.reset_account(session)
    return {"message": "Paper account reset to $100,000"}

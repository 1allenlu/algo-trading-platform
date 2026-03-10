"""
Alpaca Order Service — Phase 25.

Wraps alpaca-py TradingClient for live (or paper) order execution.
All functions return None / raise ValueError gracefully when keys are absent.

Configuration:
  ALPACA_API_KEY    / ALPACA_SECRET_KEY — required to activate
  ALPACA_PAPER      — True (default): Alpaca paper account; False: real money (caution!)
  MAX_ORDER_VALUE   — USD cap per single order (pre-trade risk guard)

The service stores every submitted order in the live_orders DB table so
the frontend can show history even after the Alpaca session ends.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.database import LiveOrder

# ── Lazy TradingClient singleton ──────────────────────────────────────────────

_client: Any = None


def _get_client() -> Any | None:
    """
    Return a singleton TradingClient, or None when keys are absent.
    paper=settings.ALPACA_PAPER routes to Alpaca's paper or live endpoint.
    """
    global _client
    if _client is not None:
        return _client

    if not settings.ALPACA_API_KEY or not settings.ALPACA_SECRET_KEY:
        return None

    try:
        from alpaca.trading.client import TradingClient
        _client = TradingClient(
            api_key    = settings.ALPACA_API_KEY,
            secret_key = settings.ALPACA_SECRET_KEY,
            paper      = settings.ALPACA_PAPER,
        )
        mode = "paper" if settings.ALPACA_PAPER else "LIVE (real money)"
        logger.info(f"[alpaca-order] TradingClient initialised — mode: {mode}")
    except Exception as exc:
        logger.warning(f"[alpaca-order] Failed to init TradingClient: {exc}")
        _client = None

    return _client


def alpaca_enabled() -> bool:
    """True when Alpaca API keys are configured."""
    return bool(settings.ALPACA_API_KEY and settings.ALPACA_SECRET_KEY)


# ── Account & positions ───────────────────────────────────────────────────────

def get_account() -> dict:
    """
    Fetch account snapshot from Alpaca.
    Returns a dict with equity, cash, buying_power, day_pnl, trading_mode.
    Raises ValueError if keys are not configured.
    """
    client = _get_client()
    if client is None:
        raise ValueError("Alpaca API keys not configured")

    try:
        acc = client.get_account()
        equity    = float(acc.equity     or 0)
        prev_eq   = float(acc.last_equity or equity)
        day_pnl   = equity - prev_eq
        day_pnl_pct = (day_pnl / prev_eq * 100) if prev_eq else 0.0

        return {
            "equity":          equity,
            "cash":            float(acc.cash           or 0),
            "buying_power":    float(acc.buying_power   or 0),
            "portfolio_value": float(acc.portfolio_value or equity),
            "day_pnl":         day_pnl,
            "day_pnl_pct":     day_pnl_pct,
            "trading_mode":    "paper" if settings.ALPACA_PAPER else "live",
        }
    except Exception as exc:
        logger.warning(f"[alpaca-order] get_account failed: {exc}")
        raise ValueError(f"Failed to fetch account: {exc}") from exc


def get_positions() -> list[dict]:
    """
    Fetch all open positions from Alpaca.
    Returns a list of position dicts.
    """
    client = _get_client()
    if client is None:
        raise ValueError("Alpaca API keys not configured")

    try:
        positions = client.get_all_positions()
        return [
            {
                "symbol":             p.symbol,
                "qty":                float(p.qty),
                "avg_entry":          float(p.avg_entry_price or 0),
                "current_price":      float(p.current_price   or 0),
                "market_value":       float(p.market_value    or 0),
                "unrealized_pnl":     float(p.unrealized_pl   or 0),
                "unrealized_pnl_pct": float(p.unrealized_plpc or 0) * 100,
            }
            for p in positions
        ]
    except Exception as exc:
        logger.warning(f"[alpaca-order] get_positions failed: {exc}")
        raise ValueError(f"Failed to fetch positions: {exc}") from exc


# ── Order submission ──────────────────────────────────────────────────────────

async def submit_order(
    db:          AsyncSession,
    symbol:      str,
    side:        str,
    qty:         float,
    order_type:  str  = "market",
    limit_price: float | None = None,
) -> LiveOrder:
    """
    Submit an order to Alpaca and persist a LiveOrder row in the DB.

    Pre-trade risk check: order notional (qty × price) must not exceed
    settings.MAX_ORDER_VALUE. Uses limit_price for limits; for market
    orders we use a rough estimate if available — check is best-effort.

    Raises ValueError on validation failures or Alpaca errors.
    """
    client = _get_client()
    if client is None:
        raise ValueError("Alpaca API keys not configured")

    symbol = symbol.upper()

    # ── Pre-trade notional check ───────────────────────────────────────────
    approx_price = limit_price or _get_approx_price(client, symbol)
    if approx_price and approx_price > 0:
        notional = qty * approx_price
        if notional > settings.MAX_ORDER_VALUE:
            raise ValueError(
                f"Order value ${notional:,.2f} exceeds maximum ${settings.MAX_ORDER_VALUE:,.0f}"
            )

    # ── Persist LiveOrder row (status=pending before Alpaca call) ──────────
    live_order = LiveOrder(
        symbol      = symbol,
        side        = side,
        order_type  = order_type,
        qty         = qty,
        limit_price = limit_price,
        status      = "pending",
    )
    db.add(live_order)
    await db.flush()   # get live_order.id without committing

    # ── Submit to Alpaca ───────────────────────────────────────────────────
    try:
        from alpaca.trading.enums import OrderSide, TimeInForce
        from alpaca.trading.requests import LimitOrderRequest, MarketOrderRequest

        alpaca_side = OrderSide.BUY if side == "buy" else OrderSide.SELL
        tif         = TimeInForce.DAY

        if order_type == "market":
            req = MarketOrderRequest(
                symbol       = symbol,
                qty          = qty,
                side         = alpaca_side,
                time_in_force= tif,
            )
        else:
            if limit_price is None:
                raise ValueError("limit_price is required for limit orders")
            req = LimitOrderRequest(
                symbol        = symbol,
                qty           = qty,
                side          = alpaca_side,
                time_in_force = tif,
                limit_price   = limit_price,
            )

        order = client.submit_order(order_data=req)

        # Update DB row with Alpaca's response
        live_order.alpaca_order_id = str(order.id)
        live_order.status          = _map_status(str(order.status))
        if order.filled_qty:
            live_order.filled_qty = float(order.filled_qty)
        if order.filled_avg_price:
            live_order.filled_avg_price = float(order.filled_avg_price)
            live_order.filled_at        = datetime.now(timezone.utc)

        logger.info(
            f"[alpaca-order] {side.upper()} {qty} {symbol} "
            f"submitted — alpaca_id={order.id} status={order.status}"
        )

    except ValueError:
        live_order.status        = "rejected"
        live_order.error_message = "Validation error"
        raise

    except Exception as exc:
        live_order.status        = "rejected"
        live_order.error_message = str(exc)
        logger.warning(f"[alpaca-order] submit failed for {symbol}: {exc}")
        raise ValueError(f"Alpaca order submission failed: {exc}") from exc

    return live_order


# ── Order cancellation ────────────────────────────────────────────────────────

async def cancel_order(db: AsyncSession, live_order_id: int) -> None:
    """
    Cancel an open order by its DB id.
    Calls Alpaca cancel endpoint then updates the DB row.
    """
    client = _get_client()
    if client is None:
        raise ValueError("Alpaca API keys not configured")

    row = await db.scalar(
        select(LiveOrder).where(LiveOrder.id == live_order_id)
    )
    if row is None:
        raise ValueError(f"Order {live_order_id} not found")
    if row.status in ("filled", "canceled", "rejected"):
        raise ValueError(f"Order {live_order_id} is already {row.status}")
    if row.alpaca_order_id is None:
        # Order was never accepted by Alpaca — just mark canceled locally
        row.status = "canceled"
        return

    try:
        client.cancel_order_by_id(row.alpaca_order_id)
        row.status = "canceled"
        logger.info(f"[alpaca-order] Canceled order {live_order_id} (alpaca_id={row.alpaca_order_id})")
    except Exception as exc:
        logger.warning(f"[alpaca-order] cancel failed: {exc}")
        raise ValueError(f"Failed to cancel order: {exc}") from exc


# ── Order status sync ─────────────────────────────────────────────────────────

async def sync_order_status(db: AsyncSession, live_order_id: int) -> LiveOrder:
    """
    Re-fetch order status from Alpaca and update the DB row.
    Useful for checking if a pending/accepted order has since been filled.
    """
    client = _get_client()
    if client is None:
        raise ValueError("Alpaca API keys not configured")

    row = await db.scalar(
        select(LiveOrder).where(LiveOrder.id == live_order_id)
    )
    if row is None:
        raise ValueError(f"Order {live_order_id} not found")
    if row.alpaca_order_id is None:
        return row

    try:
        order = client.get_order_by_id(row.alpaca_order_id)
        row.status    = _map_status(str(order.status))
        row.filled_qty = float(order.filled_qty or 0)
        if order.filled_avg_price:
            row.filled_avg_price = float(order.filled_avg_price)
            row.filled_at        = datetime.now(timezone.utc)
    except Exception as exc:
        logger.warning(f"[alpaca-order] sync_order_status failed: {exc}")

    return row


# ── Order history from DB ─────────────────────────────────────────────────────

async def get_orders(db: AsyncSession, limit: int = 50) -> list[LiveOrder]:
    """Return recent live orders from the DB, newest first."""
    rows = (await db.scalars(
        select(LiveOrder)
        .order_by(LiveOrder.submitted_at.desc())
        .limit(limit)
    )).all()
    return list(rows)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _map_status(alpaca_status: str) -> str:
    """Normalise Alpaca order status strings to our set."""
    mapping = {
        "new":             "accepted",
        "accepted":        "accepted",
        "pending_new":     "pending",
        "partially_filled":"accepted",
        "filled":          "filled",
        "done_for_day":    "filled",
        "canceled":        "canceled",
        "expired":         "canceled",
        "replaced":        "canceled",
        "pending_cancel":  "accepted",
        "rejected":        "rejected",
        "suspended":       "rejected",
        "calculated":      "accepted",
    }
    return mapping.get(alpaca_status.lower(), alpaca_status)


def _get_approx_price(client: Any, symbol: str) -> float | None:
    """
    Best-effort approximate price for pre-trade notional check.
    Returns None on failure (check is skipped — not a hard block).
    """
    try:
        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.data.requests import StockLatestTradeRequest
        data_client = StockHistoricalDataClient(
            api_key    = settings.ALPACA_API_KEY,
            secret_key = settings.ALPACA_SECRET_KEY,
        )
        req    = StockLatestTradeRequest(symbol_or_symbols=symbol)
        trades = data_client.get_stock_latest_trade(req)
        return float(trades[symbol].price)
    except Exception:
        return None

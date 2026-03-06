"""
Paper Trading Simulator — Phase 5.

Self-contained engine that simulates order execution using closing prices
already stored in the market_data table. No external API or account needed.

Simulation rules:
  - Market orders fill immediately at the most recent close price in the DB.
  - Limit orders queue as 'new' and are re-checked on every get_state() call.
    BUY limit fills when price ≤ limit_price.
    SELL limit fills when price ≥ limit_price.
  - Short selling is not allowed (can only sell what you own).
  - No commissions or slippage (simplification for paper trading).
  - Starting equity: $100,000 cash.

All state is persisted in PostgreSQL (paper_account, paper_positions,
paper_orders, paper_equity_history). Use POST /api/paper/reset to wipe and restart.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from loguru import logger
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import (
    MarketData,
    PaperAccount,
    PaperEquityHistory,
    PaperOrder,
    PaperPosition,
)

STARTING_CASH = 100_000.0


# ── Price lookup ──────────────────────────────────────────────────────────────

async def _get_price(symbol: str, session: AsyncSession) -> float:
    """
    Return the current price for a symbol.

    Priority:
      1. Alpaca REST API (real-time quote) — only when keys are configured
      2. Most recent close price from market_data table (DB fallback)

    Using Alpaca provides real market prices instead of stale DB closes.
    The Alpaca price service caches quotes for 10 s to avoid rate-limiting.
    """
    # Phase 13: try Alpaca real-time price first
    try:
        from app.services.alpaca_price_service import get_alpaca_price
        alpaca_price = get_alpaca_price(symbol)
        if alpaca_price is not None:
            return alpaca_price
    except Exception:
        pass   # Alpaca not installed or misconfigured — fall through to DB

    # Fallback: latest close from DB
    row = await session.scalar(
        select(MarketData.close)
        .where(MarketData.symbol == symbol.upper())
        .order_by(MarketData.timestamp.desc())
        .limit(1)
    )
    if row is None:
        raise ValueError(f"No price data for {symbol}. Run 'make ingest' first.")
    return float(row)


# ── Account helpers ───────────────────────────────────────────────────────────

async def _get_account(session: AsyncSession) -> PaperAccount:
    """Return the paper account, creating it with $100k cash if it doesn't exist."""
    account = await session.scalar(select(PaperAccount).limit(1))
    if account is None:
        account = PaperAccount(
            cash=STARTING_CASH,
            created_at=datetime.now(timezone.utc),
        )
        session.add(account)
        await session.flush()
    return account


async def _update_position(
    session:     AsyncSession,
    symbol:      str,
    qty_delta:   float,       # positive = buy, negative = sell
    fill_price:  float,
) -> None:
    """
    Apply a fill to the positions table.
    Creates a new row on first buy; deletes the row when qty reaches zero.
    Uses weighted-average cost basis for buys.
    """
    pos = await session.scalar(
        select(PaperPosition).where(PaperPosition.symbol == symbol)
    )

    if pos is None:
        if qty_delta <= 0:
            raise ValueError(f"No position in {symbol} to sell")
        pos = PaperPosition(
            symbol=symbol,
            qty=qty_delta,
            avg_entry_price=fill_price,
            updated_at=datetime.now(timezone.utc),
        )
        session.add(pos)
    else:
        new_qty = pos.qty + qty_delta
        if new_qty < -1e-9:
            raise ValueError(
                f"Insufficient shares: have {pos.qty:.4f} {symbol}, "
                f"trying to sell {abs(qty_delta):.4f}"
            )
        if new_qty < 1e-9:
            await session.delete(pos)   # Position fully closed
        else:
            if qty_delta > 0:
                # Adding to position — recompute weighted average entry price
                pos.avg_entry_price = (
                    (pos.qty * pos.avg_entry_price + qty_delta * fill_price) / new_qty
                )
            pos.qty        = new_qty
            pos.updated_at = datetime.now(timezone.utc)


async def _fill_order(
    session:    AsyncSession,
    order:      PaperOrder,
    fill_price: float,
    account:    PaperAccount,
) -> None:
    """
    Execute a fill: debit/credit cash, update positions, mark order as filled.
    Raises ValueError if insufficient cash or shares.
    """
    qty = order.qty - order.filled_qty   # unfilled quantity

    if order.side == "buy":
        cost = qty * fill_price
        if cost > account.cash + 1e-2:
            raise ValueError(
                f"Insufficient cash: need ${cost:,.2f}, have ${account.cash:,.2f}"
            )
        account.cash -= cost
        await _update_position(session, order.symbol, qty, fill_price)
    else:
        account.cash += qty * fill_price
        await _update_position(session, order.symbol, -qty, fill_price)

    order.filled_qty       = order.qty
    order.filled_avg_price = fill_price
    order.status           = "filled"
    order.updated_at       = datetime.now(timezone.utc)


# ── Limit order processing ────────────────────────────────────────────────────

async def _process_pending_orders(session: AsyncSession, account: PaperAccount) -> None:
    """
    Check all open limit orders and fill any that have been triggered.
    Called on every get_state() to simulate continuous monitoring.
    """
    open_orders = (await session.scalars(
        select(PaperOrder)
        .where(PaperOrder.status.in_(["new", "partially_filled"]))
        .where(PaperOrder.order_type == "limit")
    )).all()

    for order in open_orders:
        try:
            price = await _get_price(order.symbol, session)
        except ValueError:
            continue   # No price data — skip for now

        triggered = (
            (order.side == "buy"  and price <= order.limit_price) or
            (order.side == "sell" and price >= order.limit_price)
        )
        if not triggered:
            continue

        try:
            await _fill_order(session, order, price, account)
            logger.info(
                f"Limit order filled: {order.side.upper()} {order.qty} "
                f"{order.symbol} @ ${price:.2f}"
            )
        except ValueError as exc:
            logger.warning(f"Limit order {order.id} auto-canceled: {exc}")
            order.status     = "canceled"
            order.updated_at = datetime.now(timezone.utc)


# ── Daily snapshot ────────────────────────────────────────────────────────────

async def _record_snapshot(session: AsyncSession, equity: float, cash: float) -> None:
    """Insert a daily equity snapshot — at most one row per calendar day."""
    today    = date.today()
    existing = await session.scalar(
        select(PaperEquityHistory).where(PaperEquityHistory.recorded_at == today)
    )
    if existing is None:
        session.add(PaperEquityHistory(equity=equity, cash=cash, recorded_at=today))


# ── Public service functions ──────────────────────────────────────────────────

async def get_state(session: AsyncSession) -> dict[str, Any]:
    """
    Compute and return the full paper trading snapshot.

    Also handles side-effects:
      - Fills triggered limit orders
      - Records one daily equity snapshot per day
    """
    account   = await _get_account(session)
    positions = (await session.scalars(select(PaperPosition))).all()

    # Compute live equity from current DB prices
    position_value = 0.0
    positions_out: list[dict[str, Any]] = []
    for pos in positions:
        if pos.qty <= 0:
            continue
        try:
            current_price = await _get_price(pos.symbol, session)
        except ValueError:
            current_price = pos.avg_entry_price    # fallback: no recent data
        mv              = pos.qty * current_price
        cost_basis      = pos.qty * pos.avg_entry_price
        unrealized_pnl  = mv - cost_basis
        unrealized_pct  = unrealized_pnl / cost_basis if cost_basis > 0 else 0.0
        position_value += mv
        positions_out.append({
            "symbol":             pos.symbol,
            "qty":                pos.qty,
            "avg_entry_price":    pos.avg_entry_price,
            "current_price":      current_price,
            "market_value":       mv,
            "unrealized_pnl":     unrealized_pnl,
            "unrealized_pnl_pct": unrealized_pct,
        })

    equity = account.cash + position_value

    # Side-effects: limit order fills + daily snapshot
    await _process_pending_orders(session, account)
    await _record_snapshot(session, equity, account.cash)
    await session.commit()

    # Fetch orders and history (after commit)
    orders = (await session.scalars(
        select(PaperOrder).order_by(PaperOrder.created_at.desc()).limit(50)
    )).all()

    history_rows = (await session.scalars(
        select(PaperEquityHistory).order_by(PaperEquityHistory.recorded_at.asc())
    )).all()

    # Day P&L: compare to yesterday's snapshot
    day_pnl     = 0.0
    day_pnl_pct = 0.0
    if len(history_rows) >= 2:
        prev_eq     = history_rows[-2].equity
        day_pnl     = equity - prev_eq
        day_pnl_pct = day_pnl / prev_eq if prev_eq > 0 else 0.0

    total_pnl     = equity - STARTING_CASH
    total_pnl_pct = total_pnl / STARTING_CASH

    return {
        "account": {
            "equity":        equity,
            "cash":          account.cash,
            "buying_power":  account.cash,   # No margin — buying power equals free cash
            "day_pnl":       day_pnl,
            "day_pnl_pct":   day_pnl_pct,
            "total_pnl":     total_pnl,
            "total_pnl_pct": total_pnl_pct,
        },
        "positions": positions_out,
        "orders": [
            {
                "id":               str(o.id),
                "symbol":           o.symbol,
                "side":             o.side,
                "order_type":       o.order_type,
                "qty":              o.qty,
                "filled_qty":       o.filled_qty,
                "status":           o.status,
                "filled_avg_price": o.filled_avg_price,
                "limit_price":      o.limit_price,
                "created_at":       o.created_at.isoformat() if o.created_at else "",
            }
            for o in orders
        ],
        "portfolio_history": [
            {
                "timestamp": datetime.combine(
                    h.recorded_at,
                    datetime.min.time(),
                ).replace(tzinfo=timezone.utc).isoformat(),
                "equity":  h.equity,
                "pnl_pct": (h.equity - STARTING_CASH) / STARTING_CASH,
            }
            for h in history_rows
        ],
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


async def submit_order(
    session:     AsyncSession,
    symbol:      str,
    side:        str,
    qty:         float,
    order_type:  str = "market",
    limit_price: float | None = None,
) -> dict[str, Any]:
    """
    Submit a new paper trading order.

    Market orders fill immediately at the latest DB close price.
    Limit orders are stored as 'new' and processed on subsequent get_state() calls.
    """
    symbol  = symbol.upper()
    account = await _get_account(session)
    now     = datetime.now(timezone.utc)

    order = PaperOrder(
        symbol=symbol, side=side.lower(), order_type=order_type.lower(),
        qty=qty, filled_qty=0.0, status="new",
        limit_price=limit_price, created_at=now, updated_at=now,
    )
    session.add(order)
    await session.flush()   # Assigns order.id

    if order_type == "market":
        fill_price = await _get_price(symbol, session)
        await _fill_order(session, order, fill_price, account)
        await session.commit()
        logger.info(f"Market fill: {side.upper()} {qty} {symbol} @ ${fill_price:.2f}")
        return {
            "order_id": str(order.id),
            "status":   "filled",
            "message":  f"{side.upper()} {qty} {symbol} filled @ ${fill_price:.2f}",
        }
    else:
        await session.commit()
        logger.info(f"Limit queued: {side.upper()} {qty} {symbol} @ ${limit_price:.2f}")
        return {
            "order_id": str(order.id),
            "status":   "new",
            "message":  f"{side.upper()} {qty} {symbol} limit @ ${limit_price:.2f} queued",
        }


async def cancel_order(session: AsyncSession, order_id: int) -> None:
    """Cancel an open or partially-filled order."""
    order = await session.scalar(
        select(PaperOrder).where(PaperOrder.id == order_id)
    )
    if order is None:
        raise ValueError(f"Order {order_id} not found")
    if order.status not in ("new", "partially_filled"):
        raise ValueError(f"Cannot cancel order with status '{order.status}'")
    order.status     = "canceled"
    order.updated_at = datetime.now(timezone.utc)
    await session.commit()


async def reset_account(session: AsyncSession) -> None:
    """
    Reset the paper account back to $100,000 cash.
    Clears all positions, orders, and equity history.
    """
    await session.execute(delete(PaperPosition))
    await session.execute(delete(PaperOrder))
    await session.execute(delete(PaperEquityHistory))

    account = await session.scalar(select(PaperAccount).limit(1))
    if account:
        account.cash = STARTING_CASH
    else:
        session.add(PaperAccount(cash=STARTING_CASH, created_at=datetime.now(timezone.utc)))

    await session.commit()
    logger.info("Paper trading account reset to $100,000")

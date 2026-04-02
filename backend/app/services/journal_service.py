"""
Trade Journal Service — Phase 36.

Manages TradeJournal rows that are auto-created whenever a paper order fills.

Lifecycle
---------
  BUY fill  → create a new open journal entry (exit_price=None, pnl=None)
  SELL fill → find the most recent open BUY entry for the same symbol,
              close it with exit_price + realised P&L

Users can later enrich any entry with:
  notes   — free-text trade notes
  tags    — comma-separated labels (e.g. "earnings-play,breakout")
  rating  — 1–5 quality rating

All journal writes are synchronous helpers called from within the paper
trading service's async context (same SQLAlchemy session).
"""

from __future__ import annotations

from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import TradeJournal


# ── Write helpers (called from paper_trading_service._fill_order) ─────────────

async def record_fill(
    session:    AsyncSession,
    order_id:   str,
    symbol:     str,
    side:       str,
    qty:        float,
    fill_price: float,
) -> None:
    """
    Auto-called when a paper order fills.

    BUY  → creates an open journal entry.
    SELL → closes the most recent open BUY entry for the same symbol and
           records the realised P&L.
    """
    now = datetime.now(timezone.utc)

    if side == "buy":
        entry = TradeJournal(
            order_id    = str(order_id),
            symbol      = symbol.upper(),
            side        = "buy",
            qty         = qty,
            entry_price = fill_price,
            entry_date  = now,
            created_at  = now,
        )
        session.add(entry)
        logger.debug(f"Journal: opened BUY entry for {symbol} @ {fill_price}")

    elif side == "sell":
        # Find oldest open (no exit) BUY entry for this symbol (FIFO close)
        open_buy = await session.scalar(
            select(TradeJournal)
            .where(TradeJournal.symbol == symbol.upper())
            .where(TradeJournal.side   == "buy")
            .where(TradeJournal.exit_price.is_(None))
            .order_by(TradeJournal.entry_date.asc())
            .limit(1)
        )
        if open_buy is not None:
            pnl = (fill_price - open_buy.entry_price) * min(qty, open_buy.qty)
            open_buy.exit_price = fill_price
            open_buy.exit_date  = now
            open_buy.pnl        = round(pnl, 4)
            logger.debug(
                f"Journal: closed BUY {symbol} entry @ {fill_price}, P&L={pnl:.2f}"
            )
        else:
            # Orphan sell (no matching buy — e.g. after a reset)
            entry = TradeJournal(
                order_id    = str(order_id),
                symbol      = symbol.upper(),
                side        = "sell",
                qty         = qty,
                entry_price = fill_price,   # use fill price as entry placeholder
                exit_price  = fill_price,
                pnl         = 0.0,
                entry_date  = now,
                exit_date   = now,
                created_at  = now,
            )
            session.add(entry)
            logger.debug(f"Journal: orphan SELL entry for {symbol} @ {fill_price}")


# ── Read helpers ──────────────────────────────────────────────────────────────

async def list_entries(
    session: AsyncSession,
    limit:   int = 200,
) -> list[TradeJournal]:
    """Return the most recent `limit` journal entries, newest first."""
    result = await session.scalars(
        select(TradeJournal)
        .order_by(TradeJournal.entry_date.desc())
        .limit(limit)
    )
    return list(result.all())


async def update_entry(
    session: AsyncSession,
    entry_id: int,
    notes:   str | None,
    tags:    str | None,
    rating:  int | None,
) -> TradeJournal | None:
    """Patch notes / tags / rating on an existing entry.  Returns None if not found."""
    entry = await session.get(TradeJournal, entry_id)
    if entry is None:
        return None
    if notes  is not None:
        entry.notes  = notes
    if tags   is not None:
        entry.tags   = tags
    if rating is not None:
        entry.rating = rating
    return entry


def compute_stats(entries: list[TradeJournal]) -> dict:
    """
    Compute aggregate statistics from a list of journal entries.
    Only closed trades (exit_price is not None) contribute to P&L stats.
    """
    closed  = [e for e in entries if e.pnl is not None]
    wins    = [e for e in closed if e.pnl > 0]
    losses  = [e for e in closed if e.pnl <= 0]
    total_pnl = sum(e.pnl for e in closed)

    rated = [e for e in entries if e.rating is not None]
    avg_rating = (
        round(sum(e.rating for e in rated) / len(rated), 2) if rated else None
    )

    return {
        "total_trades": len(closed),
        "win_trades":   len(wins),
        "loss_trades":  len(losses),
        "win_rate":     round(len(wins) / len(closed), 4) if closed else 0.0,
        "total_pnl":    round(total_pnl, 2),
        "avg_pnl":      round(total_pnl / len(closed), 2) if closed else 0.0,
        "avg_win":      round(sum(e.pnl for e in wins)   / len(wins),   2) if wins   else 0.0,
        "avg_loss":     round(sum(e.pnl for e in losses) / len(losses), 2) if losses else 0.0,
        "avg_rating":   avg_rating,
    }

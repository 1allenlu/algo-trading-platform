"""
Portfolio Service — Phase 67.

Manages multiple named paper trading portfolios.  Each portfolio is a
separate paper account with its own starting cash, tracked via a simple
equity-curve snapshot system.

The "Default" portfolio (id=1) represents the existing paper trading account.
New portfolios are independent simulations using the strategy signals pipeline.

Public interface:
  list_portfolios(session)
  create_portfolio(name, description, starting_cash, session)
  get_portfolio(portfolio_id, session)
  delete_portfolio(portfolio_id, session)
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Portfolio


async def _ensure_default(session: AsyncSession) -> None:
    """Create the default portfolio row if it doesn't exist."""
    existing = (await session.scalars(
        select(Portfolio).where(Portfolio.is_default == True)
    )).first()
    if not existing:
        session.add(Portfolio(
            name          = "Default",
            description   = "Original paper trading account",
            starting_cash = 100_000.0,
            is_default    = True,
            created_at    = datetime.now(tz=timezone.utc),
        ))
        await session.commit()


async def list_portfolios(session: AsyncSession) -> list[dict]:
    await _ensure_default(session)
    rows = (await session.scalars(
        select(Portfolio).order_by(Portfolio.created_at)
    )).all()
    return [_to_dict(r) for r in rows]


async def create_portfolio(
    name: str,
    description: str | None,
    starting_cash: float,
    session: AsyncSession,
) -> dict:
    port = Portfolio(
        name          = name,
        description   = description,
        starting_cash = starting_cash,
        is_default    = False,
        created_at    = datetime.now(tz=timezone.utc),
    )
    session.add(port)
    await session.commit()
    return _to_dict(port)


async def get_portfolio(portfolio_id: int, session: AsyncSession) -> dict | None:
    row = await session.get(Portfolio, portfolio_id)
    return _to_dict(row) if row else None


async def delete_portfolio(portfolio_id: int, session: AsyncSession) -> bool:
    row = await session.get(Portfolio, portfolio_id)
    if not row or row.is_default:
        return False
    await session.delete(row)
    await session.commit()
    return True


def _to_dict(p: Portfolio) -> dict:
    return {
        "id":            p.id,
        "name":          p.name,
        "description":   p.description,
        "starting_cash": p.starting_cash,
        "is_default":    p.is_default,
        "created_at":    p.created_at.isoformat() if p.created_at else None,
    }

"""
Share Service — Phase 54.

Creates read-only, time-limited portfolio snapshots accessible via a public
token URL.  No authentication is required to view a snapshot.

Public interface:
  create_snapshot(title, session)  → {token, expires_at}
  get_snapshot(token, session)     → snapshot dict or None
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import PaperEquityHistory, PaperOrder, PaperPosition, PortfolioSnapshot
from app.services.analytics_service import get_summary


async def _build_equity_curve(session: AsyncSession) -> list[dict]:
    rows = (await session.scalars(
        select(PaperEquityHistory).order_by(PaperEquityHistory.recorded_at)
    )).all()
    return [
        {"date": r.recorded_at.strftime("%Y-%m-%d"), "equity": round(r.equity, 2)}
        for r in rows
    ]


async def _build_positions(session: AsyncSession) -> list[dict]:
    positions = (await session.scalars(select(PaperPosition))).all()
    return [
        {
            "symbol":     p.symbol,
            "qty":        p.qty,
            "avg_price":  round(p.avg_price, 4),
        }
        for p in positions
        if p.qty > 0
    ]


async def create_snapshot(
    title: str | None,
    session: AsyncSession,
    ttl_days: int = 7,
) -> dict:
    """
    Snapshot the current paper portfolio state and return a public share token.
    The snapshot expires after ttl_days (default 7).
    """
    equity_curve = await _build_equity_curve(session)
    positions    = await _build_positions(session)
    stats        = await get_summary(session)

    # Serialise stats — filter to JSON-safe scalar values
    safe_stats = {
        k: v for k, v in stats.items()
        if isinstance(v, (int, float, str, bool, type(None)))
    }

    now     = datetime.now(tz=timezone.utc)
    token   = uuid.uuid4().hex
    expires = now + timedelta(days=ttl_days)

    snapshot = PortfolioSnapshot(
        token             = token,
        title             = title or f"Portfolio snapshot — {now.strftime('%b %d, %Y')}",
        equity_curve_json = json.dumps(equity_curve),
        positions_json    = json.dumps(positions),
        stats_json        = json.dumps(safe_stats),
        created_at        = now,
        expires_at        = expires,
    )
    session.add(snapshot)
    await session.commit()

    return {
        "token":      token,
        "share_url":  f"/share/{token}",
        "expires_at": expires.isoformat(),
    }


async def get_snapshot(token: str, session: AsyncSession) -> dict | None:
    """
    Return a snapshot by token.  Returns None if not found or expired.
    Expired rows are cleaned up lazily on access.
    """
    row = (await session.scalars(
        select(PortfolioSnapshot).where(PortfolioSnapshot.token == token)
    )).first()

    if not row:
        return None

    now = datetime.now(tz=timezone.utc)
    if row.expires_at and row.expires_at < now:
        await session.delete(row)
        await session.commit()
        return None

    return {
        "token":        row.token,
        "title":        row.title,
        "equity_curve": json.loads(row.equity_curve_json),
        "positions":    json.loads(row.positions_json),
        "stats":        json.loads(row.stats_json),
        "created_at":   row.created_at.isoformat() if row.created_at else None,
        "expires_at":   row.expires_at.isoformat() if row.expires_at else None,
    }

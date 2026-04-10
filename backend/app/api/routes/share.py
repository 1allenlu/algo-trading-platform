"""
Share routes — Phase 54 + 68.

Endpoints:
  POST /api/share/create          → snapshot current portfolio, return token
  GET  /api/share/leaderboard     → Phase 68: public leaderboard of opted-in snapshots
  GET  /api/share/{token}         → public read-only snapshot (no auth)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal, PortfolioSnapshot
from app.services import share_service

router = APIRouter()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


class CreateSnapshotRequest(BaseModel):
    title:    str | None = None
    public:   bool = False   # Phase 68: opt-in to leaderboard


@router.post("/create", status_code=201)
async def create_snapshot(
    body: CreateSnapshotRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Snapshot the current paper portfolio and return a public share URL (expires 7 days)."""
    return await share_service.create_snapshot(body.title, db, public=body.public)


@router.get("/leaderboard")
async def leaderboard(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    Phase 68 — Anonymous public leaderboard of snapshots that opted-in to listing.
    Sorted by total_return (best first). Shows only anonymised stats.
    """
    import json
    from datetime import datetime, timezone

    now = datetime.now(tz=timezone.utc)
    rows = (await db.scalars(
        select(PortfolioSnapshot)
        .where(PortfolioSnapshot.expires_at > now)
        .order_by(PortfolioSnapshot.created_at.desc())
        .limit(200)
    )).all()

    entries = []
    for r in rows:
        stats = json.loads(r.stats_json)
        # Only include if opted-in (stats has is_public flag) or title starts with "Public:"
        if not (stats.get("is_public") or (r.title or "").startswith("Public:")):
            continue
        total_ret = stats.get("total_return_pct") or stats.get("total_return") or 0
        entries.append({
            "token":        r.token,
            "title":        r.title,
            "total_return": total_ret,
            "sharpe":       stats.get("sharpe_ratio"),
            "max_drawdown": stats.get("max_drawdown"),
            "n_trades":     stats.get("total_trades"),
            "created_at":   r.created_at.isoformat() if r.created_at else None,
        })

    entries.sort(key=lambda e: -(e["total_return"] or -9999))
    return entries[:limit]


@router.get("/{token}")
async def get_snapshot(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Public endpoint — no authentication required. Returns portfolio snapshot by token."""
    data = await share_service.get_snapshot(token, db)
    if not data:
        raise HTTPException(404, "Snapshot not found or expired")
    return data

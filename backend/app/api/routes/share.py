"""
Share routes — Phase 54.

Endpoints:
  POST /api/share/create          → snapshot current portfolio, return token (auth required)
  GET  /api/share/{token}         → public read-only snapshot (no auth)
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal
from app.services import share_service

router = APIRouter()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


class CreateSnapshotRequest(BaseModel):
    title: str | None = None


@router.post("/create", status_code=201)
async def create_snapshot(
    body: CreateSnapshotRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Snapshot the current paper portfolio and return a public share URL.
    The snapshot expires after 7 days.
    """
    return await share_service.create_snapshot(body.title, db)


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

"""
Trade Journal API routes — Phase 36.

GET   /api/journal        List entries + aggregate stats
PATCH /api/journal/{id}   Update notes / tags / rating
DELETE /api/journal/{id}  Remove an entry
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.schemas import (
    JournalEntrySchema,
    JournalListResponse,
    JournalStatsSchema,
    JournalUpdateRequest,
)
from app.services import journal_service

router = APIRouter()


@router.get("", response_model=JournalListResponse)
async def list_journal(
    limit:   int = 200,
    session: AsyncSession = Depends(get_db),
) -> JournalListResponse:
    """
    Return the most recent `limit` trade journal entries (newest first)
    along with aggregate statistics across all closed trades.
    """
    entries = await journal_service.list_entries(session, limit=limit)
    stats   = journal_service.compute_stats(entries)

    return JournalListResponse(
        entries = [JournalEntrySchema.model_validate(e) for e in entries],
        stats   = JournalStatsSchema(**stats),
        count   = len(entries),
    )


@router.patch("/{entry_id}", response_model=JournalEntrySchema)
async def update_journal_entry(
    entry_id: int,
    body:     JournalUpdateRequest,
    session:  AsyncSession = Depends(get_db),
) -> JournalEntrySchema:
    """Update notes, tags, or star rating on a journal entry."""
    entry = await journal_service.update_entry(
        session  = session,
        entry_id = entry_id,
        notes    = body.notes,
        tags     = body.tags,
        rating   = body.rating,
    )
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Journal entry {entry_id} not found")
    return JournalEntrySchema.model_validate(entry)


@router.delete("/{entry_id}")
async def delete_journal_entry(
    entry_id: int,
    session:  AsyncSession = Depends(get_db),
) -> dict:
    """Remove a journal entry by ID."""
    from sqlalchemy import delete
    from app.models.database import TradeJournal

    result = await session.execute(
        delete(TradeJournal).where(TradeJournal.id == entry_id)
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail=f"Journal entry {entry_id} not found")
    return {"message": f"Entry {entry_id} deleted"}

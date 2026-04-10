"""
Economics Calendar routes — Phase 55.

Endpoints:
  GET /api/economics/calendar?days=90  → upcoming macro events with countdown
  GET /api/economics/summary           → count of events in next 7/30 days
"""

from fastapi import APIRouter, Query
from app.services.economics_service import get_calendar, get_upcoming_count

router = APIRouter()


@router.get("/calendar")
async def macro_calendar(days: int = Query(default=90, ge=1, le=365)) -> list[dict]:
    """Upcoming macro events within the next `days` days, sorted by date."""
    return get_calendar(days)


@router.get("/summary")
async def macro_summary() -> dict:
    """Count of upcoming events in the next 7 and 30 days."""
    return get_upcoming_count()

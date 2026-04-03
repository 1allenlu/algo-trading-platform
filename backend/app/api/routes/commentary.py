"""
Commentary routes — Phase 43: LLM-powered portfolio summary.

GET /api/analytics/commentary
  Fetches the current portfolio summary + P&L attribution, then calls
  commentary_service.generate_commentary() to produce a plain-English
  2–3 sentence summary using Claude Haiku.

  Returns:
    { commentary: str | null, generated_at: str | null, model: str | null }

  When ANTHROPIC_API_KEY is not set, commentary is null and no error is raised.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services import commentary_service
from app.services.analytics_service import get_pnl_attribution, get_summary

router = APIRouter()


@router.get("/commentary")
async def get_commentary(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Generate a plain-English portfolio summary using Claude.

    Pulls live summary metrics and P&L attribution from the analytics service,
    then passes them to the LLM commentary service.

    Returns null commentary when ANTHROPIC_API_KEY is not configured.
    """
    # Fetch analytics data (both are lightweight DB queries)
    summary = await get_summary(db)
    pnl     = await get_pnl_attribution(db)

    return await commentary_service.generate_commentary(summary, pnl)

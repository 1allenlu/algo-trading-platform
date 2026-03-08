from fastapi import APIRouter, Depends
from loguru import logger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as aioredis

from app.api.deps import get_db
from app.core.config import settings
from app.models.schemas import HealthResponse

# Set at startup by main.py so health endpoint can report it
_price_source: str = "simulator"

def set_price_source(source: str) -> None:
    global _price_source
    _price_source = source

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    """
    Health check endpoint.

    Verifies connectivity to both PostgreSQL and Redis.
    Returns status for each dependency so clients (and Docker) can
    distinguish between full outages and partial degradation.

    Used by:
    - Docker healthcheck (returns non-200 when unhealthy)
    - Frontend TopBar status indicator
    - Monitoring / alerting systems (Phase 5)
    """
    # ── Database ──────────────────────────────────────────────────────────────
    db_status = "healthy"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.error(f"Database health check failed: {exc}")
        db_status = "unhealthy"

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_status = "healthy"
    try:
        redis = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        await redis.ping()
        await redis.aclose()
    except Exception as exc:
        logger.error(f"Redis health check failed: {exc}")
        redis_status = "unhealthy"

    overall = "healthy" if db_status == "healthy" and redis_status == "healthy" else "degraded"

    return HealthResponse(
        status=overall,
        database=db_status,
        redis=redis_status,
        version="0.24.0",
        price_source=_price_source,
    )

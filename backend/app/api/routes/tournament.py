"""
Tournament routes — Phase 52.

Endpoints:
  GET    /api/tournament/                        → list all tournament runs
  POST   /api/tournament/                        → create + run a new tournament
  GET    /api/tournament/{tournament_id}         → get tournament detail + leaderboard
  DELETE /api/tournament/{tournament_id}         → delete a tournament run
  POST   /api/tournament/{tournament_id}/run     → (re-)run a completed/failed tournament
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal
from app.services import tournament_service

router = APIRouter()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ── Pydantic request models ────────────────────────────────────────────────────

class ParticipantIn(BaseModel):
    name:   str
    config: dict   # {"strategy": "sma_cross", "fast": 10, "slow": 30, ...}


class CreateTournamentRequest(BaseModel):
    name:         str
    symbols:      list[str]
    start_date:   str          # YYYY-MM-DD
    end_date:     str          # YYYY-MM-DD
    participants: list[ParticipantIn]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
async def list_tournaments(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """List all tournament runs (summary, newest first)."""
    return await tournament_service.list_tournaments(db)


@router.post("/", status_code=201)
async def create_tournament(
    body: CreateTournamentRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Create a new tournament and immediately start running it in the background.
    Returns tournament_id; poll GET /{id} to check status.
    """
    if not body.participants:
        raise HTTPException(400, "At least one participant is required")
    if len(body.participants) > 10:
        raise HTTPException(400, "Maximum 10 participants per tournament")

    result = await tournament_service.create_tournament(
        name         = body.name,
        symbols      = body.symbols,
        start_date   = body.start_date,
        end_date     = body.end_date,
        participants = [p.model_dump() for p in body.participants],
        session      = db,
    )
    tid = result["tournament_id"]

    # Run asynchronously so the response returns quickly
    async def _run():
        from app.models.database import AsyncSessionLocal as _SL
        async with _SL() as s:
            await tournament_service.run_tournament(tid, s)

    background_tasks.add_task(_run)
    return result


@router.get("/{tournament_id}")
async def get_tournament(
    tournament_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Full tournament detail including per-participant metrics and equity curves."""
    data = await tournament_service.get_tournament(tournament_id, db)
    if not data:
        raise HTTPException(404, "Tournament not found")
    return data


@router.post("/{tournament_id}/run")
async def rerun_tournament(
    tournament_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-run a tournament (e.g. after data is updated or it previously failed)."""
    data = await tournament_service.get_tournament(tournament_id, db)
    if not data:
        raise HTTPException(404, "Tournament not found")
    if data["status"] == "running":
        raise HTTPException(400, "Tournament is already running")

    async def _run():
        from app.models.database import AsyncSessionLocal as _SL
        async with _SL() as s:
            await tournament_service.run_tournament(tournament_id, s)

    background_tasks.add_task(_run)
    return {"tournament_id": tournament_id, "status": "started"}


@router.delete("/{tournament_id}")
async def delete_tournament(
    tournament_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Delete a tournament and all its participants."""
    ok = await tournament_service.delete_tournament(tournament_id, db)
    if not ok:
        raise HTTPException(404, "Tournament not found")
    return {"deleted": tournament_id}

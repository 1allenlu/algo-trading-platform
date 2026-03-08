"""
Scheduler Routes — Phase 21.

GET  /api/scheduler/jobs              — list jobs with status + next run time
POST /api/scheduler/jobs/{job_id}/run — trigger a job immediately
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

from app.services.scheduler_service import get_job_statuses, get_scheduler

router = APIRouter()


class JobStatus(BaseModel):
    job_id:        str
    name:          str
    next_run_time: str | None
    last_run_at:   str | None
    last_status:   str
    last_error:    str | None


class RunNowResponse(BaseModel):
    job_id:  str
    message: str


@router.get("/jobs", response_model=list[JobStatus], tags=["scheduler"])
async def list_jobs() -> list[dict]:
    """Return all scheduler jobs with next_run_time and last execution status."""
    return get_job_statuses()


@router.post("/jobs/{job_id}/run", response_model=RunNowResponse, tags=["scheduler"])
async def run_job_now(job_id: str) -> RunNowResponse:
    """Trigger a scheduled job immediately (runs in the background)."""
    sched = get_scheduler()
    job = sched.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    import asyncio
    # Modify next_run_time to now — APScheduler will execute ASAP
    job.modify(next_run_time=__import__("datetime").datetime.now(__import__("datetime").timezone.utc))
    return RunNowResponse(job_id=job_id, message=f"Job '{job_id}' triggered")

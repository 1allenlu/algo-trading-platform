"""
Scenario Stress Test routes — Phase 79.

GET  /api/stress/scenarios   → list available scenarios
POST /api/stress/run         → apply a scenario to a set of positions
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.stress_service import list_scenarios, run_stress_test

router = APIRouter()


class StressPosition(BaseModel):
    symbol:        str
    qty:           float
    current_price: float
    market_value:  float | None = None


class StressTestRequest(BaseModel):
    scenario_id:   str
    positions:     list[StressPosition]
    custom_shock:  float | None = None  # only used when scenario_id == "custom"


@router.get("/scenarios")
async def get_scenarios() -> list[dict]:
    """Return metadata for all built-in scenarios (no sector_shocks in response)."""
    return list_scenarios()


@router.post("/run")
async def stress_test_run(body: StressTestRequest) -> dict:
    """
    Apply a historical-crisis scenario to the supplied positions.

    Returns per-position shocks + aggregate portfolio impact.
    """
    positions = [p.model_dump() for p in body.positions]
    try:
        result = await asyncio.to_thread(
            run_stress_test,
            body.scenario_id,
            positions,
            body.custom_shock,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result

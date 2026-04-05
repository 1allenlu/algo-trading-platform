"""
Custom Strategy Builder routes — Phase 48.

Endpoints:
  GET    /api/strategy-builder/strategies           → list saved strategies
  POST   /api/strategy-builder/strategies           → create strategy
  DELETE /api/strategy-builder/strategies/{id}      → delete strategy
  GET    /api/strategy-builder/evaluate/{id}/{sym}  → run strategy on symbol
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.services import strategy_builder_service as svc

router = APIRouter()


class CreateStrategyRequest(BaseModel):
    name:        str
    description: str | None = None
    conditions:  dict
    owner:       str | None = None


@router.get("/strategies")
async def list_strategies(
    owner: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    rows = await svc.list_strategies(db, owner=owner)
    import json
    return [
        {
            "id":          r.id,
            "name":        r.name,
            "description": r.description,
            "conditions":  json.loads(r.conditions_json),
            "owner":       r.owner,
            "created_at":  r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/strategies", status_code=201)
async def create_strategy(
    req: CreateStrategyRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    import json
    obj = await svc.create_strategy(db, req.name, req.description, req.conditions, req.owner)
    await db.commit()
    return {
        "id":          obj.id,
        "name":        obj.name,
        "description": obj.description,
        "conditions":  json.loads(obj.conditions_json),
        "owner":       obj.owner,
        "created_at":  obj.created_at.isoformat(),
    }


@router.delete("/strategies/{strategy_id}")
async def delete_strategy(strategy_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    ok = await svc.delete_strategy(db, strategy_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Strategy not found")
    await db.commit()
    return {"message": "deleted"}


@router.get("/evaluate/{strategy_id}/{symbol}")
async def evaluate_strategy(
    strategy_id: int,
    symbol:      str,
    limit:       int = Query(default=252, ge=50, le=1000),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Run the saved strategy rule set against recent OHLCV data for a symbol.
    Returns a list of {date, signal, close} where signal is 'buy' or 'sell'.
    """
    try:
        return await svc.evaluate_strategy_for_symbol(db, strategy_id, symbol, limit)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

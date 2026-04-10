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


# ── Phase 69: Natural Language Strategy Parser ────────────────────────────────

class NLPStrategyRequest(BaseModel):
    description: str   # e.g. "buy when RSI < 30 and price above 50-day SMA"


@router.post("/parse-nlp")
async def parse_nlp_strategy(body: NLPStrategyRequest) -> dict:
    """
    Phase 69 — Use Anthropic Claude to parse a plain-English strategy description
    into a CustomStrategy conditions JSON ready to save and run.

    Requires ANTHROPIC_API_KEY to be configured. Returns conditions JSON
    plus a human-readable explanation.
    """
    from app.core.config import settings

    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(400, "ANTHROPIC_API_KEY not configured — NLP parsing unavailable")

    try:
        import anthropic
        import json as _json

        SYSTEM = """You are a quantitative trading strategy assistant.
Convert the user's plain-English strategy description into a JSON object with this exact schema:
{
  "buy_rules":  [{"indicator": "rsi"|"sma"|"ema"|"sma_cross"|"volume_ratio"|"change_pct", "period": int, "op": "gt"|"lt"|"gte"|"lte"|"cross_above"|"cross_below", "value": number}],
  "sell_rules": [...same format...],
  "logic": "AND"|"OR",
  "explanation": "2-sentence plain-English summary of the strategy"
}
For sma_cross: use "fast" and "slow" instead of "period" and "value".
Only output valid JSON. No markdown, no code blocks."""

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model      = "claude-haiku-4-5-20251001",
            max_tokens = 500,
            system     = SYSTEM,
            messages   = [{"role": "user", "content": body.description}],
        )
        raw = msg.content[0].text.strip()
        parsed = _json.loads(raw)

        return {
            "conditions": {
                "buy_rules":  parsed.get("buy_rules", []),
                "sell_rules": parsed.get("sell_rules", []),
                "logic":      parsed.get("logic", "AND"),
            },
            "explanation": parsed.get("explanation", ""),
            "raw_description": body.description,
        }

    except Exception as exc:
        raise HTTPException(500, f"NLP parsing failed: {exc}")

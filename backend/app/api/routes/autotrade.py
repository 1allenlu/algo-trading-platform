"""
Auto-Trade routes — Phase 12.

Signal-based automated paper trading — reads composite BUY/HOLD/SELL signals
and places market orders automatically when confidence exceeds the threshold.

Endpoints:
  GET  /api/autotrade/config           → current configuration
  POST /api/autotrade/config           → update configuration
  POST /api/autotrade/enable           → set enabled=True
  POST /api/autotrade/disable          → set enabled=False
  GET  /api/autotrade/log              → recent auto-trade log (limit param)
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal, AutoTradeLog
from app.services.autotrade_service import get_config, upsert_config

router = APIRouter()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ── Schemas ────────────────────────────────────────────────────────────────────

class AutoTradeConfigResponse(BaseModel):
    id:                 int
    enabled:            bool
    symbols:            list[str]   # parsed from comma-separated
    signal_threshold:   float
    position_size_pct:  float
    check_interval_sec: int
    updated_at:         str | None


class UpdateConfigRequest(BaseModel):
    symbols:            str   | None = Field(None, description="Comma-separated symbols, e.g. 'SPY,QQQ,AAPL'")
    signal_threshold:   float | None = Field(None, ge=0.1, le=0.99, description="Min confidence to act [0.1–0.99]")
    position_size_pct:  float | None = Field(None, gt=0, le=0.5,   description="Fraction of equity per trade [0–0.5]")
    check_interval_sec: int   | None = Field(None, ge=10, le=3600,  description="Seconds between checks [10–3600]")


def _config_response(cfg) -> dict:
    return {
        "id":                 cfg.id,
        "enabled":            cfg.enabled,
        "symbols":            [s.strip().upper() for s in cfg.symbols.split(",") if s.strip()],
        "signal_threshold":   cfg.signal_threshold,
        "position_size_pct":  cfg.position_size_pct,
        "check_interval_sec": cfg.check_interval_sec,
        "updated_at":         cfg.updated_at.isoformat() if cfg.updated_at else None,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/config")
async def get_autotrade_config(db: AsyncSession = Depends(get_db)) -> dict:
    """Return the current auto-trade configuration (creates defaults on first call)."""
    cfg = await get_config(db)
    return _config_response(cfg)


@router.post("/config")
async def update_autotrade_config(
    body: UpdateConfigRequest,
    db:   AsyncSession = Depends(get_db),
) -> dict:
    """
    Update auto-trade configuration fields (partial update — omit fields to leave unchanged).
    Does NOT toggle `enabled` — use /enable or /disable for that.
    """
    if body.symbols is not None:
        cleaned = [s.strip().upper() for s in body.symbols.split(",") if s.strip()]
        if not cleaned:
            raise HTTPException(status_code=400, detail="symbols must contain at least one ticker")
        symbols_str = ",".join(cleaned)
    else:
        symbols_str = None

    cfg = await upsert_config(
        db,
        symbols=symbols_str,
        signal_threshold=body.signal_threshold,
        position_size_pct=body.position_size_pct,
        check_interval_sec=body.check_interval_sec,
    )
    return _config_response(cfg)


@router.post("/enable")
async def enable_autotrade(db: AsyncSession = Depends(get_db)) -> dict:
    """Enable automatic signal-based paper trading."""
    cfg = await upsert_config(db, enabled=True)
    return {"message": "Auto-trading enabled", **_config_response(cfg)}


@router.post("/disable")
async def disable_autotrade(db: AsyncSession = Depends(get_db)) -> dict:
    """Pause automatic signal-based paper trading without changing other config."""
    cfg = await upsert_config(db, enabled=False)
    return {"message": "Auto-trading disabled", **_config_response(cfg)}


@router.get("/log")
async def get_autotrade_log(
    limit: int = 100,
    db:    AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return recent auto-trade log entries (newest first)."""
    rows = (await db.scalars(
        select(AutoTradeLog)
        .order_by(AutoTradeLog.created_at.desc())
        .limit(limit)
    )).all()

    return [
        {
            "id":         r.id,
            "symbol":     r.symbol,
            "signal":     r.signal,
            "confidence": r.confidence,
            "score":      r.score,
            "action":     r.action,
            "qty":        r.qty,
            "price":      r.price,
            "reason":     r.reason,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]

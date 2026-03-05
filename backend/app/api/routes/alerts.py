"""
Alert routes — Phase 8.

REST endpoints for managing alert rules and viewing alert history.

Endpoints:
  GET    /api/alerts/rules              → list all rules
  POST   /api/alerts/rules              → create a rule
  PATCH  /api/alerts/rules/{id}/toggle  → enable/disable a rule
  DELETE /api/alerts/rules/{id}         → delete a rule

  GET    /api/alerts/events             → alert history (recent events)
  PATCH  /api/alerts/events/acknowledge → mark all events as acknowledged
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AlertEvent, AlertRule, AsyncSessionLocal
from app.models.schemas import (
    ALERT_CONDITIONS,
    AlertRuleCreate,
    AlertRuleResponse,
    AlertRulesListResponse,
    AlertEventResponse,
    AlertEventsListResponse,
)
from app.services.alert_service import get_alert_service

router = APIRouter()


async def get_db():
    """Yield an async database session."""
    async with AsyncSessionLocal() as session:
        yield session


# ── Rules ─────────────────────────────────────────────────────────────────────

@router.get("/rules", response_model=AlertRulesListResponse)
async def list_rules(db: AsyncSession = Depends(get_db)):
    """Return all alert rules (active and inactive) ordered by creation date."""
    rows = (await db.scalars(
        select(AlertRule).order_by(AlertRule.created_at.desc())
    )).all()
    return AlertRulesListResponse(
        rules=[AlertRuleResponse.model_validate(r) for r in rows],
        count=len(rows),
    )


@router.post("/rules", response_model=AlertRuleResponse, status_code=201)
async def create_rule(
    body: AlertRuleCreate,
    db:   AsyncSession = Depends(get_db),
):
    """
    Create a new alert rule.
    condition must be one of: price_above, price_below, change_pct_above, change_pct_below.
    """
    if body.condition not in ALERT_CONDITIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid condition '{body.condition}'. Must be one of: {sorted(ALERT_CONDITIONS)}",
        )

    rule = AlertRule(
        symbol           = body.symbol.upper(),
        condition        = body.condition,
        threshold        = body.threshold,
        cooldown_seconds = body.cooldown_seconds,
        is_active        = True,
        created_at       = datetime.now(timezone.utc),
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)

    # Refresh the in-memory rule cache so the new rule is evaluated immediately
    await get_alert_service().refresh_rules()

    logger.info(f"Alert rule created: {rule.symbol} {rule.condition} {rule.threshold}")
    return AlertRuleResponse.model_validate(rule)


@router.patch("/rules/{rule_id}/toggle", response_model=AlertRuleResponse)
async def toggle_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Enable a disabled rule, or disable an enabled one."""
    rule = await db.get(AlertRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")

    rule.is_active = not rule.is_active
    await db.commit()
    await db.refresh(rule)

    # Refresh cache so change takes effect on the next tick
    await get_alert_service().refresh_rules()

    logger.info(f"Alert rule {rule_id} toggled → is_active={rule.is_active}")
    return AlertRuleResponse.model_validate(rule)


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Permanently delete an alert rule."""
    rule = await db.get(AlertRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")

    await db.execute(delete(AlertRule).where(AlertRule.id == rule_id))
    await db.commit()

    # Refresh cache so the deleted rule is no longer evaluated
    await get_alert_service().refresh_rules()

    logger.info(f"Alert rule {rule_id} deleted")


# ── Events ────────────────────────────────────────────────────────────────────

@router.get("/events", response_model=AlertEventsListResponse)
async def list_events(
    limit: int = 100,
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """
    Return recent alert events, newest first.
    Pass unread_only=true to get only unacknowledged events.
    """
    q = select(AlertEvent).order_by(AlertEvent.triggered_at.desc()).limit(limit)
    if unread_only:
        q = q.where(AlertEvent.acknowledged == False)  # noqa: E712
    rows = (await db.scalars(q)).all()
    return AlertEventsListResponse(
        events=[AlertEventResponse.model_validate(r) for r in rows],
        count=len(rows),
    )


@router.patch("/events/acknowledge", response_model=dict)
async def acknowledge_all(db: AsyncSession = Depends(get_db)):
    """Mark all unacknowledged alert events as acknowledged."""
    result = await db.execute(
        update(AlertEvent)
        .where(AlertEvent.acknowledged == False)  # noqa: E712
        .values(acknowledged=True)
    )
    await db.commit()
    count = result.rowcount
    logger.info(f"Acknowledged {count} alert events")
    return {"acknowledged": count}

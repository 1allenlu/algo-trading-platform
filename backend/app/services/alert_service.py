"""
Alert Service — Phase 8.

Evaluates user-defined alert rules against every incoming price tick and fires
AlertEvent rows when conditions are met. Fired events are:
  1. Persisted to the `alert_events` DB table.
  2. Broadcast as JSON to all WebSocket clients subscribed to /ws/alerts.

Rule evaluation is cheap (simple numeric comparisons) and runs synchronously
inside the async tick loop — no thread pool needed.

Rule cache:
  Loading rules from the DB on every tick would be wasteful.
  Instead, rules are cached in memory and refreshed every RULE_CACHE_TTL_S
  seconds. A full refresh also runs after any REST write (create/update/delete).

Cooldown:
  To prevent alert spam, a rule won't fire again until `cooldown_seconds`
  have elapsed since `last_triggered_at`. This is checked against the
  in-memory copy (fast) and written to the DB row after firing (persistent).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from loguru import logger
from sqlalchemy import select, update

from app.models.database import AlertEvent, AlertRule, AsyncSessionLocal
from app.models.schemas import AlertEventWsMessage

if TYPE_CHECKING:
    from app.services.price_simulator import PriceTick

# How often to reload rules from DB (seconds)
RULE_CACHE_TTL_S = 30.0


class AlertService:
    """
    Checks PriceTick objects against all active AlertRules and fires events.

    Lifecycle (called from main.py lifespan):
      service = AlertService()
      service.set_ws_broadcast(broadcast_fn)   # inject WS broadcast
      await service.refresh_rules()            # initial load

    Then on each tick (called from price_simulator):
      await service.check_tick(tick)
    """

    def __init__(self) -> None:
        # In-memory cache: rule_id → row dict
        self._rules: dict[int, dict] = {}
        self._last_refresh: float = 0.0
        self._ws_broadcast = None   # Callable[[str], Awaitable[None]] | None

    # ── Dependency injection ───────────────────────────────────────────────────

    def set_ws_broadcast(self, fn) -> None:
        """
        Inject the WebSocket broadcast function so we can push fired alerts.
        `fn` must be: async def broadcast(payload: str) -> None
        Called from main.py after the AlertConnectionManager is created.
        """
        self._ws_broadcast = fn

    # ── Rule cache ────────────────────────────────────────────────────────────

    async def refresh_rules(self) -> None:
        """Reload all active alert rules from the DB into memory."""
        import time
        async with AsyncSessionLocal() as session:
            rows = (await session.scalars(
                select(AlertRule).where(AlertRule.is_active == True)  # noqa: E712
            )).all()

        self._rules = {
            row.id: {
                "id":               row.id,
                "symbol":           row.symbol.upper(),
                "condition":        row.condition,
                "threshold":        row.threshold,
                "cooldown_seconds": row.cooldown_seconds,
                "last_triggered_at": row.last_triggered_at,
            }
            for row in rows
        }
        self._last_refresh = time.monotonic()
        logger.debug(f"AlertService: loaded {len(self._rules)} active rules")

    async def _maybe_refresh(self) -> None:
        """Refresh rule cache if TTL has expired."""
        import time
        if time.monotonic() - self._last_refresh >= RULE_CACHE_TTL_S:
            await self.refresh_rules()

    # ── Tick evaluation ───────────────────────────────────────────────────────

    async def check_tick(self, tick: "PriceTick") -> None:
        """
        Evaluate all active rules for the tick's symbol.
        Called once per tick per symbol (~7 symbols × 1Hz).
        """
        await self._maybe_refresh()

        sym = tick.symbol.upper()
        now = datetime.now(timezone.utc)

        for rule in list(self._rules.values()):
            if rule["symbol"] != sym:
                continue

            # ── Cooldown check ────────────────────────────────────────────────
            last = rule["last_triggered_at"]
            if last is not None:
                # Make last timezone-aware if stored as naive UTC
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                elapsed = (now - last).total_seconds()
                if elapsed < rule["cooldown_seconds"]:
                    continue

            # ── Condition check ───────────────────────────────────────────────
            condition  = rule["condition"]
            threshold  = rule["threshold"]
            triggered  = False
            value      = 0.0

            if condition == "price_above":
                value     = tick.price
                triggered = tick.price >= threshold
            elif condition == "price_below":
                value     = tick.price
                triggered = tick.price <= threshold
            elif condition == "change_pct_above":
                value     = tick.change_pct * 100       # Convert to percent
                triggered = value >= threshold
            elif condition == "change_pct_below":
                value     = tick.change_pct * 100
                triggered = value <= threshold

            if not triggered:
                continue

            # ── Fire the alert ────────────────────────────────────────────────
            await self._fire(rule, tick, value, now)

    # ── Internal: fire + persist ──────────────────────────────────────────────

    async def _fire(
        self,
        rule:  dict,
        tick:  "PriceTick",
        value: float,
        now:   datetime,
    ) -> None:
        """Persist the AlertEvent to DB and broadcast to WebSocket clients."""
        condition = rule["condition"]
        threshold = rule["threshold"]
        sym       = rule["symbol"]

        # Build a human-readable message
        if condition == "price_above":
            msg = f"{sym} crossed above ${threshold:.2f} (current: ${value:.2f})"
        elif condition == "price_below":
            msg = f"{sym} crossed below ${threshold:.2f} (current: ${value:.2f})"
        elif condition == "change_pct_above":
            msg = f"{sym} daily change exceeded +{threshold:.1f}% (current: {value:+.2f}%)"
        else:  # change_pct_below
            msg = f"{sym} daily change fell below {threshold:.1f}% (current: {value:+.2f}%)"

        logger.info(f"Alert fired: {msg}")

        # Persist to DB and get the new event id
        event_id: int | None = None
        try:
            async with AsyncSessionLocal() as session, session.begin():
                event = AlertEvent(
                    rule_id       = rule["id"],
                    symbol        = sym,
                    condition     = condition,
                    threshold     = threshold,
                    current_value = value,
                    message       = msg,
                    triggered_at  = now,
                    acknowledged  = False,
                )
                session.add(event)
                await session.flush()   # Assigns event.id before commit
                event_id = event.id

                # Update rule's last_triggered_at in DB
                await session.execute(
                    update(AlertRule)
                    .where(AlertRule.id == rule["id"])
                    .values(last_triggered_at=now)
                )

        except Exception as exc:
            logger.error(f"AlertService: DB write failed for rule {rule['id']}: {exc}")

        # Update in-memory cache so cooldown applies immediately
        self._rules[rule["id"]]["last_triggered_at"] = now

        # Broadcast to WebSocket clients
        if self._ws_broadcast and event_id is not None:
            ws_msg = AlertEventWsMessage(
                id            = event_id,
                rule_id       = rule["id"],
                symbol        = sym,
                condition     = condition,
                threshold     = threshold,
                current_value = value,
                message       = msg,
                triggered_at  = now.isoformat(),
            )
            try:
                await self._ws_broadcast(ws_msg.model_dump_json())
            except Exception as exc:
                logger.error(f"AlertService: WS broadcast failed: {exc}")


# ── Module-level singleton ────────────────────────────────────────────────────
# Created once in main.py lifespan; imported by the price simulator and routes.

_alert_service: AlertService | None = None


def get_alert_service() -> AlertService:
    global _alert_service
    if _alert_service is None:
        _alert_service = AlertService()
    return _alert_service

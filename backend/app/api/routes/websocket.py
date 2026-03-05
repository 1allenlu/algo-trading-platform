"""
WebSocket routes — Phase 7 + Phase 8.

Endpoints:
  WS /ws/prices            — tick stream for ALL tracked symbols
  WS /ws/prices/{symbol}   — tick stream for a single symbol
  WS /ws/alerts            — pushed alert events when rules fire (Phase 8)

The PriceConnectionManager singleton is injected from main.py via set_manager()
during application startup, before any client can connect.

Price message format (JSON):
  {
    "symbol":     "SPY",
    "price":      482.34,
    "open":       480.12,
    "high":       483.90,
    "low":        479.88,
    "prev_close": 481.00,
    "change":     1.34,
    "change_pct": 0.002785,
    "volume":     1250,
    "timestamp":  "2026-03-05T14:32:01.123456+00:00"
  }

Alert message format (JSON):
  {
    "type":          "alert",
    "id":            5,
    "rule_id":       2,
    "symbol":        "SPY",
    "condition":     "price_above",
    "threshold":     480.0,
    "current_value": 481.23,
    "message":       "SPY crossed above $480.00 (current: $481.23)",
    "triggered_at":  "2026-03-05T14:32:01.123456+00:00"
  }
"""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from app.services.price_broadcaster import PriceConnectionManager

router = APIRouter()

# ── Price manager (Phase 7) ───────────────────────────────────────────────────
# Module-level singleton — set by main.py at startup
_manager: PriceConnectionManager | None = None


def set_manager(manager: PriceConnectionManager) -> None:
    """Inject the shared PriceConnectionManager from main.py lifespan."""
    global _manager
    _manager = manager


def _get_manager() -> PriceConnectionManager:
    if _manager is None:
        raise RuntimeError("WebSocket manager not initialized")
    return _manager


# ── Alert connection manager (Phase 8) ───────────────────────────────────────

class AlertConnectionManager:
    """
    Simple fanout manager for the /ws/alerts endpoint.
    All connected clients receive every fired alert event.
    """

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.add(ws)
        logger.debug(f"WS /ws/alerts client connected total={len(self._connections)}")

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws)

    async def broadcast(self, payload: str) -> None:
        """Send alert JSON to all subscribed clients."""
        dead: set[WebSocket] = set()
        for ws in list(self._connections):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        self._connections -= dead

    @property
    def connection_count(self) -> int:
        return len(self._connections)


_alert_manager: AlertConnectionManager | None = None


def set_alert_manager(manager: AlertConnectionManager) -> None:
    """Inject the AlertConnectionManager from main.py lifespan."""
    global _alert_manager
    _alert_manager = manager


def _get_alert_manager() -> AlertConnectionManager:
    if _alert_manager is None:
        raise RuntimeError("Alert WebSocket manager not initialized")
    return _alert_manager


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.websocket("/prices")
async def ws_all_prices(websocket: WebSocket) -> None:
    """
    Stream ticks for ALL tracked symbols.
    Used by the TopBar ticker bar and Dashboard watchlist widget.
    Clients only receive (never send) — we just keep the connection open.
    """
    manager = _get_manager()
    await manager.connect_all(websocket)
    try:
        while True:
            # receive_text() blocks until client sends data or disconnects
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_all(websocket)
        logger.debug("WS /ws/prices client disconnected")
    except Exception as exc:
        logger.warning(f"WS /ws/prices error: {exc}")
        manager.disconnect_all(websocket)


@router.websocket("/prices/{symbol}")
async def ws_symbol_price(websocket: WebSocket, symbol: str) -> None:
    """
    Stream ticks for a SINGLE symbol.
    Reserved for per-asset detail views; currently not wired to any page
    but available for future use (e.g., a full-screen chart with live prices).
    """
    manager = _get_manager()
    sym = symbol.upper()
    await manager.connect_symbol(websocket, sym)
    logger.info(f"WS /ws/prices/{sym} client connected")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_symbol(websocket, sym)
        logger.debug(f"WS /ws/prices/{sym} client disconnected")
    except Exception as exc:
        logger.warning(f"WS /ws/prices/{sym} error: {exc}")
        manager.disconnect_symbol(websocket, sym)


@router.websocket("/alerts")
async def ws_alerts(websocket: WebSocket) -> None:
    """
    Push alert events to subscribed clients.
    Clients only receive — a message is sent whenever an AlertRule fires.
    Used by the TopBar bell icon and the /alerts page.
    """
    manager = _get_alert_manager()
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.debug("WS /ws/alerts client disconnected")
    except Exception as exc:
        logger.warning(f"WS /ws/alerts error: {exc}")
        manager.disconnect(websocket)

"""
WebSocket routes — Phase 7.

Endpoints:
  WS /ws/prices            — tick stream for ALL tracked symbols
  WS /ws/prices/{symbol}   — tick stream for a single symbol

The PriceConnectionManager singleton is injected from main.py via set_manager()
during application startup, before any client can connect.

Message format (JSON):
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
"""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger

from app.services.price_broadcaster import PriceConnectionManager

router = APIRouter()

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

"""
WebSocket Connection Manager — Phase 7.

Manages active WebSocket connections and fans price ticks out to subscribers.

Two subscription modes:
  - "all" connection: receives ticks for ALL tracked symbols (TopBar ticker, Dashboard watchlist)
  - "symbol" connection: receives ticks only for one symbol (future per-asset views)

Design note:
  This runs in a single asyncio event loop (single uvicorn worker in dev).
  All operations are cooperative — no locks needed. For multi-worker production,
  replace the in-process dicts with Redis pub/sub fan-out.
"""

from __future__ import annotations

import json
from dataclasses import asdict

from fastapi import WebSocket
from loguru import logger

from app.services.price_simulator import PriceTick


class PriceConnectionManager:
    """
    Routes PriceTick objects to connected WebSocket clients.

    _all_connections    — set of WebSockets wanting every symbol
    _symbol_connections — symbol → set of WebSockets for that symbol only
    """

    def __init__(self) -> None:
        self._all_connections: set[WebSocket] = set()
        self._symbol_connections: dict[str, set[WebSocket]] = {}

    # ── Connection lifecycle ──────────────────────────────────────────────────

    async def connect_all(self, ws: WebSocket) -> None:
        await ws.accept()
        self._all_connections.add(ws)
        logger.debug(f"WS connected (all-symbols) total={len(self._all_connections)}")

    async def connect_symbol(self, ws: WebSocket, symbol: str) -> None:
        await ws.accept()
        sym = symbol.upper()
        self._symbol_connections.setdefault(sym, set()).add(ws)
        logger.debug(f"WS connected ({sym}) total={len(self._symbol_connections[sym])}")

    def disconnect_all(self, ws: WebSocket) -> None:
        self._all_connections.discard(ws)

    def disconnect_symbol(self, ws: WebSocket, symbol: str) -> None:
        sym = symbol.upper()
        if sym in self._symbol_connections:
            self._symbol_connections[sym].discard(ws)

    # ── Broadcasting ─────────────────────────────────────────────────────────

    async def broadcast_tick(self, tick: PriceTick) -> None:
        """Send tick JSON to all-symbol subscribers + per-symbol subscribers."""
        payload = json.dumps(asdict(tick))

        targets = list(self._all_connections)
        if tick.symbol in self._symbol_connections:
            targets += list(self._symbol_connections[tick.symbol])

        # Deduplicate in case a socket is in both sets
        seen: set[int] = set()
        for ws in targets:
            ws_id = id(ws)
            if ws_id in seen:
                continue
            seen.add(ws_id)
            try:
                await ws.send_text(payload)
            except Exception:
                # Connection closed — remove silently
                self._all_connections.discard(ws)
                for s in self._symbol_connections.values():
                    s.discard(ws)

    @property
    def connection_count(self) -> int:
        return len(self._all_connections) + sum(
            len(v) for v in self._symbol_connections.values()
        )

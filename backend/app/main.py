"""
Trading Platform — FastAPI application entry point.

Startup sequence:
  1. Configure structured logging (loguru)
  2. Create database tables if they don't exist
  3. Start price feed: Alpaca WS (Phase 19) if keys set, else random-walk simulator
  4. Initialize alert service + alert WS manager (Phase 8)
  5. Start scheduler (Phase 21)
  6. Register API routers
  7. Configure CORS for frontend

Development: uvicorn app.main:app --reload
Production:  uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
"""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from loguru import logger

from app.api.routes import (
    alerts, analytics, auth, autotrade, backtest, health, live_orders,
    market_data, ml, news, notifications, options, optimize, paper_trading,
    risk, scanner, scheduler, signals, strategies,
)
from app.api.routes import websocket as ws_routes
from app.core.config import settings
from app.core.logging import setup_logging
from app.models.database import Base, engine
from app.services.alert_service import get_alert_service
from app.services.autotrade_service import start_autotrade_task, stop_autotrade_task
from app.services.price_broadcaster import PriceConnectionManager
from app.services.price_simulator import run_price_simulator
from app.services.scheduler_service import get_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan: code before yield runs at startup,
    code after yield runs at shutdown.
    """
    # ── Startup ───────────────────────────────────────────────────────────────
    setup_logging()
    logger.info(f"Starting {settings.APP_NAME} v0.30.0")
    logger.info(f"Database: {settings.DATABASE_URL.split('@')[-1]}")
    logger.info(f"Debug mode: {settings.DEBUG}")

    # Create ORM tables if missing (idempotent — safe to call on every startup).
    # In production, prefer `alembic upgrade head` for controlled migrations.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified/created")

    # ── Phase 7 / 19: Price feed ──────────────────────────────────────────────
    # PriceConnectionManager tracks all active WebSocket clients.
    # Phase 19: use Alpaca live stream when keys are configured, otherwise
    # fall back to the random-walk simulator (no user action required).
    price_manager = PriceConnectionManager()
    ws_routes.set_manager(price_manager)

    # ── Phase 8: Alert service setup ──────────────────────────────────────────
    alert_manager = ws_routes.AlertConnectionManager()
    ws_routes.set_alert_manager(alert_manager)

    alert_service = get_alert_service()
    alert_service.set_ws_broadcast(alert_manager.broadcast)
    await alert_service.refresh_rules()
    logger.info("Alert service initialized")

    # Phase 19: choose live Alpaca stream or simulator
    if settings.ALPACA_API_KEY and settings.ALPACA_SECRET_KEY:
        from app.services.alpaca_ws_service import start_alpaca_stream
        price_task = asyncio.create_task(
            start_alpaca_stream(price_manager, alert_service),
            name="alpaca_price_stream",
        )
        health.set_price_source("alpaca")
        logger.info("Alpaca WebSocket price stream started (live data)")
    else:
        price_task = asyncio.create_task(
            run_price_simulator(price_manager, alert_service),
            name="price_simulator",
        )
        health.set_price_source("simulator")
        logger.info("Price simulator background task started (no Alpaca keys)")

    # ── Phase 12: Auto-trade background task ──────────────────────────────────
    start_autotrade_task()
    logger.info("Auto-trade background task started")

    # ── Phase 21: Scheduler ───────────────────────────────────────────────────
    sched = get_scheduler()
    sched.start()
    logger.info("APScheduler started (daily OHLCV ingest + cleanup jobs)")

    yield  # Application runs here

    # ── Shutdown ──────────────────────────────────────────────────────────────
    await stop_autotrade_task()
    price_task.cancel()
    try:
        await price_task
    except asyncio.CancelledError:
        pass
    logger.info("Price feed stopped")

    sched.shutdown(wait=False)
    logger.info("Scheduler stopped")

    await engine.dispose()
    logger.info("Database connections closed — shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    description="Algorithmic Trading Platform — Quant + ML + Real-time",
    version="0.24.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API root redirect ─────────────────────────────────────────────────────────
@app.get("/api", include_in_schema=False)
@app.get("/api/", include_in_schema=False)
async def api_root() -> RedirectResponse:
    return RedirectResponse(url="/docs")

# ── REST routes ───────────────────────────────────────────────────────────────
app.include_router(health.router, prefix=settings.API_V1_PREFIX)
app.include_router(
    market_data.router,
    prefix=f"{settings.API_V1_PREFIX}/data",
    tags=["market-data"],
)
app.include_router(
    ml.router,
    prefix=f"{settings.API_V1_PREFIX}/ml",
    tags=["ml"],
)
app.include_router(
    strategies.router,
    prefix=f"{settings.API_V1_PREFIX}/strategies",
    tags=["strategies"],
)
app.include_router(
    backtest.router,
    prefix=f"{settings.API_V1_PREFIX}/backtest",
    tags=["backtest"],
)
app.include_router(
    risk.router,
    prefix=f"{settings.API_V1_PREFIX}/risk",
    tags=["risk"],
)
app.include_router(
    paper_trading.router,
    prefix=f"{settings.API_V1_PREFIX}/paper",
    tags=["paper-trading"],
)
app.include_router(
    alerts.router,
    prefix=f"{settings.API_V1_PREFIX}/alerts",
    tags=["alerts"],
)
app.include_router(
    analytics.router,
    prefix=f"{settings.API_V1_PREFIX}/analytics",
    tags=["analytics"],
)
app.include_router(
    optimize.router,
    prefix=f"{settings.API_V1_PREFIX}/optimize",
    tags=["optimize"],
)
app.include_router(
    scanner.router,
    prefix=f"{settings.API_V1_PREFIX}/scanner",
    tags=["scanner"],
)
app.include_router(
    autotrade.router,
    prefix=f"{settings.API_V1_PREFIX}/autotrade",
    tags=["autotrade"],
)
app.include_router(
    news.router,
    prefix=f"{settings.API_V1_PREFIX}/news",
    tags=["news"],
)
app.include_router(
    auth.router,
    prefix=f"{settings.API_V1_PREFIX}/auth",
    tags=["auth"],
)
app.include_router(
    notifications.router,
    prefix=f"{settings.API_V1_PREFIX}/notifications",
    tags=["notifications"],
)
app.include_router(
    scheduler.router,
    prefix=f"{settings.API_V1_PREFIX}/scheduler",
    tags=["scheduler"],
)
app.include_router(
    signals.router,
    prefix=f"{settings.API_V1_PREFIX}/signals",
    tags=["signals"],
)
app.include_router(
    live_orders.router,
    prefix=f"{settings.API_V1_PREFIX}/live",
    tags=["live-trading"],
)
app.include_router(
    options.router,
    prefix=f"{settings.API_V1_PREFIX}/options",
    tags=["options"],
)

# ── WebSocket routes (Phase 7 + 8) ───────────────────────────────────────────
# Registered at /ws (no API version prefix — WS URLs are stable contracts)
app.include_router(
    ws_routes.router,
    prefix="/ws",
    tags=["websocket"],
)

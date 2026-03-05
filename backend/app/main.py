"""
Trading Platform — FastAPI application entry point.

Startup sequence:
  1. Configure structured logging (loguru)
  2. Create database tables if they don't exist
     (TimescaleDB hypertable created by init.sql; ORM models mirror the schema)
  3. Start the WebSocket price simulator background task (Phase 7)
  4. Register API routers
  5. Configure CORS for frontend

Development: uvicorn app.main:app --reload
Production:  uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
"""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.api.routes import backtest, health, market_data, ml, paper_trading, risk, strategies
from app.api.routes import websocket as ws_routes
from app.core.config import settings
from app.core.logging import setup_logging
from app.models.database import Base, engine
from app.services.price_broadcaster import PriceConnectionManager
from app.services.price_simulator import run_price_simulator


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan: code before yield runs at startup,
    code after yield runs at shutdown.
    """
    # ── Startup ───────────────────────────────────────────────────────────────
    setup_logging()
    logger.info(f"Starting {settings.APP_NAME} v0.7.0")
    logger.info(f"Database: {settings.DATABASE_URL.split('@')[-1]}")
    logger.info(f"Debug mode: {settings.DEBUG}")

    # Create ORM tables if missing (idempotent — safe to call on every startup).
    # In production, prefer `alembic upgrade head` for controlled migrations.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified/created")

    # ── Phase 7: WebSocket price simulator ────────────────────────────────────
    # PriceConnectionManager tracks all active WebSocket clients.
    # run_price_simulator() emits ticks every ~1s for the full app lifetime.
    # asyncio.create_task is used (not BackgroundTasks) because the simulator
    # must outlive individual HTTP requests.
    manager = PriceConnectionManager()
    ws_routes.set_manager(manager)
    simulator_task = asyncio.create_task(
        run_price_simulator(manager),
        name="price_simulator",
    )
    logger.info("Price simulator background task started")

    yield  # Application runs here

    # ── Shutdown ──────────────────────────────────────────────────────────────
    simulator_task.cancel()
    try:
        await simulator_task
    except asyncio.CancelledError:
        pass
    logger.info("Price simulator stopped")

    await engine.dispose()
    logger.info("Database connections closed — shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    description="Algorithmic Trading Platform — Quant + ML + Real-time",
    version="0.7.0",
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

# ── WebSocket routes (Phase 7) ────────────────────────────────────────────────
# Registered at /ws (no API version prefix — WS URLs are stable contracts)
app.include_router(
    ws_routes.router,
    prefix="/ws",
    tags=["websocket"],
)

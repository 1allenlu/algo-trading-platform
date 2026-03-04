"""
Trading Platform — FastAPI application entry point.

Startup sequence:
  1. Configure structured logging (loguru)
  2. Create database tables if they don't exist
     (TimescaleDB hypertable created by init.sql; ORM models mirror the schema)
  3. Register API routers
  4. Configure CORS for frontend

Development: uvicorn app.main:app --reload
Production:  uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.api.routes import health, market_data
from app.core.config import settings
from app.core.logging import setup_logging
from app.models.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan: code before yield runs at startup,
    code after yield runs at shutdown.
    """
    # ── Startup ───────────────────────────────────────────────────────────────
    setup_logging()
    logger.info(f"Starting {settings.APP_NAME} v0.1.0")
    logger.info(f"Database: {settings.DATABASE_URL.split('@')[-1]}")  # Log host only (no creds)
    logger.info(f"Debug mode: {settings.DEBUG}")

    # Create ORM tables if missing (idempotent — safe to call on every startup).
    # In production, prefer `alembic upgrade head` for controlled migrations.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables verified/created")

    yield  # Application runs here

    # ── Shutdown ──────────────────────────────────────────────────────────────
    await engine.dispose()
    logger.info("Database connections closed — shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    description="Algorithmic Trading Platform — Quant + ML + Real-time",
    version="0.1.0",
    docs_url="/docs",        # Swagger UI
    redoc_url="/redoc",      # ReDoc
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow the Vite dev server (port 5173) and any CRA server (3000) to call our API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(health.router, prefix=settings.API_V1_PREFIX)
app.include_router(
    market_data.router,
    prefix=f"{settings.API_V1_PREFIX}/data",
    tags=["market-data"],
)

# Future routers (Phase 2+):
# app.include_router(ml.router,         prefix=f"{settings.API_V1_PREFIX}/ml",        tags=["ml"])
# app.include_router(backtest.router,   prefix=f"{settings.API_V1_PREFIX}/backtest",  tags=["backtest"])
# app.include_router(risk.router,       prefix=f"{settings.API_V1_PREFIX}/risk",      tags=["risk"])
# app.include_router(strategies.router, prefix=f"{settings.API_V1_PREFIX}/strategies",tags=["strategies"])

"""
Scheduler Service — Phase 21.

Runs two recurring jobs inside FastAPI's asyncio event loop using APScheduler:

  ingest_daily   — Cron job at 18:10 ET (market close + 40 min).
                   Fetches the latest 5 OHLCV bars for all tracked symbols
                   from yfinance and upserts them into market_data.
                   Mirrors the logic in `make ingest` but runs automatically.

  cleanup_events — Daily at 00:00 UTC.
                   Deletes alert_events rows older than 90 days to keep the
                   table lean.

Job status (last_run_at, last_status, last_error) is kept in memory so the
scheduler API endpoint can display it without a DB round-trip.

Usage (called from main.py lifespan):
    sched = get_scheduler()
    sched.start()
    ...
    sched.shutdown(wait=False)
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta
from typing import Any

from loguru import logger

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

# ── Job status registry ───────────────────────────────────────────────────────
# Keyed by job_id — updated after each run
_job_status: dict[str, dict[str, Any]] = {
    "ingest_daily":    {"last_run_at": None, "last_status": "pending", "last_error": None},
    "cleanup_events":  {"last_run_at": None, "last_status": "pending", "last_error": None},
}


def _record(job_id: str, status: str, error: str | None = None) -> None:
    _job_status[job_id] = {
        "last_run_at": datetime.now(timezone.utc).isoformat(),
        "last_status": status,
        "last_error":  error,
    }


# ── Jobs ─────────────────────────────────────────────────────────────────────

async def _ingest_daily() -> None:
    """
    Fetch the latest 5 OHLCV bars for each tracked symbol from yfinance
    and upsert into the market_data table (same logic as `make ingest`).
    """
    from app.core.config import settings
    symbols = settings.ALPACA_SYMBOLS

    logger.info(f"[scheduler] ingest_daily starting — {len(symbols)} symbols")
    try:
        import pandas as pd
        import yfinance as yf
        from sqlalchemy import insert
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        from app.models.database import AsyncSessionLocal, MarketData

        for sym in symbols:
            try:
                df = yf.download(sym, period="5d", interval="1d", progress=False, auto_adjust=True)
                if df.empty:
                    logger.warning(f"[scheduler] No data for {sym}")
                    continue

                df = df.reset_index()
                df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]

                async with AsyncSessionLocal() as session, session.begin():
                    for _, row in df.iterrows():
                        stmt = pg_insert(MarketData).values(
                            symbol    = sym.upper(),
                            timestamp = pd.Timestamp(row["Date"]).to_pydatetime(),
                            open      = float(row["Open"]),
                            high      = float(row["High"]),
                            low       = float(row["Low"]),
                            close     = float(row["Close"]),
                            volume    = int(row["Volume"]),
                        ).on_conflict_do_update(
                            index_elements=["symbol", "timestamp"],
                            set_=dict(open=float(row["Open"]), high=float(row["High"]),
                                      low=float(row["Low"]),   close=float(row["Close"]),
                                      volume=int(row["Volume"])),
                        )
                        await session.execute(stmt)

                logger.info(f"[scheduler] {sym}: ingested {len(df)} bars")
            except Exception as sym_err:
                logger.warning(f"[scheduler] {sym} ingest error: {sym_err}")

        _record("ingest_daily", "ok")
        logger.info("[scheduler] ingest_daily complete")
    except Exception as exc:
        _record("ingest_daily", "error", str(exc))
        logger.error(f"[scheduler] ingest_daily failed: {exc}")


async def _cleanup_events() -> None:
    """Delete alert_events rows older than 90 days."""
    try:
        from sqlalchemy import delete
        from app.models.database import AsyncSessionLocal, AlertEvent

        cutoff = datetime.now(timezone.utc) - timedelta(days=90)
        async with AsyncSessionLocal() as session, session.begin():
            result = await session.execute(
                delete(AlertEvent).where(AlertEvent.triggered_at < cutoff)
            )
        deleted = result.rowcount
        _record("cleanup_events", "ok")
        logger.info(f"[scheduler] cleanup_events: deleted {deleted} old events")
    except Exception as exc:
        _record("cleanup_events", "error", str(exc))
        logger.error(f"[scheduler] cleanup_events failed: {exc}")


# ── Singleton scheduler ───────────────────────────────────────────────────────

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    sched = AsyncIOScheduler(timezone="UTC")

    # Daily ingest at 18:10 ET = 23:10 UTC (handles EST; add 1h in EDT)
    sched.add_job(
        _ingest_daily,
        CronTrigger(hour=23, minute=10, timezone="UTC"),
        id="ingest_daily",
        name="Daily OHLCV Ingest",
        replace_existing=True,
        misfire_grace_time=600,
    )

    # Cleanup at midnight UTC
    sched.add_job(
        _cleanup_events,
        CronTrigger(hour=0, minute=0, timezone="UTC"),
        id="cleanup_events",
        name="Cleanup Old Alert Events",
        replace_existing=True,
        misfire_grace_time=600,
    )

    _scheduler = sched
    return _scheduler


def get_job_statuses() -> list[dict]:
    """Return job list with next_run_time from APScheduler + last status from memory."""
    sched = _scheduler
    rows = []
    for job_id, status in _job_status.items():
        next_run = None
        if sched and sched.running:
            job = sched.get_job(job_id)
            if job and job.next_run_time:
                next_run = job.next_run_time.isoformat()
        rows.append({
            "job_id":       job_id,
            "name":         job_id.replace("_", " ").title(),
            "next_run_time": next_run,
            **status,
        })
    return rows

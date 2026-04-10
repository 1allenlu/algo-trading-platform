"""Benchmark comparison routes — Phase 61."""

import asyncio
from fastapi import APIRouter, Query
from app.services.benchmark_service import get_benchmark_curves, KNOWN_BENCHMARKS

router = APIRouter()


@router.get("/")
async def list_benchmarks() -> list[dict]:
    """Available benchmark symbols with names and suggested chart colours."""
    return KNOWN_BENCHMARKS


@router.get("/curves")
async def benchmark_curves(
    symbols: str = Query(default="SPY,QQQ,IWM", description="Comma-separated symbols"),
    days:    int = Query(default=252, ge=30, le=1825),
) -> dict:
    """
    Normalised (base=100) price curves for the requested benchmarks.
    Returns {benchmarks: {symbol: [{date, value}]}, meta: [...]}
    """
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()][:6]
    return await asyncio.to_thread(get_benchmark_curves, sym_list, days)

"""
Anomaly Detection routes — Phase 73.

GET /api/anomaly/scan?symbols=SPY,AAPL,...&vol_multiplier=2.5&gap_pct=3&move_pct=5
    → list of symbols with unusual price/volume behaviour today
"""

import asyncio
from fastapi import APIRouter, Query

from app.services.anomaly_service import scan_anomalies

router = APIRouter()

DEFAULT_SYMBOLS = (
    "SPY,QQQ,AAPL,MSFT,NVDA,AMZN,TSLA,GOOGL,META,AMD,"
    "JPM,BAC,XOM,GLD,TLT,IWM,BTC-USD,ETH-USD"
)


@router.get("/scan")
async def anomaly_scan(
    symbols:        str   = Query(default=DEFAULT_SYMBOLS),
    vol_multiplier: float = Query(default=2.5, ge=1.5, le=10.0,  description="Volume spike threshold (× 20d avg)"),
    gap_pct:        float = Query(default=3.0, ge=0.5, le=20.0,  description="Gap open threshold (%)"),
    rsi_hi:         float = Query(default=80.0, ge=60.0, le=99.0, description="RSI overbought level"),
    rsi_lo:         float = Query(default=20.0, ge=1.0,  le=40.0, description="RSI oversold level"),
    move_pct:       float = Query(default=5.0, ge=1.0,  le=30.0, description="Large daily move threshold (%)"),
) -> list[dict]:
    """
    Scan watchlist for anomalies: volume spikes, gaps, RSI extremes, large moves.
    Returns only symbols with at least one triggered flag.
    """
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    return await asyncio.to_thread(
        scan_anomalies, sym_list, vol_multiplier, gap_pct, rsi_hi, rsi_lo, move_pct
    )

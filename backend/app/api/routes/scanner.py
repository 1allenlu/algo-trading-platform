"""
Market Scanner routes — Phase 11.

Technical screener: filter all symbols in the DB by indicator conditions.

Endpoints:
  GET  /api/scanner/symbols  → list of symbols with data in DB
  POST /api/scanner/scan     → run a scan with filter criteria → list[SymbolSnapshot]
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal
from app.services.scanner_service import ScanCriteria, get_symbols, run_scan

router = APIRouter()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ── Request schema ─────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    # RSI filters
    rsi_max:           float | None = Field(None, ge=0, le=100, description="RSI(14) ≤ value (e.g. 30 = oversold)")
    rsi_min:           float | None = Field(None, ge=0, le=100, description="RSI(14) ≥ value (e.g. 70 = overbought)")
    # Moving-average relationship
    price_above_sma50:  bool | None = Field(None, description="Close > SMA(50)")
    price_below_sma50:  bool | None = Field(None, description="Close < SMA(50)")
    price_above_sma200: bool | None = Field(None, description="Close > SMA(200)")
    price_below_sma200: bool | None = Field(None, description="Close < SMA(200)")
    # Volume
    volume_ratio_min:  float | None = Field(None, ge=0, description="Volume / avg_volume_20 ≥ value (1.5 = 50% above avg)")
    # Daily change
    change_pct_min:    float | None = Field(None, description="Daily % change ≥ value")
    change_pct_max:    float | None = Field(None, description="Daily % change ≤ value")
    # 52-week proximity
    near_52w_high_pct: float | None = Field(None, ge=0, description="Within N% of 52-week high")
    near_52w_low_pct:  float | None = Field(None, ge=0, description="Within N% of 52-week low")
    # Phase 80: MACD + Bollinger Band presets
    macd_bullish:  bool | None = Field(None, description="MACD histogram > 0 (bullish momentum)")
    macd_bearish:  bool | None = Field(None, description="MACD histogram < 0 (bearish momentum)")
    bb_oversold:   bool | None = Field(None, description="BB position < 0.2 (near lower band)")
    bb_overbought: bool | None = Field(None, description="BB position > 0.8 (near upper band)")
    # Scope + sorting
    symbols:  list[str] | None = Field(None, description="Symbols to scan; None = all in DB")
    sort_by:  str  = Field("symbol", description="Sort field: symbol|rsi|change_pct|volume_ratio|vs_sma50|vs_sma200|macd_hist|bb_position")
    sort_desc: bool = Field(False, description="Descending sort")

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "rsi_max": 35,
            "price_above_sma200": True,
            "volume_ratio_min": 1.2,
            "sort_by": "rsi",
            "sort_desc": False,
        }
    })


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/symbols")
async def list_symbols(db: AsyncSession = Depends(get_db)) -> list[str]:
    """Return all distinct symbols that have OHLCV data in the database."""
    return await get_symbols(db)


@router.post("/scan")
async def scan_symbols(
    body: ScanRequest,
    db:   AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    Screen symbols against technical criteria and return matching snapshots.

    All criteria are optional. An empty body returns snapshots for every symbol.
    Results are sorted by `sort_by` (default: alphabetical by symbol).
    """
    criteria = ScanCriteria(
        rsi_max           = body.rsi_max,
        rsi_min           = body.rsi_min,
        price_above_sma50  = body.price_above_sma50  or False,
        price_below_sma50  = body.price_below_sma50  or False,
        price_above_sma200 = body.price_above_sma200 or False,
        price_below_sma200 = body.price_below_sma200 or False,
        volume_ratio_min  = body.volume_ratio_min,
        change_pct_min    = body.change_pct_min,
        change_pct_max    = body.change_pct_max,
        near_52w_high_pct = body.near_52w_high_pct,
        near_52w_low_pct  = body.near_52w_low_pct,
        macd_bullish      = body.macd_bullish  or False,
        macd_bearish      = body.macd_bearish  or False,
        bb_oversold       = body.bb_oversold   or False,
        bb_overbought     = body.bb_overbought or False,
        symbols           = body.symbols,
        sort_by           = body.sort_by,
        sort_desc         = body.sort_desc,
    )
    return await run_scan(db, criteria)

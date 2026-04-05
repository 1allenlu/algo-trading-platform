"""
Analytics routes — Phase 9.

Portfolio performance analytics derived from paper trading history.

Endpoints:
  GET /api/analytics/summary         → top-level KPIs (return, Sharpe, drawdown, …)
  GET /api/analytics/pnl_attribution → P&L broken down by symbol
  GET /api/analytics/rolling         → rolling Sharpe + vol series for charting
  GET /api/analytics/export          → CSV download of all filled trades
"""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal
from app.services.analytics_service import (
    get_daily_pnl,
    get_pnl_attribution,
    get_rolling_metrics,
    get_summary,
    get_trades_csv,
)
from app.services.attribution_service import get_factor_attribution

router = APIRouter()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


@router.get("/summary")
async def analytics_summary(db: AsyncSession = Depends(get_db)) -> dict:
    """
    Top-level portfolio KPIs computed from paper trading equity history and filled orders.

    Returns: total_return, cagr, sharpe_ratio, sortino_ratio, max_drawdown,
             annual_vol, calmar_ratio, n_trades, win_rate, avg_win, avg_loss, profit_factor.
    """
    return await get_summary(db)


@router.get("/pnl_attribution")
async def analytics_pnl_attribution(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """
    Realized + unrealized P&L broken down by symbol.
    Useful for understanding which positions contributed or detracted most.
    """
    return await get_pnl_attribution(db)


@router.get("/rolling")
async def analytics_rolling(
    window: int = Query(default=20, ge=5, le=60, description="Rolling window in trading days"),
    db:     AsyncSession = Depends(get_db),
) -> list[dict]:
    """
    Rolling Sharpe ratio and annualized volatility over a sliding window.
    Default window = 20 trading days (~1 month).
    """
    return await get_rolling_metrics(db, window=window)


@router.get("/daily-pnl")
async def analytics_daily_pnl(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """
    Phase 45: Daily P&L series for the calendar heatmap.

    Returns one entry per day with date, equity, pnl_dollar, and pnl_pct.
    Used by the CalendarHeatmap in Analytics.tsx.
    """
    return await get_daily_pnl(db)


@router.get("/attribution")
async def analytics_attribution(db: AsyncSession = Depends(get_db)) -> dict:
    """
    Factor attribution — Phase 29.

    Returns beta / alpha vs SPY, rolling factor exposures, and
    Brinson-Hood-Beebower allocation + selection effects per symbol.
    """
    return await get_factor_attribution(db)


@router.get("/export")
async def analytics_export(db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    """Download all filled paper trades as a UTF-8 CSV file."""
    csv_text = await get_trades_csv(db)

    filename = f"trades_{__import__('datetime').date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

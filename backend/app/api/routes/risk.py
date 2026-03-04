"""
Risk Management API routes — Phase 4.

GET /api/risk/analysis  — portfolio risk metrics, VaR, correlation
GET /api/risk/frontier  — efficient frontier + random portfolios

Both endpoints fetch price data from the DB and call the quant_engine
risk/optimization functions directly (no subprocess — fast enough to run inline).
"""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.database import MarketData
from app.models.schemas import (
    AssetRiskMetrics,
    EfficientFrontierResponse,
    FrontierPoint,
    PortfolioRiskResponse,
)

router = APIRouter()

MIN_SYMBOLS = 2    # Minimum symbols required for meaningful analysis
MIN_DAYS    = 60   # Minimum trading days of history required


# ── Shared data loader ────────────────────────────────────────────────────────

async def _load_closes(
    symbols: list[str],
    session: AsyncSession,
) -> dict[str, pd.Series]:
    """
    Fetch closing prices from the DB for each symbol.
    Returns dict: symbol → pd.Series indexed by date.
    """
    closes: dict[str, pd.Series] = {}

    for sym in symbols:
        rows = await session.execute(
            select(MarketData.timestamp, MarketData.close)
            .where(MarketData.symbol == sym)
            .order_by(MarketData.timestamp.asc())
        )
        data = rows.fetchall()
        if not data:
            raise HTTPException(
                status_code=404,
                detail=f"No market data for {sym}. Run `make ingest` first.",
            )

        ts  = [row[0] for row in data]
        cls = [row[1] for row in data]
        closes[sym] = pd.Series(cls, index=pd.to_datetime(ts), name=sym)

    return closes


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/analysis", response_model=PortfolioRiskResponse)
async def get_portfolio_risk(
    symbols: str = Query(..., description="Comma-separated ticker symbols, e.g. SPY,QQQ,AAPL"),
    weights: str | None = Query(None, description="Comma-separated weights summing to 1, e.g. 0.4,0.3,0.3"),
    session: AsyncSession = Depends(get_db),
) -> PortfolioRiskResponse:
    """
    Compute portfolio risk metrics for the given symbols and weights.

    Returns per-asset metrics (return, vol, Sharpe, beta, drawdown, VaR)
    plus portfolio-level metrics and the full correlation matrix.
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

    if len(symbol_list) < MIN_SYMBOLS:
        raise HTTPException(400, f"Provide at least {MIN_SYMBOLS} symbols for portfolio analysis")

    # Parse weights
    weight_list: list[float] | None = None
    if weights:
        try:
            weight_list = [float(w) for w in weights.split(",") if w.strip()]
        except ValueError:
            raise HTTPException(400, "Weights must be comma-separated numbers, e.g. 0.4,0.3,0.3")
        if len(weight_list) != len(symbol_list):
            raise HTTPException(400, "Number of weights must match number of symbols")

    logger.info(f"Risk analysis: {symbol_list}, weights={weight_list}")

    closes = await _load_closes(symbol_list, session)

    # Check we have enough data
    min_len = min(len(s) for s in closes.values())
    if min_len < MIN_DAYS:
        raise HTTPException(
            400,
            f"Need at least {MIN_DAYS} trading days of data. Found only {min_len}.",
        )

    try:
        from quant_engine.risk import compute_risk_metrics
        result = compute_risk_metrics(closes, weights=weight_list)
    except Exception as exc:
        logger.exception(f"Risk computation failed: {exc}")
        raise HTTPException(500, f"Risk computation failed: {exc}")

    return PortfolioRiskResponse(
        symbols              = result["symbols"],
        weights              = result["weights"],
        assets               = [AssetRiskMetrics(**a) for a in result["assets"]],
        correlation          = result["correlation"],
        portfolio_return     = result["portfolio_return"],
        portfolio_vol        = result["portfolio_vol"],
        portfolio_sharpe     = result["portfolio_sharpe"],
        portfolio_max_drawdown = result["portfolio_max_drawdown"],
        portfolio_var_95     = result["portfolio_var_95"],
        portfolio_cvar_95    = result["portfolio_cvar_95"],
        n_days               = result["n_days"],
    )


@router.get("/frontier", response_model=EfficientFrontierResponse)
async def get_efficient_frontier(
    symbols:    str = Query(..., description="Comma-separated ticker symbols (2–10)"),
    n_random:   int = Query(800,  ge=100, le=2000, description="Random portfolios to generate"),
    n_frontier: int = Query(40,   ge=10,  le=100,  description="Frontier points to compute"),
    session:    AsyncSession = Depends(get_db),
) -> EfficientFrontierResponse:
    """
    Compute the Markowitz efficient frontier.

    Returns:
      - random: cloud of Monte Carlo portfolios (for visualization)
      - frontier: optimized efficient frontier curve
      - max_sharpe: tangency portfolio (highest Sharpe ratio)
      - min_vol: global minimum variance portfolio
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

    if len(symbol_list) < MIN_SYMBOLS:
        raise HTTPException(400, f"Provide at least {MIN_SYMBOLS} symbols for frontier analysis")
    if len(symbol_list) > 10:
        raise HTTPException(400, "Maximum 10 symbols supported for frontier analysis")

    logger.info(f"Efficient frontier: {symbol_list}")

    closes = await _load_closes(symbol_list, session)

    # Build aligned returns matrix
    price_df   = pd.DataFrame(closes).sort_index().ffill()
    returns_df = price_df.pct_change().dropna()

    if len(returns_df) < MIN_DAYS:
        raise HTTPException(400, f"Need at least {MIN_DAYS} trading days. Found {len(returns_df)}.")

    try:
        from quant_engine.optimization import compute_frontier
        result = compute_frontier(returns_df, n_random=n_random, n_frontier_points=n_frontier)
    except Exception as exc:
        logger.exception(f"Frontier computation failed: {exc}")
        raise HTTPException(500, f"Frontier computation failed: {exc}")

    def _to_fp(d: dict | None) -> FrontierPoint | None:
        if d is None:
            return None
        return FrontierPoint(
            return_ann = d["return_ann"],
            volatility = d["volatility"],
            sharpe     = d["sharpe"],
            weights    = d.get("weights"),
        )

    return EfficientFrontierResponse(
        symbols    = result["symbols"],
        random     = [FrontierPoint(**p) for p in result["random"]],
        frontier   = [FrontierPoint(**p) for p in result["frontier"]],
        max_sharpe = _to_fp(result["max_sharpe"]),
        min_vol    = _to_fp(result["min_vol"]),
    )

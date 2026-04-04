"""
Risk Management API routes — Phase 4.

GET /api/risk/analysis  — portfolio risk metrics, VaR, correlation
GET /api/risk/frontier  — efficient frontier + random portfolios

Both endpoints fetch price data from the DB and call the quant_engine
risk/optimization functions directly (no subprocess — fast enough to run inline).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.database import MarketData
from app.models.schemas import (
    AssetRiskMetrics,
    EfficientFrontierResponse,
    FrontierPoint,
    MonteCarloPathPoint,
    MonteCarloResponse,
    MonteCarloStats,
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


# ── Monte Carlo simulation (Phase 34) ────────────────────────────────────────

@router.get("/monte_carlo", response_model=MonteCarloResponse)
async def get_monte_carlo(
    symbols:      str = Query(..., description="Comma-separated tickers, e.g. SPY,QQQ"),
    weights:      str | None = Query(None, description="Comma-separated weights summing to 1"),
    n_sims:       int = Query(1000, ge=100, le=5000,  description="Number of simulation paths"),
    horizon_days: int = Query(252,  ge=21,  le=1260,  description="Projection horizon (trading days)"),
    session:      AsyncSession = Depends(get_db),
) -> MonteCarloResponse:
    """
    Run a GBM Monte Carlo portfolio simulation.

    Returns per-day percentile fan bands (p5/p25/p50/p75/p95) and summary
    stats (prob_profit, median_return, max drawdown distribution).
    Uses the closing prices already stored in the market_data table — no
    external API call required.
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]

    weight_list: list[float] | None = None
    if weights:
        try:
            weight_list = [float(w) for w in weights.split(",") if w.strip()]
        except ValueError:
            raise HTTPException(400, "Weights must be comma-separated numbers")
        if len(weight_list) != len(symbol_list):
            raise HTTPException(400, "Number of weights must match number of symbols")

    logger.info(f"Monte Carlo: {symbol_list} n_sims={n_sims} horizon={horizon_days}")

    closes = await _load_closes(symbol_list, session)

    try:
        from app.services.monte_carlo_service import run_monte_carlo
        result = run_monte_carlo(
            closes       = closes,
            weights      = weight_list,
            n_sims       = n_sims,
            horizon_days = horizon_days,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        logger.exception(f"Monte Carlo failed: {exc}")
        raise HTTPException(500, f"Monte Carlo simulation failed: {exc}")

    # Build equal-weight list for response if not provided
    n = len(symbol_list)
    out_weights = weight_list if weight_list else [round(1.0 / n, 6)] * n

    return MonteCarloResponse(
        symbols      = symbol_list,
        weights      = out_weights,
        n_sims       = n_sims,
        horizon_days = horizon_days,
        paths        = [MonteCarloPathPoint(**p) for p in result["paths"]],
        stats        = MonteCarloStats(**result["stats"]),
        initial_value = result["initial_value"],
    )


# ── Component VaR contribution (position-level risk attribution) ──────────────


class VarContributionItem(BaseModel):
    symbol:             str
    weight:             float
    individual_var_95:  float   # standalone 1-day 95% VaR (positive, as fraction)
    component_var_pct:  float   # % of total portfolio VaR this position contributes
    is_diversifier:     bool    # True if correlation with portfolio < 0 (reduces risk)


class VarContributionResponse(BaseModel):
    symbols:          list[str]
    weights:          list[float]
    portfolio_var_95: float          # portfolio 1-day 95% VaR (positive, as fraction)
    contributions:    list[VarContributionItem]


@router.get("/var-contribution", response_model=VarContributionResponse)
async def get_var_contribution(
    symbols:  str       = Query(..., description="Comma-separated tickers, e.g. SPY,QQQ,AAPL"),
    weights:  str | None = Query(None, description="Comma-separated weights summing to 1"),
    session:  AsyncSession = Depends(get_db),
) -> VarContributionResponse:
    """
    Decompose portfolio VaR into per-position contributions.

    Method — historical component VaR:
      VaR_portfolio = -percentile(r_p, 5)   (1-day 95% historical)
      VaR_i         = -percentile(r_i, 5)   (individual asset, positive)
      corr_i_p      = corr(r_i, r_portfolio)
      ComponentVaR_i = w_i × corr_i_p × VaR_i
      %contribution_i = ComponentVaR_i / sum(ComponentVaR)

    Positions with negative correlation to the portfolio are diversifiers —
    they reduce total risk below the sum of individual risks.
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if len(symbol_list) < 2:
        raise HTTPException(400, "Provide at least 2 symbols")

    weight_list: list[float] | None = None
    if weights:
        try:
            weight_list = [float(w) for w in weights.split(",") if w.strip()]
        except ValueError:
            raise HTTPException(400, "Weights must be comma-separated numbers")
        if len(weight_list) != len(symbol_list):
            raise HTTPException(400, "Number of weights must match number of symbols")

    closes = await _load_closes(symbol_list, session)

    n = len(symbol_list)
    w = np.array(weight_list if weight_list else [1.0 / n] * n)

    # Aligned returns matrix
    price_df   = pd.DataFrame(closes).sort_index().ffill()
    returns_df = price_df.pct_change().dropna()

    if len(returns_df) < MIN_DAYS:
        raise HTTPException(400, f"Need at least {MIN_DAYS} trading days of data.")

    # Portfolio daily returns
    port_returns = (returns_df * w).sum(axis=1)

    # 1-day 95% VaR (positive = loss)
    port_var_95 = float(-np.percentile(port_returns, 5))

    # Individual VaR and correlation with portfolio
    items: list[VarContributionItem] = []
    component_vars: list[float] = []

    for i, sym in enumerate(symbol_list):
        asset_rets   = returns_df[sym]
        ind_var_95   = float(-np.percentile(asset_rets, 5))
        corr_with_p  = float(asset_rets.corr(port_returns))

        component    = float(w[i]) * corr_with_p * ind_var_95
        component_vars.append(component)

    total_component = sum(component_vars)

    for i, sym in enumerate(symbol_list):
        asset_rets  = returns_df[sym]
        ind_var_95  = float(-np.percentile(asset_rets, 5))
        corr_with_p = float(asset_rets.corr(port_returns))
        pct = (component_vars[i] / total_component * 100) if total_component != 0 else 0.0

        items.append(VarContributionItem(
            symbol            = sym,
            weight            = round(float(w[i]), 4),
            individual_var_95 = round(ind_var_95, 4),
            component_var_pct = round(pct, 2),
            is_diversifier    = corr_with_p < 0,
        ))

    return VarContributionResponse(
        symbols          = symbol_list,
        weights          = w.tolist(),
        portfolio_var_95 = round(port_var_95, 4),
        contributions    = items,
    )

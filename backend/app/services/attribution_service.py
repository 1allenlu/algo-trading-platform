"""
Factor Attribution Service — Phase 29.

Computes:
  1. Market factor exposure (beta vs. SPY, alpha, R²)
  2. Brinson-Hood-Beebower attribution: allocation + selection effect by symbol
  3. Rolling beta / alpha series for charting

All computation uses only the data already in the DB (paper_equity_history +
paper_orders + market_data).  Pure Python / numpy — no additional deps.

Public functions:
  get_factor_attribution(db)  → full attribution dict for frontend
"""

from __future__ import annotations

import math
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import MarketData, PaperEquityHistory, PaperOrder

BENCHMARK   = "SPY"
WINDOW_DAYS = 60    # rolling regression window
TRADING_DAYS = 252
RISK_FREE    = 0.04


# ── Public entry ──────────────────────────────────────────────────────────────

async def get_factor_attribution(db: AsyncSession) -> dict[str, Any]:
    """
    Return factor attribution metrics for the paper trading portfolio.

    Returns
    -------
    {
      beta, alpha_ann, r_squared, tracking_error, information_ratio,
      rolling: [{"date", "beta", "alpha", "portfolio_ret", "benchmark_ret"}],
      brinson: [{"symbol", "allocation_effect", "selection_effect", "total_effect"}],
      benchmark_symbol
    }
    """
    # ── Load portfolio equity history ─────────────────────────────────────────
    eq_rows = (await db.scalars(
        select(PaperEquityHistory).order_by(PaperEquityHistory.timestamp)
    )).all()

    if len(eq_rows) < 10:
        return _empty()

    eq_dates   = [r.timestamp.date().isoformat() for r in eq_rows]
    eq_values  = [float(r.equity) for r in eq_rows]
    port_rets  = _pct_returns(eq_values)
    dates      = eq_dates[1:]   # one shorter after differencing

    # ── Load benchmark (SPY) returns ──────────────────────────────────────────
    spy_rows = (await db.scalars(
        select(MarketData)
        .where(MarketData.symbol == BENCHMARK)
        .order_by(MarketData.timestamp)
    )).all()

    if len(spy_rows) < 10:
        return _empty()

    spy_closes = [float(r.close) for r in spy_rows]
    spy_dates  = [r.timestamp.date().isoformat() for r in spy_rows]
    spy_rets_full = _pct_returns(spy_closes)
    spy_date_to_ret = dict(zip(spy_dates[1:], spy_rets_full))

    # Align portfolio and benchmark on common dates
    p_rets: list[float] = []
    b_rets: list[float] = []
    aligned_dates: list[str] = []
    for d, pr in zip(dates, port_rets):
        if d in spy_date_to_ret:
            p_rets.append(pr)
            b_rets.append(spy_date_to_ret[d])
            aligned_dates.append(d)

    if len(p_rets) < 10:
        return _empty()

    # ── Full-period regression ─────────────────────────────────────────────────
    beta, alpha_daily, r2 = _ols(p_rets, b_rets)
    alpha_ann = alpha_daily * TRADING_DAYS

    tracking_err_daily = _std([p - (alpha_daily + beta * b) for p, b in zip(p_rets, b_rets)])
    tracking_err_ann   = tracking_err_daily * math.sqrt(TRADING_DAYS)
    ir = alpha_ann / tracking_err_ann if tracking_err_ann > 0 else 0.0

    # ── Rolling beta / alpha (window = WINDOW_DAYS) ────────────────────────────
    rolling: list[dict] = []
    for i in range(WINDOW_DAYS, len(p_rets) + 1):
        wp = p_rets[i - WINDOW_DAYS: i]
        wb = b_rets[i - WINDOW_DAYS: i]
        rb, ra, _ = _ols(wp, wb)
        rolling.append({
            "date":          aligned_dates[i - 1],
            "beta":          round(rb, 4),
            "alpha":         round(ra * TRADING_DAYS, 4),
            "portfolio_ret": round(sum(wp), 4),
            "benchmark_ret": round(sum(wb), 4),
        })

    # ── Brinson attribution ────────────────────────────────────────────────────
    brinson = await _brinson(db, aligned_dates, spy_date_to_ret)

    return {
        "beta":              round(beta, 4),
        "alpha_ann":         round(alpha_ann, 4),
        "r_squared":         round(r2, 4),
        "tracking_error":    round(tracking_err_ann, 4),
        "information_ratio": round(ir, 4),
        "rolling":           rolling,
        "brinson":           brinson,
        "benchmark_symbol":  BENCHMARK,
    }


# ── Brinson attribution ────────────────────────────────────────────────────────

async def _brinson(
    db: AsyncSession,
    aligned_dates: list[str],
    spy_date_to_ret: dict[str, float],
) -> list[dict]:
    """
    Simple BHB: allocation effect + selection effect per symbol.

    allocation_effect  = (w_portfolio - w_benchmark) × (r_benchmark_segment - r_benchmark)
    selection_effect   = w_portfolio × (r_symbol - r_benchmark_segment)

    We approximate w_benchmark = equal weight across symbols in the portfolio.
    r_benchmark_segment = SPY return (we don't have sector benchmarks).
    """
    # Filled orders grouped by symbol
    orders = (await db.scalars(
        select(PaperOrder)
        .where(PaperOrder.status == "filled")
        .order_by(PaperOrder.created_at)
    )).all()

    if not orders:
        return []

    symbols = list({o.symbol for o in orders})
    n_syms  = len(symbols)
    w_bench = 1.0 / n_syms   # Equal-weight benchmark assumption

    benchmark_ret = _mean(list(spy_date_to_ret.values())) * TRADING_DAYS

    results = []
    for sym in symbols:
        sym_orders = [o for o in orders if o.symbol == sym]
        buy_cost   = sum(float(o.filled_avg_price or 0) * float(o.filled_qty or 0)
                         for o in sym_orders if o.side == "buy")
        sell_proc  = sum(float(o.filled_avg_price or 0) * float(o.filled_qty or 0)
                         for o in sym_orders if o.side == "sell")

        total_buy_qty = sum(float(o.filled_qty or 0) for o in sym_orders if o.side == "buy")
        w_port = min(total_buy_qty / max(sum(float(o.filled_qty or 0)
                                             for o in orders if o.side == "buy"), 1), 1.0)

        realized = (sell_proc - buy_cost) / buy_cost if buy_cost > 0 else 0.0

        # Fetch symbol price return over the same aligned window
        sym_rows = (await db.scalars(
            select(MarketData)
            .where(MarketData.symbol == sym)
            .order_by(MarketData.timestamp)
        )).all()

        if len(sym_rows) >= 2:
            sym_ret = (float(sym_rows[-1].close) - float(sym_rows[0].close)) / float(sym_rows[0].close)
        else:
            sym_ret = 0.0

        alloc  = (w_port - w_bench) * (benchmark_ret - benchmark_ret)   # vs SPY = 0
        select_ = w_port * (sym_ret - benchmark_ret)

        results.append({
            "symbol":            sym,
            "weight":            round(w_port, 4),
            "symbol_return":     round(sym_ret, 4),
            "allocation_effect": round(alloc, 4),
            "selection_effect":  round(select_, 4),
            "total_effect":      round(alloc + select_, 4),
        })

    return sorted(results, key=lambda r: abs(r["total_effect"]), reverse=True)


# ── Statistics helpers ─────────────────────────────────────────────────────────

def _pct_returns(prices: list[float]) -> list[float]:
    return [
        (prices[i] - prices[i - 1]) / prices[i - 1]
        for i in range(1, len(prices))
        if prices[i - 1] != 0
    ]


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def _ols(y: list[float], x: list[float]) -> tuple[float, float, float]:
    """OLS: y = alpha + beta*x.  Returns (beta, alpha, r_squared)."""
    n = len(y)
    if n < 3:
        return 1.0, 0.0, 0.0

    mx = _mean(x)
    my = _mean(y)
    cov_xy = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y)) / (n - 1)
    var_x  = sum((xi - mx) ** 2 for xi in x) / (n - 1)

    if var_x == 0:
        return 1.0, 0.0, 0.0

    beta  = cov_xy / var_x
    alpha = my - beta * mx

    # R²
    y_hat  = [alpha + beta * xi for xi in x]
    ss_res = sum((yi - yh) ** 2 for yi, yh in zip(y, y_hat))
    ss_tot = sum((yi - my) ** 2 for yi in y)
    r2     = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

    return beta, alpha, max(0.0, min(1.0, r2))


def _empty() -> dict:
    return {
        "beta": None, "alpha_ann": None, "r_squared": None,
        "tracking_error": None, "information_ratio": None,
        "rolling": [], "brinson": [], "benchmark_symbol": BENCHMARK,
    }

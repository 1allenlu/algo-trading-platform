"""
Analytics Service — Phase 9.

Computes portfolio performance metrics from the paper trading tables:
  - paper_equity_history  (daily equity snapshots)
  - paper_orders          (filled order history)
  - paper_positions       (current open positions)

All computation is pure Python / basic statistics — no scipy/numpy required —
since the dataset is small (at most a few hundred daily rows).

Public functions:
  get_summary()           → AnalyticsSummary
  get_pnl_attribution()   → list[SymbolPnL]
  get_trade_stats()       → TradeStats
  get_rolling_metrics()   → list[RollingPoint]
  get_trades_csv()        → str (CSV text)
"""

from __future__ import annotations

import csv
import io
import math
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import (
    MarketData,
    PaperEquityHistory,
    PaperOrder,
    PaperPosition,
)

STARTING_CASH = 100_000.0
TRADING_DAYS  = 252   # Annualisation constant
RISK_FREE     = 0.04  # Annual risk-free rate


# ── Pure-Python statistics helpers ────────────────────────────────────────────

def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def _max_drawdown(equity: list[float]) -> float:
    """Maximum peak-to-trough drawdown (as a positive fraction, e.g. 0.15 = -15%)."""
    if not equity:
        return 0.0
    peak = equity[0]
    max_dd = 0.0
    for v in equity:
        if v > peak:
            peak = v
        dd = (peak - v) / peak if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd
    return max_dd


def _cagr(initial: float, final: float, n_days: int) -> float:
    if initial <= 0 or n_days <= 0:
        return 0.0
    return (final / initial) ** (TRADING_DAYS / n_days) - 1


def _sharpe(daily_returns: list[float]) -> float:
    if len(daily_returns) < 2:
        return 0.0
    rf_daily = RISK_FREE / TRADING_DAYS
    excess   = [r - rf_daily for r in daily_returns]
    s = _std(excess)
    return (_mean(excess) / s * math.sqrt(TRADING_DAYS)) if s > 0 else 0.0


def _sortino(daily_returns: list[float]) -> float:
    if len(daily_returns) < 2:
        return 0.0
    rf_daily  = RISK_FREE / TRADING_DAYS
    excess    = [r - rf_daily for r in daily_returns]
    negatives = [r for r in daily_returns if r < 0]
    downside  = _std(negatives) if len(negatives) > 1 else 0.0
    return (_mean(excess) / downside * math.sqrt(TRADING_DAYS)) if downside > 0 else 0.0


# ── DB helpers ─────────────────────────────────────────────────────────────────

async def _fetch_equity_history(session: AsyncSession) -> list[float]:
    rows = (await session.scalars(
        select(PaperEquityHistory).order_by(PaperEquityHistory.recorded_at.asc())
    )).all()
    return [float(r.equity) for r in rows]


async def _fetch_filled_orders(session: AsyncSession) -> list[Any]:
    return (await session.scalars(
        select(PaperOrder)
        .where(PaperOrder.status == "filled")
        .order_by(PaperOrder.updated_at.asc())
    )).all()


async def _fetch_positions(session: AsyncSession) -> list[Any]:
    return (await session.scalars(select(PaperPosition))).all()


async def _get_price(symbol: str, session: AsyncSession) -> float | None:
    return await session.scalar(
        select(MarketData.close)
        .where(MarketData.symbol == symbol.upper())
        .order_by(MarketData.timestamp.desc())
        .limit(1)
    )


# ── Analytics functions ────────────────────────────────────────────────────────

async def get_summary(session: AsyncSession) -> dict:
    """
    Compute top-level portfolio performance metrics from equity history.
    Returns a flat dict suitable for JSON serialization.
    """
    equity_curve = await _fetch_equity_history(session)
    positions    = await _fetch_positions(session)
    filled_orders = await _fetch_filled_orders(session)

    # Live equity (cash + positions at market price)
    position_value = 0.0
    for pos in positions:
        px = await _get_price(pos.symbol, session)
        if px:
            position_value += pos.qty * float(px)

    # Rough current equity (may differ from last snapshot if DB price changed)
    # Use the snapshot series for metrics, live equity for current display
    n_points = len(equity_curve)
    final_eq = equity_curve[-1] if equity_curve else STARTING_CASH
    n_days   = n_points  # One snapshot per trading day

    # Daily returns from equity curve
    daily_returns: list[float] = []
    for i in range(1, n_points):
        prev = equity_curve[i - 1]
        if prev > 0:
            daily_returns.append((equity_curve[i] - prev) / prev)

    total_return  = (final_eq - STARTING_CASH) / STARTING_CASH
    cagr          = _cagr(STARTING_CASH, final_eq, n_days)
    sharpe        = _sharpe(daily_returns)
    sortino       = _sortino(daily_returns)
    max_dd        = _max_drawdown(equity_curve)
    annual_vol    = _std(daily_returns) * math.sqrt(TRADING_DAYS) if daily_returns else 0.0
    calmar        = abs(total_return / max_dd) if max_dd > 0 else 0.0

    # Trade-level metrics
    wins          = 0
    total_win_pnl = 0.0
    total_los_pnl = 0.0
    # Approximate per-trade P&L: match consecutive buy→sell for same symbol
    # Simple approach: per-symbol, FIFO-implied net P&L
    buys: dict[str, list[tuple[float, float]]] = {}  # symbol → [(qty, price)]
    trade_pnls: list[float] = []

    for o in filled_orders:
        sym = o.symbol
        qty = float(o.qty)
        px  = float(o.filled_avg_price or 0)
        if o.side == "buy":
            buys.setdefault(sym, []).append((qty, px))
        else:
            remaining = qty
            while remaining > 1e-9 and buys.get(sym):
                bqty, bpx = buys[sym][0]
                matched = min(remaining, bqty)
                pnl = matched * (px - bpx)
                trade_pnls.append(pnl)
                remaining -= matched
                if bqty - matched < 1e-9:
                    buys[sym].pop(0)
                else:
                    buys[sym][0] = (bqty - matched, bpx)

    n_trades      = len(trade_pnls)
    wins          = sum(1 for p in trade_pnls if p > 0)
    losses        = sum(1 for p in trade_pnls if p < 0)
    win_rate      = wins / n_trades if n_trades > 0 else 0.0
    avg_win       = _mean([p for p in trade_pnls if p > 0])
    avg_loss      = _mean([p for p in trade_pnls if p < 0])
    profit_factor = (
        abs(sum(p for p in trade_pnls if p > 0) /
            sum(p for p in trade_pnls if p < 0))
        if losses > 0 and any(p < 0 for p in trade_pnls) else 0.0
    )

    return {
        "equity":         final_eq,
        "starting_cash":  STARTING_CASH,
        "total_return":   total_return,
        "cagr":           cagr,
        "sharpe_ratio":   sharpe,
        "sortino_ratio":  sortino,
        "max_drawdown":   max_dd,
        "annual_vol":     annual_vol,
        "calmar_ratio":   calmar,
        "n_days":         n_days,
        # Trade stats
        "n_trades":       n_trades,
        "win_rate":       win_rate,
        "avg_win":        avg_win,
        "avg_loss":       avg_loss,
        "profit_factor":  profit_factor,
    }


async def get_pnl_attribution(session: AsyncSession) -> list[dict]:
    """
    Realized P&L per symbol from filled orders.
    Returns list of {symbol, buy_cost, sell_proceeds, realized_pnl, n_buys, n_sells}.
    """
    orders = await _fetch_filled_orders(session)
    positions = await _fetch_positions(session)

    # Aggregate buy cost and sell proceeds per symbol
    stats: dict[str, dict] = {}
    for o in orders:
        sym = o.symbol
        if sym not in stats:
            stats[sym] = {"buy_cost": 0.0, "sell_proceeds": 0.0, "n_buys": 0, "n_sells": 0}
        amt = float(o.qty) * float(o.filled_avg_price or 0)
        if o.side == "buy":
            stats[sym]["buy_cost"]  += amt
            stats[sym]["n_buys"]    += 1
        else:
            stats[sym]["sell_proceeds"] += amt
            stats[sym]["n_sells"]       += 1

    # Add unrealized P&L from open positions
    pos_map = {p.symbol: p for p in positions}
    for sym, pos in pos_map.items():
        if sym not in stats:
            stats[sym] = {"buy_cost": 0.0, "sell_proceeds": 0.0, "n_buys": 0, "n_sells": 0}
        px = await _get_price(sym, session)
        if px:
            stats[sym]["unrealized_pnl"] = float(pos.qty) * (float(px) - float(pos.avg_entry_price))
        else:
            stats[sym]["unrealized_pnl"] = 0.0

    result = []
    for sym, s in stats.items():
        realized = s["sell_proceeds"] - s["buy_cost"]
        unrealized = s.get("unrealized_pnl", 0.0)
        result.append({
            "symbol":         sym,
            "buy_cost":       s["buy_cost"],
            "sell_proceeds":  s["sell_proceeds"],
            "realized_pnl":   realized,
            "unrealized_pnl": unrealized,
            "total_pnl":      realized + unrealized,
            "n_buys":         s["n_buys"],
            "n_sells":        s["n_sells"],
        })

    # Sort by absolute total P&L descending
    result.sort(key=lambda x: abs(x["total_pnl"]), reverse=True)
    return result


async def get_rolling_metrics(session: AsyncSession, window: int = 20) -> list[dict]:
    """
    Rolling Sharpe and annualized volatility, computed over a sliding window.
    Returns a list of {date, equity, rolling_sharpe, rolling_vol}.
    """
    rows = (await session.scalars(
        select(PaperEquityHistory).order_by(PaperEquityHistory.recorded_at.asc())
    )).all()

    if not rows:
        return []

    equities = [float(r.equity) for r in rows]
    dates    = [r.recorded_at.isoformat() for r in rows]

    # Compute daily returns
    returns = [0.0]  # No return for first day
    for i in range(1, len(equities)):
        prev = equities[i - 1]
        returns.append((equities[i] - prev) / prev if prev > 0 else 0.0)

    result = []
    for i, (d, eq) in enumerate(zip(dates, equities)):
        window_returns = returns[max(0, i - window + 1): i + 1]
        roll_sharpe = _sharpe(window_returns)
        roll_vol    = _std(window_returns) * math.sqrt(TRADING_DAYS)
        result.append({
            "date":          d,
            "equity":        eq,
            "rolling_sharpe": roll_sharpe,
            "rolling_vol":   roll_vol,
        })

    return result


async def get_trades_csv(session: AsyncSession) -> str:
    """Return all filled orders as a CSV string for download."""
    orders = await _fetch_filled_orders(session)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "symbol", "side", "order_type", "qty",
                     "filled_avg_price", "limit_price", "status", "created_at", "updated_at"])
    for o in orders:
        writer.writerow([
            o.id, o.symbol, o.side, o.order_type, o.qty,
            o.filled_avg_price, o.limit_price, o.status,
            o.created_at.isoformat() if o.created_at else "",
            o.updated_at.isoformat() if o.updated_at else "",
        ])

    return buf.getvalue()

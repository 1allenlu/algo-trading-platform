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


async def get_daily_pnl(session: AsyncSession) -> list[dict]:
    """
    Phase 45: Return daily P&L for the calendar heatmap.

    Each entry has:
      date        — ISO 8601 calendar date (YYYY-MM-DD)
      equity      — equity snapshot for that day
      pnl_pct     — daily return as fraction (e.g. 0.015 = +1.5%)
      pnl_dollar  — dollar P&L vs prior day
    """
    rows = (await session.scalars(
        select(PaperEquityHistory).order_by(PaperEquityHistory.recorded_at.asc())
    )).all()

    result = []
    for i, row in enumerate(rows):
        prev_equity = rows[i - 1].equity if i > 0 else row.equity
        pnl_dollar  = row.equity - prev_equity
        pnl_pct     = pnl_dollar / prev_equity if prev_equity > 0 and i > 0 else 0.0
        result.append({
            "date":       row.recorded_at.isoformat(),
            "equity":     row.equity,
            "pnl_dollar": pnl_dollar,
            "pnl_pct":    pnl_pct,
        })
    return result


async def get_drawdown_analysis(session: AsyncSession) -> dict:
    """
    Phase 51: Drawdown recovery tracker.

    Computes the underwater equity curve (equity / peak - 1 for each day),
    current drawdown magnitude and duration, and a recovery projection.

    Recovery projection: based on the average positive daily return over
    the full history. If average return ≤ 0, projection is None.
    """
    rows = (await session.scalars(
        select(PaperEquityHistory).order_by(PaperEquityHistory.recorded_at.asc())
    )).all()

    if not rows:
        return {
            "underwater":         [],
            "current_drawdown":   0.0,
            "current_dd_pct":     0.0,
            "drawdown_duration":  0,
            "peak_equity":        STARTING_CASH,
            "peak_date":          None,
            "recovery_days_est":  None,
        }

    equities = [float(r.equity)          for r in rows]
    dates    = [r.recorded_at.isoformat() for r in rows]

    # Build underwater curve
    peak    = equities[0]
    peak_idx = 0
    underwater = []
    for i, (eq, d) in enumerate(zip(equities, dates)):
        if eq > peak:
            peak     = eq
            peak_idx = i
        dd_pct = (peak - eq) / peak if peak > 0 else 0.0
        underwater.append({"date": d, "equity": eq, "dd_pct": round(-dd_pct, 6)})

    current_eq   = equities[-1]
    current_peak = max(equities)
    peak_date    = dates[equities.index(current_peak)]
    current_dd   = current_peak - current_eq
    current_dd_pct = current_dd / current_peak if current_peak > 0 else 0.0

    # Duration: how many days since the peak
    peak_pos      = equities.index(current_peak)
    dd_duration   = len(equities) - 1 - peak_pos

    # Average positive daily return for recovery projection
    daily_returns = []
    for i in range(1, len(equities)):
        prev = equities[i - 1]
        if prev > 0:
            daily_returns.append((equities[i] - prev) / prev)

    pos_returns   = [r for r in daily_returns if r > 0]
    avg_pos_return = _mean(pos_returns) if pos_returns else 0.0

    # Days to recover: solve current_eq * (1 + r)^n = current_peak
    recovery_days: int | None = None
    if avg_pos_return > 0 and current_dd > 0:
        import math as _math
        n = _math.log(current_peak / current_eq) / _math.log(1 + avg_pos_return)
        recovery_days = max(1, int(_math.ceil(n)))

    return {
        "underwater":        underwater,
        "current_drawdown":  round(current_dd, 2),
        "current_dd_pct":    round(current_dd_pct, 6),
        "drawdown_duration": dd_duration,
        "peak_equity":       round(current_peak, 2),
        "peak_date":         peak_date,
        "recovery_days_est": recovery_days,
    }


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


async def get_performance_scorecard(session: AsyncSession) -> dict:
    """
    Phase 58 — Multi-period performance scorecard.

    Computes portfolio return vs SPY benchmark at:
      1W, 1M, 3M, 6M, YTD, 1Y, ALL

    Each period returns: portfolio_ret, spy_ret, alpha, and a
    trend direction compared to the previous period.
    """
    rows = (await session.scalars(
        select(PaperEquityHistory).order_by(PaperEquityHistory.recorded_at)
    )).all()

    if not rows:
        return {"periods": [], "current_equity": STARTING_CASH, "total_return_pct": 0.0}

    equities = [(r.recorded_at, float(r.equity)) for r in rows]
    latest_ts, latest_eq = equities[-1]

    # SPY reference data from MarketData table
    spy_rows = (await session.scalars(
        select(MarketData)
        .where(MarketData.symbol == "SPY")
        .order_by(MarketData.timestamp)
    )).all()

    spy_prices: dict[str, float] = {}
    for s in spy_rows:
        spy_prices[s.timestamp.strftime("%Y-%m-%d")] = s.close

    def _ret(start_ts, start_eq):
        if start_eq and start_eq > 0:
            return round((latest_eq - start_eq) / start_eq * 100, 2)
        return None

    def _spy_ret(start_ts):
        start_date = start_ts.strftime("%Y-%m-%d")
        end_date   = latest_ts.strftime("%Y-%m-%d")
        # Find closest available SPY price at or after start_date
        start_price = end_price = None
        for d in sorted(spy_prices):
            if d >= start_date and start_price is None:
                start_price = spy_prices[d]
            if d >= end_date and end_price is None:
                end_price = spy_prices[d]
        if not end_price:
            end_price = spy_prices[max(spy_prices)] if spy_prices else None
        if start_price and end_price and start_price > 0:
            return round((end_price - start_price) / start_price * 100, 2)
        return None

    from datetime import timedelta

    def _find_eq_at(cutoff_ts):
        """Return (timestamp, equity) of the equity snapshot closest to cutoff."""
        best = None
        for ts, eq in equities:
            if ts <= cutoff_ts:
                best = (ts, eq)
            else:
                break
        return best

    now = latest_ts

    import math as _math
    ytd_start = latest_ts.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    periods_def = [
        ("1W",  now - timedelta(days=7)),
        ("1M",  now - timedelta(days=30)),
        ("3M",  now - timedelta(days=91)),
        ("6M",  now - timedelta(days=182)),
        ("YTD", ytd_start),
        ("1Y",  now - timedelta(days=365)),
        ("ALL", equities[0][0] if equities else now),
    ]

    periods = []
    for label, start_ts in periods_def:
        found = _find_eq_at(start_ts)
        if not found:
            continue
        ts_start, eq_start = found
        port_ret = _ret(ts_start, eq_start)
        spy_ret  = _spy_ret(ts_start)
        alpha    = round(port_ret - spy_ret, 2) if (port_ret is not None and spy_ret is not None) else None
        periods.append({
            "period":        label,
            "portfolio_ret": port_ret,
            "spy_ret":       spy_ret,
            "alpha":         alpha,
            "outperforms":   (alpha is not None and alpha > 0),
        })

    total_ret = _ret(equities[0][0], equities[0][1]) if equities else 0.0

    return {
        "periods":          periods,
        "current_equity":   round(latest_eq, 2),
        "total_return_pct": total_ret,
    }


async def get_sector_exposure(session: AsyncSession) -> list[dict]:
    """
    Phase 64 — Map open paper positions to GICS sectors via yfinance.
    Returns list of {symbol, qty, sector, weight_pct} sorted by weight desc.
    """
    positions = (await session.scalars(select(PaperPosition))).all()
    open_pos = [p for p in positions if p.qty > 0]
    if not open_pos:
        return []

    import yfinance as yf

    rows = []
    total_value = 0.0
    for p in open_pos:
        try:
            t = yf.Ticker(p.symbol)
            info = t.info or {}
            sector = info.get("sector") or "Unknown"
            price  = info.get("currentPrice") or info.get("regularMarketPrice") or p.avg_price
            value  = float(p.qty) * float(price)
        except Exception:
            sector = "Unknown"
            value  = float(p.qty) * float(p.avg_price)
        rows.append({"symbol": p.symbol, "qty": p.qty, "sector": sector, "value": round(value, 2)})
        total_value += value

    for r in rows:
        r["weight_pct"] = round(r["value"] / total_value * 100, 2) if total_value > 0 else 0.0

    rows.sort(key=lambda x: -x["weight_pct"])
    return rows

"""
Tax Lot Accounting Service — Phase 47.

Computes realized capital gains from paper trading fills using FIFO or LIFO.
Also detects potential wash sale violations (sell at loss + repurchase within ±30 days).

Recomputes from paper_orders on each call — no separate DB table needed.

Short-term: held < 365 days  → taxed as ordinary income
Long-term:  held ≥ 365 days  → lower capital-gains rates
Wash sale:  sold at a loss and re-bought within 30 days before or after
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import PaperOrder


async def _get_filled_orders(session: AsyncSession) -> list[Any]:
    return (await session.scalars(
        select(PaperOrder)
        .where(PaperOrder.status == "filled")
        .order_by(PaperOrder.updated_at.asc())
    )).all()


def _to_dt(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val.replace(tzinfo=timezone.utc) if val.tzinfo is None else val
    return datetime.now(timezone.utc)


def _fmt_dt(val: Any) -> str:
    dt = _to_dt(val)
    return dt.isoformat()


def _is_long_term(acquired: datetime, disposed: datetime) -> bool:
    return (disposed - acquired).days >= 365


def _compute_lots(orders: list[Any], method: str) -> dict:
    open_lots: dict[str, list[dict]] = {}
    realized: list[dict] = []

    # Track all buy dates per symbol for wash-sale detection
    buy_events: dict[str, list[datetime]] = {}

    for order in orders:
        sym  = order.symbol
        qty  = float(order.qty)
        px   = float(order.filled_avg_price or 0)
        when = _to_dt(order.updated_at or order.created_at)

        if order.side == "buy":
            open_lots.setdefault(sym, []).append({"qty": qty, "cost": px, "acquired": when})
            buy_events.setdefault(sym, []).append(when)

        elif order.side == "sell":
            lots = open_lots.get(sym, [])
            if method == "LIFO":
                lots = list(reversed(lots))

            remaining = qty
            while remaining > 1e-9 and lots:
                lot     = lots[0]
                matched = min(remaining, lot["qty"])
                pnl     = matched * (px - lot["cost"])
                is_lt   = _is_long_term(lot["acquired"], when)

                realized.append({
                    "symbol":              sym,
                    "qty":                 round(matched, 4),
                    "cost_basis":          round(lot["cost"], 4),
                    "proceeds_per_share":  round(px, 4),
                    "acquired":            _fmt_dt(lot["acquired"]),
                    "disposed":            _fmt_dt(when),
                    "days_held":           (when - lot["acquired"]).days,
                    "pnl":                 round(pnl, 2),
                    "term":                "long" if is_lt else "short",
                })

                remaining -= matched
                lot["qty"] -= matched
                if lot["qty"] < 1e-9:
                    lots.pop(0)

            if method == "LIFO":
                open_lots[sym] = list(reversed(lots))
            else:
                open_lots[sym] = lots

    # ── Wash-sale detection ───────────────────────────────────────────────────
    wash_sales: list[dict] = []
    for lot in realized:
        if lot["pnl"] >= 0:
            continue
        sym = lot["symbol"]
        disposed_dt = datetime.fromisoformat(lot["disposed"])
        acquired_dt = datetime.fromisoformat(lot["acquired"])
        window_start = disposed_dt - timedelta(days=30)
        window_end   = disposed_dt + timedelta(days=30)

        for buy_dt in buy_events.get(sym, []):
            # Skip the original buy that opened this lot
            if abs((buy_dt - acquired_dt).total_seconds()) < 60:
                continue
            if window_start <= buy_dt <= window_end:
                wash_sales.append({
                    "symbol":          sym,
                    "loss_amount":     lot["pnl"],
                    "disposed":        lot["disposed"],
                    "repurchase_date": _fmt_dt(buy_dt),
                    "days_difference": int((buy_dt - disposed_dt).days),
                })
                break

    # ── Open lots summary ─────────────────────────────────────────────────────
    open_summary: list[dict] = []
    for sym, lots in open_lots.items():
        for lot in lots:
            if lot["qty"] > 1e-9:
                open_summary.append({
                    "symbol":     sym,
                    "qty":        round(lot["qty"], 4),
                    "cost_basis": round(lot["cost"], 4),
                    "acquired":   _fmt_dt(lot["acquired"]),
                    "total_cost": round(lot["qty"] * lot["cost"], 2),
                    "days_held":  (_to_dt(datetime.now(timezone.utc)) - lot["acquired"]).days,
                })

    # ── Summary totals ────────────────────────────────────────────────────────
    st_gain = sum(r["pnl"] for r in realized if r["term"] == "short" and r["pnl"] > 0)
    st_loss = sum(r["pnl"] for r in realized if r["term"] == "short" and r["pnl"] < 0)
    lt_gain = sum(r["pnl"] for r in realized if r["term"] == "long"  and r["pnl"] > 0)
    lt_loss = sum(r["pnl"] for r in realized if r["term"] == "long"  and r["pnl"] < 0)

    return {
        "method":        method,
        "realized_lots": realized,
        "open_lots":     open_summary,
        "wash_sales":    wash_sales,
        "summary": {
            "short_term_gain": round(st_gain, 2),
            "short_term_loss": round(st_loss, 2),
            "short_term_net":  round(st_gain + st_loss, 2),
            "long_term_gain":  round(lt_gain, 2),
            "long_term_loss":  round(lt_loss, 2),
            "long_term_net":   round(lt_gain + lt_loss, 2),
            "total_realized":  round(st_gain + st_loss + lt_gain + lt_loss, 2),
            "n_realized_lots": len(realized),
            "n_open_lots":     len(open_summary),
            "n_wash_sales":    len(wash_sales),
        },
    }


async def get_tax_report(session: AsyncSession, method: str = "FIFO") -> dict:
    orders = await _get_filled_orders(session)
    return _compute_lots(orders, method=method.upper())

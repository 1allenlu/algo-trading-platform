"""
Custom Strategy Builder Service — Phase 48.

Evaluates user-defined rule sets against historical OHLCV data.

Rule format:
  {
    "buy_rules":  [{"indicator": "rsi",          "period": 14, "op": "lt",    "value": 30},
                   {"indicator": "sma_cross",     "fast": 10,  "slow": 50,   "op": "cross_above"}],
    "sell_rules": [{"indicator": "rsi",          "period": 14, "op": "gt",   "value": 70},
                   {"indicator": "change_pct",               "op": "lt",    "value": -3}],
    "logic": "OR"   # OR = any rule triggers; AND = all rules must trigger
  }

Supported indicators:
  rsi          — RSI(period); ops: gt, lt, gte, lte
  sma          — price vs SMA(period);  op: "gt"/"lt" price > sma or < sma
  ema          — price vs EMA(period);  op: "gt"/"lt"
  sma_cross    — SMA(fast) vs SMA(slow); op: cross_above / cross_below
  volume_ratio — volume / avg_volume(period); ops: gt, lt
  change_pct   — daily % change; ops: gt, lt
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import CustomStrategy, MarketData


# ── Indicator computations ─────────────────────────────────────────────────────

def _rsi(closes: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(closes)
    if len(closes) < period + 1:
        return result
    gains, losses = [], []
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    for i in range(period, len(closes)):
        if i > period:
            d = closes[i] - closes[i - 1]
            avg_gain = (avg_gain * (period - 1) + max(d, 0))  / period
            avg_loss = (avg_loss * (period - 1) + max(-d, 0)) / period
        rs = avg_gain / avg_loss if avg_loss > 0 else float("inf")
        result[i] = 100 - 100 / (1 + rs)
    return result


def _sma(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    for i in range(period - 1, len(values)):
        result[i] = sum(values[i - period + 1: i + 1]) / period
    return result


def _ema(values: list[float], period: int) -> list[float | None]:
    result: list[float | None] = [None] * len(values)
    k = 2 / (period + 1)
    ema_val: float | None = None
    for i, v in enumerate(values):
        if ema_val is None:
            if i >= period - 1:
                ema_val = sum(values[i - period + 1: i + 1]) / period
                result[i] = ema_val
        else:
            ema_val = v * k + ema_val * (1 - k)
            result[i] = ema_val
    return result


def _check_op(a: float, op: str, b: float) -> bool:
    if op in ("gt", ">"):   return a > b
    if op in ("lt", "<"):   return a < b
    if op in ("gte", ">="): return a >= b
    if op in ("lte", "<="): return a <= b
    return False


def _evaluate_rule(rule: dict, i: int, closes: list[float], volumes: list[float]) -> bool:
    ind = rule.get("indicator", "")
    op  = rule.get("op", "gt")
    val = rule.get("value", 0)

    if ind == "rsi":
        period = int(rule.get("period", 14))
        rsi    = _rsi(closes, period)
        v      = rsi[i]
        return v is not None and _check_op(v, op, val)

    if ind == "sma":
        period = int(rule.get("period", 50))
        sma    = _sma(closes, period)
        v      = sma[i]
        return v is not None and _check_op(closes[i], op, v)

    if ind == "ema":
        period = int(rule.get("period", 20))
        ema    = _ema(closes, period)
        v      = ema[i]
        return v is not None and _check_op(closes[i], op, v)

    if ind == "sma_cross":
        fast  = int(rule.get("fast", 10))
        slow  = int(rule.get("slow", 50))
        if i < 1:
            return False
        f_now  = _sma(closes, fast)[i]
        f_prev = _sma(closes, fast)[i - 1]
        s_now  = _sma(closes, slow)[i]
        s_prev = _sma(closes, slow)[i - 1]
        if None in (f_now, f_prev, s_now, s_prev):
            return False
        if op == "cross_above":
            return f_prev <= s_prev and f_now > s_now   # type: ignore[operator]
        if op == "cross_below":
            return f_prev >= s_prev and f_now < s_now   # type: ignore[operator]

    if ind == "volume_ratio":
        period = int(rule.get("period", 20))
        avg_v  = _sma(volumes, period)[i]
        if avg_v is None or avg_v == 0:
            return False
        return _check_op(volumes[i] / avg_v, op, val)

    if ind == "change_pct":
        if i < 1:
            return False
        pct = (closes[i] - closes[i - 1]) / closes[i - 1] * 100
        return _check_op(pct, op, val)

    return False


def _evaluate_rules(rules: list[dict], logic: str, i: int, closes: list[float], volumes: list[float]) -> bool:
    if not rules:
        return False
    results = [_evaluate_rule(r, i, closes, volumes) for r in rules]
    return all(results) if logic == "AND" else any(results)


def evaluate_strategy(conditions: dict, closes: list[float], volumes: list[float], dates: list[str]) -> list[dict]:
    """Evaluate buy/sell conditions across all bars. Returns signal list."""
    buy_rules  = conditions.get("buy_rules", [])
    sell_rules = conditions.get("sell_rules", [])
    logic      = conditions.get("logic", "OR")

    signals = []
    for i in range(len(closes)):
        buy  = _evaluate_rules(buy_rules,  logic, i, closes, volumes)
        sell = _evaluate_rules(sell_rules, logic, i, closes, volumes)
        sig  = "buy" if buy else "sell" if sell else "hold"
        if sig != "hold":
            signals.append({
                "date":   dates[i],
                "signal": sig,
                "close":  closes[i],
            })
    return signals


# ── CRUD ──────────────────────────────────────────────────────────────────────

async def list_strategies(session: AsyncSession, owner: str | None = None) -> list[Any]:
    q = select(CustomStrategy).order_by(CustomStrategy.created_at.desc())
    if owner:
        q = q.where(CustomStrategy.owner == owner)
    return list((await session.scalars(q)).all())


async def create_strategy(
    session: AsyncSession,
    name: str,
    description: str | None,
    conditions: dict,
    owner: str | None,
) -> Any:
    s = CustomStrategy(
        name            = name,
        description     = description,
        conditions_json = json.dumps(conditions),
        owner           = owner,
        created_at      = datetime.now(timezone.utc),
    )
    session.add(s)
    await session.flush()
    return s


async def delete_strategy(session: AsyncSession, strategy_id: int) -> bool:
    obj = await session.get(CustomStrategy, strategy_id)
    if obj is None:
        return False
    await session.delete(obj)
    return True


async def evaluate_strategy_for_symbol(
    session: AsyncSession,
    strategy_id: int,
    symbol: str,
    limit: int = 252,
) -> dict:
    """Load strategy + market data, run rule evaluator, return signals."""
    obj = await session.get(CustomStrategy, strategy_id)
    if obj is None:
        raise ValueError(f"Strategy {strategy_id} not found")

    conditions = json.loads(obj.conditions_json)

    rows = (await session.scalars(
        select(MarketData)
        .where(MarketData.symbol == symbol.upper())
        .order_by(MarketData.timestamp.asc())
        .limit(limit)
    )).all()

    if not rows:
        return {"strategy_id": strategy_id, "symbol": symbol, "signals": [], "n_bars": 0}

    closes  = [float(r.close)  for r in rows]
    volumes = [float(r.volume) for r in rows]
    dates   = [r.timestamp.date().isoformat() for r in rows]

    signals = evaluate_strategy(conditions, closes, volumes, dates)

    return {
        "strategy_id": strategy_id,
        "strategy_name": obj.name,
        "symbol":      symbol.upper(),
        "signals":     signals,
        "n_bars":      len(rows),
        "n_signals":   len(signals),
    }

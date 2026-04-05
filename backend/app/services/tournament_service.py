"""
Tournament Service — Phase 52.

Runs multiple named strategy configurations over the same historical window,
computes per-participant metrics (Sharpe, max drawdown, total return), and
stores results for leaderboard display.

Strategy types supported:
  sma_cross   — SMA(fast) > SMA(slow) → long, else flat
  rsi_revert  — RSI < oversold → buy, RSI > overbought → sell

Public interface:
  create_tournament(name, symbols, start_date, end_date, participants, db)
  run_tournament(tournament_id, db)
  get_tournament(tournament_id, db)
  list_tournaments(db, limit)
  delete_tournament(tournament_id, db)
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import MarketData, TournamentParticipant, TournamentRun


# ── Indicator helpers ──────────────────────────────────────────────────────────

def _sma(values: list[float], period: int, i: int) -> float | None:
    if i < period - 1:
        return None
    return sum(values[i - period + 1 : i + 1]) / period


def _rsi(closes: list[float], period: int, i: int) -> float | None:
    if i < period:
        return None
    gains, losses = [], []
    for k in range(i - period + 1, i + 1):
        diff = closes[k] - closes[k - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - 100 / (1 + rs)


# ── Strategy signal generators ────────────────────────────────────────────────

def _signals_sma_cross(closes: list[float], config: dict[str, Any]) -> list[str]:
    fast = int(config.get("fast", 10))
    slow = int(config.get("slow", 30))
    signals = []
    for i in range(len(closes)):
        f = _sma(closes, fast, i)
        s = _sma(closes, slow, i)
        if f is None or s is None:
            signals.append("hold")
        elif f > s:
            signals.append("buy")
        else:
            signals.append("sell")
    return signals


def _signals_rsi_revert(closes: list[float], config: dict[str, Any]) -> list[str]:
    period    = int(config.get("period", 14))
    oversold  = float(config.get("oversold", 30))
    overbought = float(config.get("overbought", 70))
    signals = []
    in_position = False
    for i in range(len(closes)):
        rsi = _rsi(closes, period, i)
        if rsi is None:
            signals.append("hold")
            continue
        if rsi < oversold and not in_position:
            signals.append("buy")
            in_position = True
        elif rsi > overbought and in_position:
            signals.append("sell")
            in_position = False
        else:
            signals.append("hold")
    return signals


def _run_strategy(closes: list[float], config: dict[str, Any]) -> list[str]:
    strategy = config.get("strategy", "sma_cross")
    if strategy == "rsi_revert":
        return _signals_rsi_revert(closes, config)
    return _signals_sma_cross(closes, config)   # default


# ── Equity simulation ─────────────────────────────────────────────────────────

def _simulate(
    dates: list[str],
    closes: list[float],
    signals: list[str],
    starting_equity: float = 100_000.0,
) -> dict[str, Any]:
    """
    Simulate a long-only portfolio from signals.
    Returns equity curve + summary metrics.
    """
    equity     = starting_equity
    shares     = 0.0
    num_trades = 0
    curve: list[dict] = []

    for i, (date, close, sig) in enumerate(zip(dates, closes, signals)):
        if sig == "buy" and shares == 0:
            shares = equity / close
            equity = 0.0
            num_trades += 1
        elif sig == "sell" and shares > 0:
            equity = shares * close
            shares = 0.0
            num_trades += 1

        total_equity = equity + shares * close
        curve.append({"date": date, "equity": round(total_equity, 2)})

    # Close any open position at last price
    if shares > 0:
        equity = shares * closes[-1]
        curve[-1]["equity"] = round(equity, 2)

    final_equity = curve[-1]["equity"] if curve else starting_equity
    total_return = (final_equity - starting_equity) / starting_equity

    # Sharpe ratio (annualised, assuming daily returns, 252 trading days)
    equities = [c["equity"] for c in curve]
    if len(equities) > 2:
        daily_rets = [
            (equities[i] - equities[i - 1]) / equities[i - 1]
            for i in range(1, len(equities))
        ]
        mean = sum(daily_rets) / len(daily_rets)
        var  = sum((r - mean) ** 2 for r in daily_rets) / len(daily_rets)
        std  = math.sqrt(var) if var > 0 else 0
        sharpe = (mean / std * math.sqrt(252)) if std > 0 else 0.0
    else:
        sharpe = 0.0

    # Max drawdown
    peak = starting_equity
    max_dd = 0.0
    for c in curve:
        peak = max(peak, c["equity"])
        dd   = (peak - c["equity"]) / peak if peak > 0 else 0
        max_dd = max(max_dd, dd)

    return {
        "equity_curve": curve,
        "final_equity": round(final_equity, 2),
        "total_return": round(total_return * 100, 4),   # percent
        "sharpe":       round(sharpe, 4),
        "max_drawdown": round(max_dd * 100, 4),         # percent
        "num_trades":   num_trades,
    }


# ── CRUD + run logic ──────────────────────────────────────────────────────────

async def create_tournament(
    name: str,
    symbols: list[str],
    start_date: str,
    end_date: str,
    participants: list[dict[str, Any]],
    session: AsyncSession,
) -> dict[str, Any]:
    """
    Create a TournamentRun + TournamentParticipant rows.
    participants: [{"name": "Fast SMA", "config": {"strategy": "sma_cross", "fast": 5, "slow": 20}}, ...]
    """
    now = datetime.now(tz=timezone.utc)
    run = TournamentRun(
        name       = name,
        symbols    = ",".join(s.upper() for s in symbols),
        start_date = start_date,
        end_date   = end_date,
        status     = "pending",
        created_at = now,
    )
    session.add(run)
    await session.flush()  # get run.id

    for p in participants:
        session.add(TournamentParticipant(
            tournament_id        = run.id,
            name                 = p["name"],
            strategy_config_json = json.dumps(p["config"]),
            status               = "pending",
        ))

    await session.commit()
    return {"tournament_id": run.id, "name": run.name, "participants": len(participants)}


async def run_tournament(tournament_id: int, session: AsyncSession) -> dict[str, Any]:
    """
    Fetch historical data for each symbol, run each participant's strategy,
    and store metrics + equity curve.  Uses first symbol in the list for simulation.
    """
    run = await session.get(TournamentRun, tournament_id)
    if not run:
        return {"error": "Tournament not found"}
    if run.status == "running":
        return {"error": "Already running"}

    run.status = "running"
    await session.commit()

    try:
        symbol = run.symbols.split(",")[0]

        # Fetch OHLCV for the symbol in the date window
        rows = (await session.scalars(
            select(MarketData)
            .where(
                MarketData.symbol == symbol.upper(),
                MarketData.timestamp >= run.start_date,
                MarketData.timestamp <= run.end_date + "T23:59:59",
            )
            .order_by(MarketData.timestamp)
        )).all()

        if len(rows) < 20:
            raise ValueError(f"Insufficient data for {symbol} in date range (found {len(rows)} bars)")

        dates  = [r.timestamp.strftime("%Y-%m-%d") for r in rows]
        closes = [r.close for r in rows]

        participants = (await session.scalars(
            select(TournamentParticipant).where(TournamentParticipant.tournament_id == tournament_id)
        )).all()

        for p in participants:
            p.status = "running"
            config   = json.loads(p.strategy_config_json)
            signals  = _run_strategy(closes, config)
            result   = _simulate(dates, closes, signals)

            p.total_return      = result["total_return"]
            p.sharpe            = result["sharpe"]
            p.max_drawdown      = result["max_drawdown"]
            p.num_trades        = result["num_trades"]
            p.final_equity      = result["final_equity"]
            p.equity_curve_json = json.dumps(result["equity_curve"])
            p.status            = "done"

        run.status       = "done"
        run.completed_at = datetime.now(tz=timezone.utc)
        await session.commit()
        logger.info(f"[tournament] Run {tournament_id} completed — {len(participants)} participants")
        return {"tournament_id": tournament_id, "status": "done", "participants": len(participants)}

    except Exception as exc:
        run.status = "failed"
        run.error  = str(exc)
        await session.commit()
        logger.error(f"[tournament] Run {tournament_id} failed: {exc}")
        return {"error": str(exc)}


async def get_tournament(tournament_id: int, session: AsyncSession) -> dict[str, Any] | None:
    run = await session.get(TournamentRun, tournament_id)
    if not run:
        return None

    participants = (await session.scalars(
        select(TournamentParticipant)
        .where(TournamentParticipant.tournament_id == tournament_id)
        .order_by(TournamentParticipant.sharpe.desc().nulls_last())
    )).all()

    def _p_to_dict(p: TournamentParticipant) -> dict:
        curve = json.loads(p.equity_curve_json) if p.equity_curve_json else []
        return {
            "id":            p.id,
            "name":          p.name,
            "config":        json.loads(p.strategy_config_json),
            "status":        p.status,
            "total_return":  p.total_return,
            "sharpe":        p.sharpe,
            "max_drawdown":  p.max_drawdown,
            "num_trades":    p.num_trades,
            "final_equity":  p.final_equity,
            "equity_curve":  curve,
        }

    return {
        "id":           run.id,
        "name":         run.name,
        "symbols":      run.symbols.split(","),
        "start_date":   run.start_date,
        "end_date":     run.end_date,
        "status":       run.status,
        "error":        run.error,
        "created_at":   run.created_at.isoformat() if run.created_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "participants": [_p_to_dict(p) for p in participants],
    }


async def list_tournaments(session: AsyncSession, limit: int = 20) -> list[dict]:
    runs = (await session.scalars(
        select(TournamentRun).order_by(TournamentRun.created_at.desc()).limit(limit)
    )).all()

    result = []
    for run in runs:
        count = len((await session.scalars(
            select(TournamentParticipant).where(TournamentParticipant.tournament_id == run.id)
        )).all())
        result.append({
            "id":           run.id,
            "name":         run.name,
            "symbols":      run.symbols.split(","),
            "start_date":   run.start_date,
            "end_date":     run.end_date,
            "status":       run.status,
            "created_at":   run.created_at.isoformat() if run.created_at else None,
            "participant_count": count,
        })
    return result


async def delete_tournament(tournament_id: int, session: AsyncSession) -> bool:
    run = await session.get(TournamentRun, tournament_id)
    if not run:
        return False
    participants = (await session.scalars(
        select(TournamentParticipant).where(TournamentParticipant.tournament_id == tournament_id)
    )).all()
    for p in participants:
        await session.delete(p)
    await session.delete(run)
    await session.commit()
    return True

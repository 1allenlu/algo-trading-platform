"""
Earnings Calendar Service — Phase 33.

Fetches upcoming and historical earnings dates + EPS data via yfinance.

yfinance endpoints used:
  ticker.calendar      → upcoming earnings date + EPS/revenue estimates
  ticker.earnings_dates → historical EPS actuals + surprises (quarterly)

Both endpoints are unreliable for some tickers — every call is wrapped in
try/except and returns None/empty gracefully.

Public interface:
  get_next_earnings(symbol)          → dict with next date + EPS + history
  get_earnings_calendar(symbols)     → list[dict] sorted by next_earnings_date
"""

from __future__ import annotations

import time
from typing import Any

import yfinance as yf
from loguru import logger

# Simple in-memory cache (1 hour TTL — earnings don't change often)
_cache: dict[str, tuple[float, dict]] = {}
_TTL = 3600


def _parse_calendar(ticker: yf.Ticker) -> str | None:
    """Extract next earnings date from ticker.calendar (handles both dict and DataFrame)."""
    try:
        cal = ticker.calendar
        if cal is None:
            return None

        # New yfinance format returns a plain dict
        if isinstance(cal, dict):
            # Key varies: 'Earnings Date', 'earningsDate', etc.
            for key in ("Earnings Date", "earningsDate"):
                val = cal.get(key)
                if val:
                    if isinstance(val, list) and val:
                        val = val[0]
                    return str(val)[:10]  # "YYYY-MM-DD"
            return None

        # Legacy: DataFrame with index = field names
        import pandas as pd
        if isinstance(cal, pd.DataFrame):
            if "Earnings Date" in cal.index:
                val = cal.loc["Earnings Date"].iloc[0] if len(cal.columns) > 0 else None
                if val is not None:
                    return str(val)[:10]
        return None
    except Exception:
        return None


def _parse_history(ticker: yf.Ticker) -> list[dict]:
    """Extract historical earnings (EPS + surprise) from ticker.earnings_dates."""
    try:
        df = ticker.earnings_dates
        if df is None or df.empty:
            return []

        df = df.dropna(how="all")
        results = []
        for ts, row in df.iterrows():
            try:
                date_str = str(ts)[:10]  # "YYYY-MM-DD"
                eps_est  = float(row.get("EPS Estimate", None) or row.get("epsEstimate", None) or "nan")
                eps_act  = float(row.get("Reported EPS",  None) or row.get("epsActual", None) or "nan")
                surp     = float(row.get("Surprise(%)",   None) or row.get("surprisePct", None) or "nan")

                import math
                results.append({
                    "date":         date_str,
                    "eps_estimate": None if math.isnan(eps_est) else round(eps_est, 4),
                    "eps_actual":   None if math.isnan(eps_act) else round(eps_act, 4),
                    "surprise_pct": None if math.isnan(surp)    else round(surp,    4),
                })
            except Exception:
                continue

        # Sort newest first, cap at 8 quarters
        results.sort(key=lambda x: x["date"], reverse=True)
        return results[:8]
    except Exception:
        return []


def get_next_earnings(symbol: str) -> dict[str, Any]:
    """
    Return next earnings date + EPS estimate + 8 quarters of history.

    Cached for 1 hour per symbol.
    """
    sym = symbol.upper()
    now = time.time()

    if sym in _cache and (now - _cache[sym][0]) < _TTL:
        return _cache[sym][1]

    try:
        ticker = yf.Ticker(sym)
        next_date = _parse_calendar(ticker)
        history   = _parse_history(ticker)

        # Best-effort: EPS estimate from first history row where actual is None
        eps_estimate = None
        for h in history:
            if h["eps_actual"] is None and h["eps_estimate"] is not None:
                eps_estimate = h["eps_estimate"]
                break

        result: dict[str, Any] = {
            "symbol":             sym,
            "next_earnings_date": next_date,
            "eps_estimate":       eps_estimate,
            "earnings_history":   history,
        }
    except Exception as exc:
        logger.warning(f"[earnings] Failed for {sym}: {exc}")
        result = {
            "symbol":             sym,
            "next_earnings_date": None,
            "eps_estimate":       None,
            "earnings_history":   [],
        }

    _cache[sym] = (now, result)
    return result


def get_earnings_reaction(symbol: str) -> list[dict]:
    """
    Phase 77 — For each historical earnings date, compute the stock's
    price reaction: +1d, +3d, +5d return after the announcement.

    Uses the existing earnings history + yfinance price data.
    Cached 6 hours per symbol.
    """
    sym = symbol.upper()
    cache_key = f"{sym}::reaction"
    now = time.time()

    if cache_key in _cache and (now - _cache[cache_key][0]) < _TTL * 6:
        return _cache[cache_key][1]

    earnings = get_next_earnings(sym)
    history  = earnings.get("earnings_history", [])
    result: list[dict] = []

    if not history:
        _cache[cache_key] = (now, result)
        return result

    try:
        import pandas as pd
        ticker = yf.Ticker(sym)
        prices = ticker.history(period="3y")["Close"]
        prices.index = pd.to_datetime(prices.index).tz_localize(None).normalize()

        for entry in history:
            date_str = entry.get("date", "")
            if not date_str:
                continue
            try:
                earn_dt = pd.Timestamp(date_str)
                # Find nearest trading day on or after earnings date
                idx = prices.index.searchsorted(earn_dt)
                if idx >= len(prices) - 5:
                    continue

                p0 = float(prices.iloc[idx])
                p1 = float(prices.iloc[idx + 1]) if idx + 1 < len(prices) else None
                p3 = float(prices.iloc[idx + 3]) if idx + 3 < len(prices) else None
                p5 = float(prices.iloc[idx + 5]) if idx + 5 < len(prices) else None

                result.append({
                    "date":         date_str,
                    "eps_estimate": entry.get("eps_estimate"),
                    "eps_actual":   entry.get("eps_actual"),
                    "surprise_pct": entry.get("surprise_pct"),
                    "ret_1d":       round((p1 / p0 - 1) * 100, 2) if p1 else None,
                    "ret_3d":       round((p3 / p0 - 1) * 100, 2) if p3 else None,
                    "ret_5d":       round((p5 / p0 - 1) * 100, 2) if p5 else None,
                })
            except Exception:
                continue
    except Exception as exc:
        logger.warning(f"[earnings_reaction] {sym} failed: {exc}")

    _cache[cache_key] = (now, result)
    return result


def get_earnings_calendar(symbols: list[str]) -> list[dict]:
    """
    Return earnings data for multiple symbols, sorted by next_earnings_date ASC.
    Symbols with no known date appear at the end.
    """
    results = [get_next_earnings(s) for s in symbols]

    def sort_key(r: dict) -> tuple:
        d = r.get("next_earnings_date")
        return (0, d) if d else (1, "")

    results.sort(key=sort_key)
    return results

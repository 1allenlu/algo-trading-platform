"""
Dividend Tracker Service — Phase 71.

Fetches dividend history, yield, ex-date, and next payment info
for a list of symbols via yfinance.

Public functions:
  get_dividend_summary(symbol)       → dict
  get_dividend_calendar(symbols)     → list[dict]
"""

from __future__ import annotations

import time
from typing import Any

import yfinance as yf
from loguru import logger

_cache: dict[str, tuple[float, Any]] = {}
_TTL = 60 * 60   # 1 hour — dividends don't change often


def get_dividend_summary(symbol: str) -> dict:
    """
    Return dividend yield, ex-date, last dividend amount,
    payment frequency, and 5-year history for one symbol.
    """
    now = time.time()
    if symbol in _cache and now - _cache[symbol][0] < _TTL:
        return _cache[symbol][1]

    try:
        ticker = yf.Ticker(symbol.upper())
        info   = ticker.info or {}

        # Historical dividends (pandas Series: date → amount)
        hist = ticker.dividends
        history: list[dict] = []
        if hist is not None and len(hist) > 0:
            recent = hist.tail(20)
            for dt, amt in recent.items():
                history.append({
                    "date":   str(dt)[:10],
                    "amount": round(float(amt), 4),
                })
            history.sort(key=lambda x: x["date"], reverse=True)

        # Determine frequency from last 2 years of dividends
        frequency: str | None = None
        if len(history) >= 2:
            recent_count = sum(1 for h in history if h["date"] >= history[0]["date"][:4])
            if recent_count >= 11:
                frequency = "monthly"
            elif recent_count >= 3:
                frequency = "quarterly"
            elif recent_count >= 1:
                frequency = "annual"

        # Ex-dividend date — yfinance returns as unix timestamp or None
        ex_date_raw = info.get("exDividendDate")
        ex_date: str | None = None
        if ex_date_raw:
            import datetime
            try:
                ex_date = datetime.datetime.utcfromtimestamp(ex_date_raw).strftime("%Y-%m-%d")
            except Exception:
                pass

        result = {
            "symbol":              symbol.upper(),
            "company_name":        info.get("longName") or info.get("shortName"),
            "dividend_yield":      round(float(info.get("dividendYield") or 0) * 100, 3),  # %
            "trailing_annual_div": round(float(info.get("trailingAnnualDividendRate") or 0), 4),
            "last_dividend":       history[0]["amount"] if history else None,
            "ex_dividend_date":    ex_date,
            "payout_ratio":        round(float(info.get("payoutRatio") or 0) * 100, 1),
            "frequency":           frequency,
            "sector":              info.get("sector"),
            "history":             history[:12],   # last 12 payments
        }

        _cache[symbol] = (now, result)
        return result

    except Exception as exc:
        logger.warning(f"[dividends] {symbol}: {exc}")
        return {
            "symbol": symbol.upper(), "company_name": None,
            "dividend_yield": None, "trailing_annual_div": None,
            "last_dividend": None, "ex_dividend_date": None,
            "payout_ratio": None, "frequency": None,
            "sector": None, "history": [],
        }


def get_dividend_calendar(symbols: list[str]) -> list[dict]:
    """
    Return one summary row per symbol, sorted by dividend yield desc.
    Filters to symbols that actually pay dividends.
    """
    results = []
    for sym in symbols:
        data = get_dividend_summary(sym)
        results.append(data)

    # Sort by yield descending (None last)
    results.sort(key=lambda r: (r["dividend_yield"] is None, -(r["dividend_yield"] or 0)))
    return results

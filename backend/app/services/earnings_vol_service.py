"""
Earnings Volatility Service — Phase 62.

For each symbol computes:
  - Expected move (IV-based): ±(straddle_cost / underlying_price)
  - Historical beat/miss/inline rate from past EPS surprises
  - Post-earnings IV crush estimate (IV before vs after nearest expiry)

All data from yfinance — 15-min delayed options, cached 30 min.

Public interface:
  screen_earnings_plays(symbols)  → list of EarningsPlay dicts
"""

from __future__ import annotations

import time
from typing import Any

import yfinance as yf
from loguru import logger

_cache: dict[str, tuple[float, Any]] = {}
_TTL = 30 * 60


def _get_straddle_cost(ticker: yf.Ticker, price: float) -> tuple[float | None, float | None, str | None]:
    """Return (straddle_cost, iv, expiry) for the nearest ATM straddle."""
    try:
        exps = ticker.options
        if not exps:
            return None, None, None
        exp = exps[0]
        chain = ticker.option_chain(exp)
        calls = chain.calls
        puts  = chain.puts
        if calls.empty or puts.empty:
            return None, None, None

        # Find ATM strike
        strikes = sorted(calls["strike"].tolist(), key=lambda s: abs(s - price))
        atm = strikes[0] if strikes else None
        if atm is None:
            return None, None, None

        call_row = calls[calls["strike"] == atm]
        put_row  = puts[puts["strike"] == atm]
        if call_row.empty or put_row.empty:
            return None, None, None

        c_last = float(call_row["lastPrice"].iloc[0])
        p_last = float(put_row["lastPrice"].iloc[0])
        straddle = c_last + p_last

        # Average IV of ATM call + put
        c_iv = float(call_row["impliedVolatility"].iloc[0]) if "impliedVolatility" in call_row else None
        p_iv = float(put_row["impliedVolatility"].iloc[0])  if "impliedVolatility" in put_row  else None
        avg_iv = ((c_iv or 0) + (p_iv or 0)) / 2 if c_iv and p_iv else (c_iv or p_iv)

        return round(straddle, 2), round(avg_iv * 100, 2) if avg_iv else None, exp

    except Exception as exc:
        logger.warning(f"[earnings_vol] straddle fetch failed: {exc}")
        return None, None, None


def _beat_rate(ticker: yf.Ticker) -> tuple[int, int, int, float | None]:
    """Return (beats, misses, inline, beat_rate_pct) from EPS history."""
    try:
        dates = ticker.earnings_dates
        if dates is None or dates.empty:
            return 0, 0, 0, None
        beats = misses = inline = 0
        for _, row in dates.iterrows():
            surprise = row.get("Surprise(%)")
            if surprise is None:
                continue
            if surprise > 2:
                beats += 1
            elif surprise < -2:
                misses += 1
            else:
                inline += 1
        total = beats + misses + inline
        rate = round(beats / total * 100, 1) if total > 0 else None
        return beats, misses, inline, rate
    except Exception:
        return 0, 0, 0, None


def get_earnings_play(symbol: str) -> dict | None:
    now = time.time()
    if symbol in _cache and (now - _cache[symbol][0]) < _TTL:
        return _cache[symbol][1]

    try:
        t = yf.Ticker(symbol.upper())
        hist = t.history(period="5d")
        if hist.empty:
            return None
        price = float(hist["Close"].iloc[-1])

        straddle, iv, exp = _get_straddle_cost(t, price)
        beats, misses, inline, beat_rate = _beat_rate(t)
        expected_move_pct = round(straddle / price * 100, 2) if straddle and price > 0 else None

        # Next earnings date
        next_date = None
        try:
            cal = t.calendar
            if isinstance(cal, dict):
                nd = cal.get("Earnings Date")
                next_date = str(nd[0].date()) if nd and hasattr(nd[0], "date") else str(nd) if nd else None
        except Exception:
            pass

        result = {
            "symbol":             symbol.upper(),
            "price":              round(price, 2),
            "next_earnings":      next_date,
            "straddle_cost":      straddle,
            "atm_iv_pct":         iv,
            "expected_move_pct":  expected_move_pct,
            "nearest_expiry":     exp,
            "beats":              beats,
            "misses":             misses,
            "inline":             inline,
            "beat_rate_pct":      beat_rate,
            "setup": (
                "straddle"   if (expected_move_pct or 0) > 3 and (iv or 0) > 30 else
                "directional" if beat_rate and beat_rate > 65 else
                "pass"
            ),
        }
        _cache[symbol] = (now, result)
        return result

    except Exception as exc:
        logger.warning(f"[earnings_vol] {symbol}: {exc}")
        return None


def screen_earnings_plays(symbols: list[str]) -> list[dict]:
    results = []
    for sym in symbols:
        play = get_earnings_play(sym)
        if play:
            results.append(play)
    results.sort(key=lambda x: -(x.get("expected_move_pct") or 0))
    return results

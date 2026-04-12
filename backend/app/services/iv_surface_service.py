"""
IV Term Structure — Phase 81.

Computes the at-the-money (ATM) implied volatility for each available
options expiration for a symbol, producing a term-structure curve.

Uses yfinance options chain — 15-min delayed.
Cached 30 minutes per symbol (IV moves slowly during the day).
"""

from __future__ import annotations

import time
from typing import Any

import yfinance as yf

# ── In-process TTL cache ──────────────────────────────────────────────────────
_CACHE: dict[str, tuple[float, Any]] = {}
_TTL   = 30 * 60   # 30 minutes


def _atm_iv(df, current_price: float) -> float | None:
    """
    Return the average IV of the two contracts closest to ATM.
    Works for both calls and puts DataFrames.
    """
    if df is None or df.empty:
        return None
    df = df.copy()
    if "impliedVolatility" not in df.columns:
        return None
    df["dist"] = (df["strike"] - current_price).abs()
    atm = df.nsmallest(2, "dist")
    vals = atm["impliedVolatility"].dropna().tolist()
    return round(float(sum(vals) / len(vals)), 4) if vals else None


def get_iv_term_structure(symbol: str) -> list[dict]:
    """
    Return a list of { expiry, days_to_exp, atm_iv, call_iv, put_iv }
    sorted by days_to_expiry ascending.
    """
    sym = symbol.upper()
    now = time.time()
    if sym in _CACHE:
        ts, data = _CACHE[sym]
        if now - ts < _TTL:
            return data

    ticker = yf.Ticker(sym)

    # Current price for ATM selection
    info    = ticker.info or {}
    current = (
        info.get("regularMarketPrice")
        or info.get("currentPrice")
        or info.get("previousClose")
    )

    expirations: tuple[str, ...] = ticker.options or ()
    if not expirations:
        _CACHE[sym] = (now, [])
        return []

    today = __import__("datetime").date.today()
    result = []

    for exp in expirations:
        try:
            chain = ticker.option_chain(exp)
        except Exception:
            continue

        calls_df = getattr(chain, "calls", None)
        puts_df  = getattr(chain, "puts",  None)

        exp_date  = __import__("datetime").date.fromisoformat(exp)
        days_to   = (exp_date - today).days

        if current:
            call_iv = _atm_iv(calls_df, current)
            put_iv  = _atm_iv(puts_df,  current)
            # Average of call and put ATM IV (put-call parity midpoint)
            ivs = [v for v in [call_iv, put_iv] if v is not None]
            atm_iv = round(sum(ivs) / len(ivs), 4) if ivs else None
        else:
            call_iv = put_iv = atm_iv = None

        result.append({
            "expiry":      exp,
            "days_to_exp": days_to,
            "atm_iv":      atm_iv,
            "call_iv":     call_iv,
            "put_iv":      put_iv,
        })

    # Sort by days ascending
    result.sort(key=lambda r: r["days_to_exp"])

    _CACHE[sym] = (now, result)
    return result

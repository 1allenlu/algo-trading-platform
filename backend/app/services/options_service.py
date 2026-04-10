"""
Options Chain Service — Phase 27.

Fetches equity options data (calls + puts) from yfinance.
Returns strike table with price, IV, volume, OI for a chosen expiry.

Public functions:
  get_expirations(symbol)                 → list of available expiry date strings
  get_options_chain(symbol, expiry=None)  → full chain for one expiry
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any

import yfinance as yf
from loguru import logger


# ── Black-Scholes Greeks — Phase 75 ──────────────────────────────────────────

def _norm_cdf(x: float) -> float:
    """Standard normal CDF via math.erf (no external dependencies)."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


_RISK_FREE_RATE = 0.05   # approximate; can be improved with live treasury data


def _bs_greeks(
    S: float, K: float, T: float, sigma: float, is_call: bool
) -> dict[str, float | None]:
    """
    Compute Black-Scholes delta, gamma, theta, vega for one contract.

    S       — underlying spot price
    K       — strike price
    T       — time to expiry in years
    sigma   — implied volatility (annualised fraction, e.g. 0.30 = 30%)
    is_call — True for calls, False for puts
    """
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return {"delta": None, "gamma": None, "theta": None, "vega": None}
    try:
        r = _RISK_FREE_RATE
        sq_T  = math.sqrt(T)
        d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * sq_T)
        d2 = d1 - sigma * sq_T

        pdf_d1 = math.exp(-0.5 * d1 ** 2) / math.sqrt(2 * math.pi)
        gamma  = pdf_d1 / (S * sigma * sq_T)
        vega   = S * pdf_d1 * sq_T / 100   # per 1 % IV move

        if is_call:
            delta = _norm_cdf(d1)
            theta = (
                -S * pdf_d1 * sigma / (2 * sq_T)
                - r * K * math.exp(-r * T) * _norm_cdf(d2)
            ) / 365
        else:
            delta = _norm_cdf(d1) - 1.0
            theta = (
                -S * pdf_d1 * sigma / (2 * sq_T)
                + r * K * math.exp(-r * T) * _norm_cdf(-d2)
            ) / 365

        return {
            "delta": round(delta, 4),
            "gamma": round(gamma, 6),
            "theta": round(theta, 4),
            "vega":  round(vega,  4),
        }
    except Exception:
        return {"delta": None, "gamma": None, "theta": None, "vega": None}


def _time_to_expiry(expiry_str: str) -> float:
    """Return time to expiry in years from an ISO date string."""
    try:
        exp = date.fromisoformat(expiry_str)
        days = (exp - date.today()).days
        return max(days / 365.0, 0.0)
    except Exception:
        return 0.0


def get_expirations(symbol: str) -> list[str]:
    """Return available option expiration dates for a symbol (YYYY-MM-DD strings)."""
    try:
        ticker = yf.Ticker(symbol.upper())
        return list(ticker.options)  # tuple → list
    except Exception as exc:
        logger.warning(f"[options] get_expirations({symbol}) failed: {exc}")
        return []


def get_options_chain(symbol: str, expiry: str | None = None) -> dict[str, Any]:
    """
    Return the full options chain for one expiration date.

    If `expiry` is None (or not found in the available list), the nearest
    expiry is used.

    Returns:
        {
          symbol, current_price, expiration, expirations,
          calls: [OptionContract], puts: [OptionContract]
        }

    OptionContract fields:
        strike, last_price, bid, ask, change, change_pct,
        volume, open_interest, implied_volatility (annualised),
        in_the_money, contract_type ("call"|"put")
    """
    sym = symbol.upper()
    try:
        ticker = yf.Ticker(sym)
        expirations: list[str] = list(ticker.options)
    except Exception as exc:
        logger.warning(f"[options] ticker init failed for {sym}: {exc}")
        return _empty(sym)

    if not expirations:
        return _empty(sym)

    # Choose expiry — default to nearest
    chosen = expiry if expiry in expirations else expirations[0]

    try:
        chain = ticker.option_chain(chosen)
    except Exception as exc:
        logger.warning(f"[options] option_chain({sym}, {chosen}) failed: {exc}")
        return _empty(sym, expirations)

    # Current underlying price
    try:
        info = ticker.fast_info
        current_price = float(info.last_price)
    except Exception:
        current_price = None

    T = _time_to_expiry(chosen)
    return {
        "symbol":        sym,
        "current_price": current_price,
        "expiration":    chosen,
        "expirations":   expirations,
        "calls":         _format_contracts(chain.calls, "call", current_price, T),
        "puts":          _format_contracts(chain.puts,  "put",  current_price, T),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _format_contracts(
    df: Any,
    contract_type: str,
    current_price: float | None = None,
    T: float = 0.0,
) -> list[dict]:
    rows = []
    is_call = contract_type == "call"
    for _, row in df.iterrows():
        iv     = float(row.get("impliedVolatility", 0) or 0)
        strike = _safe_float(row.get("strike"))

        # Phase 75: Black-Scholes Greeks
        greeks = {"delta": None, "gamma": None, "theta": None, "vega": None}
        if current_price and strike and T > 0 and iv > 0:
            greeks = _bs_greeks(current_price, strike, T, iv, is_call)

        rows.append({
            "strike":             strike,
            "last_price":         _safe_float(row.get("lastPrice")),
            "bid":                _safe_float(row.get("bid")),
            "ask":                _safe_float(row.get("ask")),
            "change":             _safe_float(row.get("change")),
            "change_pct":         _safe_float(row.get("percentChange")),
            "volume":             int(_safe_float(row.get("volume")) or 0),
            "open_interest":      int(_safe_float(row.get("openInterest")) or 0),
            "implied_volatility": round(iv, 4),   # annualised fraction (e.g. 0.35 = 35%)
            "in_the_money":       bool(row.get("inTheMoney", False)),
            "contract_type":      contract_type,
            **greeks,
        })
    return rows


def _safe_float(val: Any) -> float | None:
    try:
        f = float(val)
        return None if math.isnan(f) else round(f, 4)
    except (TypeError, ValueError):
        return None


def _empty(symbol: str, expirations: list[str] | None = None) -> dict:
    return {
        "symbol":        symbol,
        "current_price": None,
        "expiration":    None,
        "expirations":   expirations or [],
        "calls":         [],
        "puts":          [],
    }


# ── Phase 50: Options Strategy Screener ───────────────────────────────────────

def _screen_covered_call(chain: dict) -> list[dict]:
    """Highest-IV near-the-money calls for covered call writing."""
    price = chain.get("current_price")
    if not price:
        return []
    results = []
    for c in chain["calls"]:
        if c["implied_volatility"] is None or c["strike"] is None:
            continue
        iv     = c["implied_volatility"]
        strike = c["strike"]
        otm    = (strike - price) / price   # positive = OTM
        if 0 <= otm <= 0.08 and iv >= 0.20:  # 0-8% OTM, IV ≥ 20%
            premium = c["last_price"] or 0
            results.append({
                "strike":      strike,
                "iv":          round(iv, 4),
                "premium":     premium,
                "otm_pct":     round(otm * 100, 2),
                "annualized_yield": round(premium / price * 52, 4) if premium else None,
                "volume":      c["volume"],
                "open_interest": c["open_interest"],
            })
    return sorted(results, key=lambda x: x["iv"], reverse=True)[:5]


def _screen_csp(chain: dict) -> list[dict]:
    """Highest-IV near-the-money puts for cash-secured put writing."""
    price = chain.get("current_price")
    if not price:
        return []
    results = []
    for p in chain["puts"]:
        if p["implied_volatility"] is None or p["strike"] is None:
            continue
        iv     = p["implied_volatility"]
        strike = p["strike"]
        otm    = (price - strike) / price   # positive = OTM put
        if 0 <= otm <= 0.08 and iv >= 0.20:
            premium = p["last_price"] or 0
            results.append({
                "strike":      strike,
                "iv":          round(iv, 4),
                "premium":     premium,
                "otm_pct":     round(otm * 100, 2),
                "annualized_yield": round(premium / strike * 52, 4) if premium and strike else None,
                "volume":      p["volume"],
                "open_interest": p["open_interest"],
            })
    return sorted(results, key=lambda x: x["iv"], reverse=True)[:5]


def _screen_iron_condor(chain: dict) -> list[dict]:
    """
    Find iron condor opportunities: sell OTM put + OTM call, buy further wings.
    Score by net credit relative to max loss.
    """
    price = chain.get("current_price")
    if not price:
        return []

    # Find candidate short put and short call strikes (5-8% OTM)
    short_puts  = [p for p in chain["puts"]  if p["strike"] and
                   0.03 <= (price - p["strike"]) / price <= 0.08 and p["bid"]]
    short_calls = [c for c in chain["calls"] if c["strike"] and
                   0.03 <= (c["strike"] - price) / price <= 0.08 and c["bid"]]

    condors = []
    for sp in short_puts[:3]:
        # Buy put wing 2-3% below short put
        put_wing = next(
            (p for p in chain["puts"] if p["strike"] and
             abs(p["strike"] - (sp["strike"] * 0.97)) < sp["strike"] * 0.02 and p["ask"]),
            None,
        )
        for sc in short_calls[:3]:
            call_wing = next(
                (c for c in chain["calls"] if c["strike"] and
                 abs(c["strike"] - (sc["strike"] * 1.03)) < sc["strike"] * 0.02 and c["ask"]),
                None,
            )
            if put_wing and call_wing:
                net_credit = ((sp["bid"] or 0) + (sc["bid"] or 0)
                              - (put_wing["ask"] or 0) - (call_wing["ask"] or 0))
                spread_width = min(
                    sp["strike"] - put_wing["strike"],
                    call_wing["strike"] - sc["strike"],
                )
                if net_credit > 0 and spread_width > 0:
                    condors.append({
                        "short_put_strike":  sp["strike"],
                        "long_put_strike":   put_wing["strike"],
                        "short_call_strike": sc["strike"],
                        "long_call_strike":  call_wing["strike"],
                        "net_credit":        round(net_credit, 4),
                        "max_loss":          round(spread_width - net_credit, 4),
                        "credit_to_risk":    round(net_credit / spread_width, 4) if spread_width else None,
                    })
    return sorted(condors, key=lambda x: x["credit_to_risk"] or 0, reverse=True)[:3]


def screen_options(symbols: list[str], strategy: str) -> list[dict]:
    """
    Phase 50: Scan multiple symbols for options strategy opportunities.

    strategy: "covered_call" | "cash_secured_put" | "iron_condor"

    Returns one entry per symbol with the best matching contracts.
    yfinance is called synchronously — runs in ~1-3s per symbol.
    """
    results = []
    for sym in symbols:
        chain = get_options_chain(sym)
        if not chain["calls"] and not chain["puts"]:
            continue

        if strategy == "covered_call":
            opportunities = _screen_covered_call(chain)
        elif strategy == "cash_secured_put":
            opportunities = _screen_csp(chain)
        elif strategy == "iron_condor":
            opportunities = _screen_iron_condor(chain)
        else:
            opportunities = []

        if opportunities:
            results.append({
                "symbol":        sym,
                "current_price": chain.get("current_price"),
                "expiration":    chain.get("expiration"),
                "strategy":      strategy,
                "opportunities": opportunities,
            })

    return results

"""
Options Flow Scanner — Phase 70.

Scans a list of symbols for unusual options activity:
  - Volume / Open Interest ratio (vol_oi_ratio) — spikes indicate new positioning
  - Absolute volume threshold — large absolute prints
  - Put/Call volume ratio — directional bias indicator

All data sourced from yfinance options chains (15-min delayed).
Results are cached per symbol for 15 minutes.

Public functions:
  scan_options_flow(symbols)  → list[OptionsFlowRow]
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import yfinance as yf
from loguru import logger

_cache: dict[str, tuple[float, Any]] = {}
_TTL = 15 * 60   # 15 minutes


@dataclass
class OptionsFlowRow:
    symbol:        str
    contract_type: str           # "call" | "put"
    strike:        float
    expiry:        str
    volume:        int
    open_interest: int
    vol_oi_ratio:  float | None  # volume / OI — high = unusual
    iv:            float | None  # implied volatility (fraction)
    last_price:    float | None
    otm_pct:       float | None  # % out-of-the-money (positive = OTM)
    flag:          str           # "sweep" | "unusual_vol" | "high_oi" | "normal"


def _classify(vol: int, oi: int, vol_oi: float | None) -> str:
    if vol > 500 and vol_oi is not None and vol_oi > 5.0:
        return "sweep"
    if vol_oi is not None and vol_oi > 2.0:
        return "unusual_vol"
    if oi > 10_000:
        return "high_oi"
    return "normal"


def _scan_symbol(symbol: str, current_price: float | None) -> list[OptionsFlowRow]:
    ticker = yf.Ticker(symbol.upper())
    expirations = ticker.options
    if not expirations:
        return []

    # Only look at the nearest 2 expiries to keep it fast
    rows: list[OptionsFlowRow] = []
    for expiry in expirations[:2]:
        try:
            chain = ticker.option_chain(expiry)
        except Exception:
            continue

        for df, ctype in [(chain.calls, "call"), (chain.puts, "put")]:
            for _, row in df.iterrows():
                vol = int(row.get("volume") or 0)
                oi  = int(row.get("openInterest") or 0)
                if vol < 10:          # skip illiquid contracts
                    continue

                vol_oi = round(vol / oi, 2) if oi > 0 else None
                iv     = row.get("impliedVolatility")
                strike = float(row.get("strike", 0))
                last   = row.get("lastPrice")

                otm_pct: float | None = None
                if current_price and current_price > 0:
                    if ctype == "call":
                        otm_pct = round((strike - current_price) / current_price * 100, 2)
                    else:
                        otm_pct = round((current_price - strike) / current_price * 100, 2)

                rows.append(OptionsFlowRow(
                    symbol        = symbol.upper(),
                    contract_type = ctype,
                    strike        = strike,
                    expiry        = expiry,
                    volume        = vol,
                    open_interest = oi,
                    vol_oi_ratio  = vol_oi,
                    iv            = round(float(iv) * 100, 1) if iv and iv == iv else None,
                    last_price    = float(last) if last and last == last else None,
                    otm_pct       = otm_pct,
                    flag          = _classify(vol, oi, vol_oi),
                ))

    # Sort by volume descending, keep top 20 per symbol
    rows.sort(key=lambda r: r.volume, reverse=True)
    return rows[:20]


def scan_options_flow(symbols: list[str]) -> list[dict]:
    """
    Scan each symbol for unusual options activity.
    Returns flattened list of flow rows sorted by vol_oi_ratio desc.
    """
    all_rows: list[OptionsFlowRow] = []

    for sym in symbols:
        now = time.time()
        if sym in _cache and now - _cache[sym][0] < _TTL:
            all_rows.extend(_cache[sym][1])
            continue

        try:
            ticker = yf.Ticker(sym.upper())
            info   = ticker.fast_info
            price  = getattr(info, "last_price", None)
            rows   = _scan_symbol(sym, price)
            _cache[sym] = (now, rows)
            all_rows.extend(rows)
        except Exception as exc:
            logger.warning(f"[options_flow] {sym}: {exc}")

    # Sort by flag priority then volume
    flag_order = {"sweep": 0, "unusual_vol": 1, "high_oi": 2, "normal": 3}
    all_rows.sort(key=lambda r: (flag_order.get(r.flag, 99), -r.volume))

    return [
        {
            "symbol":        r.symbol,
            "contract_type": r.contract_type,
            "strike":        r.strike,
            "expiry":        r.expiry,
            "volume":        r.volume,
            "open_interest": r.open_interest,
            "vol_oi_ratio":  r.vol_oi_ratio,
            "iv":            r.iv,
            "last_price":    r.last_price,
            "otm_pct":       r.otm_pct,
            "flag":          r.flag,
        }
        for r in all_rows
    ]

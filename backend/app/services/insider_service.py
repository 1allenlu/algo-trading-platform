"""
Insider Transactions Service — Phase 76.

Fetches insider buying/selling activity for a symbol via yfinance.
Returns the 30 most recent transactions with date, insider name,
transaction type, share count, and approximate value.

Cached 2 hours per symbol (insider data rarely updates intraday).
"""
from __future__ import annotations

import time
import math
from typing import Any

import yfinance as yf
from loguru import logger

_CACHE: dict[str, tuple[float, list[dict]]] = {}
_TTL = 2 * 3600  # 2 hours


def get_insider_transactions(symbol: str, limit: int = 30) -> list[dict]:
    """
    Return recent insider transactions for a symbol.

    Each row:
        date        str   YYYY-MM-DD
        insider     str   Name of the insider
        relation    str   CEO, Director, 10% Owner, etc.
        transaction str   Buy / Sale / Sale (Auto)
        shares      int   Number of shares traded
        value       float | None  Approximate USD value
        is_buy      bool  True if this was a purchase
    """
    sym = symbol.upper()
    now = time.time()
    if sym in _CACHE and now - _CACHE[sym][0] < _TTL:
        return _CACHE[sym][1]

    result: list[dict] = []
    try:
        ticker = yf.Ticker(sym)
        df = ticker.insider_transactions
        if df is None or df.empty:
            _CACHE[sym] = (now, result)
            return result

        df = df.reset_index(drop=True)

        for _, row in df.iterrows():
            try:
                # Column names differ slightly between yfinance versions
                date_val  = row.get("Start Date") or row.get("Date") or ""
                insider   = str(row.get("Insider Trading") or row.get("Insider") or "Unknown")
                relation  = str(row.get("Relationship") or row.get("Relation") or "")
                tx_type   = str(row.get("Transaction") or "")
                shares_v  = row.get("Shares") or 0
                value_v   = row.get("Value")

                date_str = str(date_val)[:10] if date_val else ""
                try:
                    shares = int(float(shares_v))
                except (TypeError, ValueError):
                    shares = 0

                value_f: float | None = None
                try:
                    v = float(value_v)  # type: ignore[arg-type]
                    if not math.isnan(v):
                        value_f = round(v, 0)
                except (TypeError, ValueError):
                    pass

                is_buy = "buy" in tx_type.lower() or "purchase" in tx_type.lower()

                result.append({
                    "date":        date_str,
                    "insider":     insider,
                    "relation":    relation,
                    "transaction": tx_type,
                    "shares":      shares,
                    "value":       value_f,
                    "is_buy":      is_buy,
                })
            except Exception:
                continue

        result = result[:limit]
    except Exception as exc:
        logger.warning(f"[insider] {sym} failed: {exc}")

    _CACHE[sym] = (now, result)
    return result

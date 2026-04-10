"""
Market Breadth Service — Phase 74.

Computes aggregate breadth metrics from a fixed universe of ~35 liquid names
and the 11 SPDR sector ETFs.

Metrics returned:
  • advance / decline / unchanged counts + A/D ratio
  • % of universe trading above SMA-50 / SMA-200
  • 52-week new-high and new-low counts
  • RSI distribution: overbought (≥70) / neutral / oversold (≤30)
  • Sector heatmap: 1d / 5d / 1mo returns + RSI + vs SMA-50

Results cached 30 min — breadth changes slowly during market hours.
"""
from __future__ import annotations

import time
from typing import Optional

import numpy as np
import yfinance as yf
from loguru import logger

_CACHE: dict[str, tuple[float, dict]] = {}
_TTL = 30 * 60  # 30 minutes

SECTOR_ETFS: dict[str, str] = {
    "Technology":        "XLK",
    "Financials":        "XLF",
    "Healthcare":        "XLV",
    "Consumer Disc.":    "XLY",
    "Consumer Staples":  "XLP",
    "Energy":            "XLE",
    "Industrials":       "XLI",
    "Materials":         "XLB",
    "Utilities":         "XLU",
    "Real Estate":       "XLRE",
    "Communication":     "XLC",
}

BREADTH_UNIVERSE: list[str] = (
    "SPY QQQ IWM DIA "
    "AAPL MSFT NVDA AMZN GOOGL META TSLA BRK-B JPM V "
    "UNH JNJ XOM WMT PG MA HD CVX MRK LLY "
    "ABBV PEP KO COST BAC AVGO AMD ORCL CRM"
).split()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _rsi(closes: np.ndarray, period: int = 14) -> Optional[float]:
    if len(closes) < period + 1:
        return None
    deltas = np.diff(closes.astype(float))
    gains  = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    avg_g = float(gains[:period].mean())
    avg_l = float(losses[:period].mean())
    for g, l_val in zip(gains[period:], losses[period:]):
        avg_g = (avg_g * (period - 1) + float(g)) / period
        avg_l = (avg_l * (period - 1) + float(l_val)) / period
    if avg_l == 0:
        return 100.0
    return round(100 - 100 / (1 + avg_g / avg_l), 2)


# ── Sector fetch ──────────────────────────────────────────────────────────────

def _fetch_sectors() -> list[dict]:
    etf_list = list(SECTOR_ETFS.values())
    rows: list[dict] = []
    try:
        raw = yf.download(etf_list, period="3mo", auto_adjust=True, progress=False, threads=True)
        # Handle multi-index columns from yfinance ≥ 0.2
        if isinstance(raw.columns, type(raw.columns)) and hasattr(raw.columns, "levels"):
            closes_df = raw["Close"]
        else:
            closes_df = raw

        for name, sym in SECTOR_ETFS.items():
            try:
                col = closes_df[sym] if sym in closes_df.columns else None
                if col is None:
                    continue
                closes = col.dropna().values
                if len(closes) < 2:
                    continue
                rows.append({
                    "name":     name,
                    "symbol":   sym,
                    "ret_1d":   round((closes[-1] / closes[-2] - 1) * 100, 2) if len(closes) >= 2 else None,
                    "ret_5d":   round((closes[-1] / closes[-6] - 1) * 100, 2) if len(closes) >= 6 else None,
                    "ret_1mo":  round((closes[-1] / closes[-22] - 1) * 100, 2) if len(closes) >= 22 else None,
                    "rsi":      _rsi(closes[-60:]) if len(closes) >= 15 else None,
                    "vs_sma50": round(
                        (closes[-1] / float(np.mean(closes[-50:])) - 1) * 100, 2
                    ) if len(closes) >= 50 else None,
                })
            except Exception:
                continue
    except Exception as exc:
        logger.warning(f"[breadth] sector download failed: {exc}")
    return rows


# ── Breadth universe fetch ────────────────────────────────────────────────────

def _fetch_breadth() -> dict:
    advance = decline = unchanged = total = 0
    above_50 = above_200 = new_h = new_l = 0
    ob = os_ = neu = 0
    rsi_list: list[float] = []

    try:
        raw = yf.download(
            BREADTH_UNIVERSE, period="1y", auto_adjust=True, progress=False, threads=True
        )
        if hasattr(raw.columns, "levels"):
            closes_df = raw["Close"]
        else:
            closes_df = raw

        for sym in BREADTH_UNIVERSE:
            try:
                col = closes_df[sym] if sym in closes_df.columns else None
                if col is None:
                    continue
                closes = col.dropna().values
                if len(closes) < 2:
                    continue
                total += 1
                ret = closes[-1] / closes[-2] - 1
                if ret > 0.001:
                    advance += 1
                elif ret < -0.001:
                    decline += 1
                else:
                    unchanged += 1

                if len(closes) >= 50 and closes[-1] > float(np.mean(closes[-50:])):
                    above_50 += 1
                if len(closes) >= 200 and closes[-1] > float(np.mean(closes[-200:])):
                    above_200 += 1

                if len(closes) >= 252:
                    h52 = float(closes[-252:].max())
                    l52 = float(closes[-252:].min())
                    if closes[-1] >= h52 * 0.98:
                        new_h += 1
                    if closes[-1] <= l52 * 1.02:
                        new_l += 1

                r = _rsi(closes[-60:]) if len(closes) >= 15 else None
                if r is not None:
                    rsi_list.append(r)
                    if r >= 70:
                        ob += 1
                    elif r <= 30:
                        os_ += 1
                    else:
                        neu += 1
            except Exception:
                continue
    except Exception as exc:
        logger.warning(f"[breadth] universe download failed: {exc}")

    denom = max(total, 1)
    return {
        "advance":          advance,
        "decline":          decline,
        "unchanged":        unchanged,
        "adv_dec_ratio":    round(advance / max(decline, 1), 2),
        "pct_above_sma50":  round(above_50  / denom * 100, 1),
        "pct_above_sma200": round(above_200 / denom * 100, 1),
        "new_highs":        new_h,
        "new_lows":         new_l,
        "rsi_overbought":   ob,
        "rsi_oversold":     os_,
        "rsi_neutral":      neu,
        "avg_rsi":          round(float(np.mean(rsi_list)), 1) if rsi_list else 50.0,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def get_breadth_snapshot() -> dict:
    """Return full breadth snapshot (cached 30 min)."""
    key = "breadth_snapshot"
    now = time.time()
    if key in _CACHE and now - _CACHE[key][0] < _TTL:
        return _CACHE[key][1]

    result = {**_fetch_breadth(), "sectors": _fetch_sectors()}
    _CACHE[key] = (now, result)
    return result

"""
Anomaly Detection Service — Phase 73.

Scans a watchlist for statistically unusual price and volume behaviour:
  - Volume spike  : today's volume > N × 20-day average
  - Price gap up  : open > prev_close × (1 + threshold)
  - Price gap down: open < prev_close × (1 - threshold)
  - RSI extreme   : RSI > 80 (overbought) or RSI < 20 (oversold)
  - Large move    : |daily change| > threshold %

Data sourced from yfinance 1-month history.
Cached per symbol for 30 minutes.

Public functions:
  scan_anomalies(symbols, vol_multiplier, gap_pct, rsi_hi, rsi_lo, move_pct)
  → list[AnomalyRow]
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

import yfinance as yf
from loguru import logger

_cache: dict[str, tuple[float, list]] = {}
_TTL = 30 * 60


@dataclass
class AnomalyRow:
    symbol:          str
    price:           float | None
    change_pct:      float | None
    volume:          int   | None
    avg_volume_20:   float | None
    volume_ratio:    float | None
    rsi_14:          float | None
    gap_pct:         float | None    # open vs prev close
    anomalies:       list[str]       # list of triggered flags
    severity:        str             # "critical" | "warning" | "info"


def _calc_rsi(closes: list[float], period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        delta = closes[i] - closes[i - 1]
        gains.append(max(delta, 0))
        losses.append(max(-delta, 0))
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 1)


def _scan_symbol(
    symbol: str,
    vol_multiplier: float,
    gap_pct:        float,
    rsi_hi:         float,
    rsi_lo:         float,
    move_pct:       float,
) -> AnomalyRow | None:
    try:
        df = yf.download(symbol.upper(), period="2mo", progress=False, auto_adjust=True)
        if df is None or len(df) < 22:
            return None

        closes  = df["Close"].dropna().tolist()
        volumes = df["Volume"].dropna().tolist()
        opens   = df["Open"].dropna().tolist()

        # Flatten in case yfinance returns multi-index columns
        if hasattr(closes[0], '__len__'):
            closes  = [float(c[0]) if hasattr(c, '__len__') else float(c) for c in closes]
            volumes = [int(v[0])   if hasattr(v, '__len__') else int(v)   for v in volumes]
            opens   = [float(o[0]) if hasattr(o, '__len__') else float(o) for o in opens]

        price      = closes[-1]
        today_vol  = volumes[-1]
        today_open = opens[-1]
        prev_close = closes[-2] if len(closes) >= 2 else price

        avg_vol_20 = sum(volumes[-21:-1]) / 20 if len(volumes) >= 21 else None
        vol_ratio  = round(today_vol / avg_vol_20, 2) if avg_vol_20 and avg_vol_20 > 0 else None
        change_pct = round((price - prev_close) / prev_close * 100, 2) if prev_close else None
        gap        = round((today_open - prev_close) / prev_close * 100, 2) if prev_close else None
        rsi        = _calc_rsi(closes)

        flags: list[str] = []

        if vol_ratio is not None and vol_ratio > vol_multiplier:
            flags.append(f"Volume spike {vol_ratio:.1f}× avg")
        if gap is not None and gap > gap_pct:
            flags.append(f"Gap up +{gap:.1f}%")
        if gap is not None and gap < -gap_pct:
            flags.append(f"Gap down {gap:.1f}%")
        if rsi is not None and rsi > rsi_hi:
            flags.append(f"RSI overbought ({rsi:.0f})")
        if rsi is not None and rsi < rsi_lo:
            flags.append(f"RSI oversold ({rsi:.0f})")
        if change_pct is not None and abs(change_pct) > move_pct:
            sign = "+" if change_pct > 0 else ""
            flags.append(f"Large move {sign}{change_pct:.1f}%")

        if not flags:
            return None

        # Severity: critical if 2+ flags or extreme values
        severity = "info"
        if len(flags) >= 2:
            severity = "critical"
        elif (vol_ratio or 0) > 5 or abs(change_pct or 0) > 7:
            severity = "warning"
        else:
            severity = "info"

        return AnomalyRow(
            symbol        = symbol.upper(),
            price         = round(price, 2),
            change_pct    = change_pct,
            volume        = today_vol,
            avg_volume_20 = round(avg_vol_20, 0) if avg_vol_20 else None,
            volume_ratio  = vol_ratio,
            rsi_14        = rsi,
            gap_pct       = gap,
            anomalies     = flags,
            severity      = severity,
        )

    except Exception as exc:
        logger.warning(f"[anomaly] {symbol}: {exc}")
        return None


def scan_anomalies(
    symbols:        list[str],
    vol_multiplier: float = 2.5,
    gap_pct:        float = 3.0,
    rsi_hi:         float = 80.0,
    rsi_lo:         float = 20.0,
    move_pct:       float = 5.0,
) -> list[dict]:
    """
    Scan symbols for anomalies. Returns only symbols with at least one flag.
    Results sorted by severity (critical first) then absolute change_pct.
    """
    results: list[AnomalyRow] = []

    for sym in symbols:
        now = time.time()
        if sym in _cache and now - _cache[sym][0] < _TTL:
            if _cache[sym][1]:
                results.extend(_cache[sym][1])
            continue

        row = _scan_symbol(sym, vol_multiplier, gap_pct, rsi_hi, rsi_lo, move_pct)
        cached = [row] if row else []
        _cache[sym] = (now, cached)
        if row:
            results.append(row)

    sev_order = {"critical": 0, "warning": 1, "info": 2}
    results.sort(key=lambda r: (sev_order.get(r.severity, 9), -abs(r.change_pct or 0)))

    return [
        {
            "symbol":        r.symbol,
            "price":         r.price,
            "change_pct":    r.change_pct,
            "volume":        r.volume,
            "avg_volume_20": r.avg_volume_20,
            "volume_ratio":  r.volume_ratio,
            "rsi_14":        r.rsi_14,
            "gap_pct":       r.gap_pct,
            "anomalies":     r.anomalies,
            "severity":      r.severity,
        }
        for r in results
    ]

"""
Scanner Service — Phase 11.

Computes a technical indicator snapshot for every symbol in the database
and filters/sorts by user-supplied criteria.

Supported filter criteria (all optional):
    rsi_max           — RSI(14) <= value  (e.g. 30 → oversold)
    rsi_min           — RSI(14) >= value  (e.g. 70 → overbought)
    price_above_sma50  — close > SMA(50)
    price_below_sma50  — close < SMA(50)
    price_above_sma200 — close > SMA(200)
    price_below_sma200 — close < SMA(200)
    volume_ratio_min  — volume / 20-day avg volume >= value (1.5 = spike)
    change_pct_min    — daily % change >= value (e.g. -5.0)
    change_pct_max    — daily % change <= value (e.g. +5.0)
    near_52w_high_pct — within X% of 52-week high (momentum screen)
    near_52w_low_pct  — within X% of 52-week low (contrarian screen)
    symbols           — restrict scan to this list (None = all DB symbols)

All computation is pure Python — no pandas / numpy needed.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import MarketData


# ── Technical helpers (pure Python) ───────────────────────────────────────────

def _rsi(closes: list[float], period: int = 14) -> float:
    """
    Wilder-smoothed RSI.
    Returns 50.0 (neutral) when there are fewer bars than `period + 1`.
    """
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(d, 0.0)   for d in deltas]
    losses = [abs(min(d, 0.0)) for d in deltas]
    # Seed with a simple average over the first `period` deltas
    avg_g = sum(gains[:period])  / period
    avg_l = sum(losses[:period]) / period
    # Wilder's smoothing for the remainder
    for i in range(period, len(deltas)):
        avg_g = (avg_g * (period - 1) + gains[i])  / period
        avg_l = (avg_l * (period - 1) + losses[i]) / period
    if avg_l == 0:
        return 100.0
    return 100.0 - (100.0 / (1.0 + avg_g / avg_l))


def _sma(closes: list[float], period: int) -> float | None:
    """Simple moving average of the last `period` closes. None if not enough data."""
    if len(closes) < period:
        return None
    return sum(closes[-period:]) / period


# ── Snapshot dataclass ─────────────────────────────────────────────────────────

@dataclass
class SymbolSnapshot:
    symbol:         str
    price:          float
    change_pct:     float         # (close – prev_close) / prev_close × 100
    rsi_14:         float         # Wilder RSI(14)
    sma_20:         float | None
    sma_50:         float | None
    sma_200:        float | None
    vs_sma50:       float | None  # (close / sma50 - 1) as fraction
    vs_sma200:      float | None  # (close / sma200 - 1) as fraction
    volume:         int
    avg_volume_20:  float | None  # 20-day average volume (excluding today)
    volume_ratio:   float | None  # volume / avg_volume_20
    high_52w:       float
    low_52w:        float
    vs_52w_high:    float         # (high_52w - price) / high_52w  [0 = AT high]
    vs_52w_low:     float         # (price - low_52w)  / low_52w   [0 = AT low]
    bar_count:      int


def _compute_snapshot(symbol: str, bars: list[Any]) -> SymbolSnapshot | None:
    """
    Build a SymbolSnapshot from a list of MarketData ORM rows (sorted asc by timestamp).
    Returns None if fewer than 2 bars exist.
    """
    if len(bars) < 2:
        return None

    closes  = [float(b.close)  for b in bars]
    volumes = [int(b.volume)   for b in bars]

    price      = closes[-1]
    prev_close = closes[-2]
    change_pct = (price - prev_close) / prev_close * 100.0 if prev_close > 0 else 0.0

    rsi    = _rsi(closes)
    sma20  = _sma(closes, 20)
    sma50  = _sma(closes, 50)
    sma200 = _sma(closes, 200)

    vs_sma50  = (price / sma50  - 1.0) if sma50  else None
    vs_sma200 = (price / sma200 - 1.0) if sma200 else None

    volume = volumes[-1]
    # Use the 20 bars *before* today for avg volume (excludes current bar)
    prev_vols = volumes[-21:-1] if len(volumes) >= 21 else volumes[:-1]
    avg_vol20 = sum(prev_vols) / len(prev_vols) if prev_vols else None
    vol_ratio = volume / avg_vol20 if (avg_vol20 and avg_vol20 > 0) else None

    # 52-week = up to last 252 trading days
    window = bars[-252:]
    high_52w = max(float(b.high) for b in window)
    low_52w  = min(float(b.low)  for b in window)
    vs_52w_high = (high_52w - price) / high_52w if high_52w > 0 else 0.0
    vs_52w_low  = (price - low_52w)  / low_52w  if low_52w  > 0 else 0.0

    return SymbolSnapshot(
        symbol=symbol,
        price=price,
        change_pct=change_pct,
        rsi_14=rsi,
        sma_20=sma20,
        sma_50=sma50,
        sma_200=sma200,
        vs_sma50=vs_sma50,
        vs_sma200=vs_sma200,
        volume=volume,
        avg_volume_20=avg_vol20,
        volume_ratio=vol_ratio,
        high_52w=high_52w,
        low_52w=low_52w,
        vs_52w_high=vs_52w_high,
        vs_52w_low=vs_52w_low,
        bar_count=len(bars),
    )


# ── Criteria dataclass ─────────────────────────────────────────────────────────

@dataclass
class ScanCriteria:
    # RSI filters
    rsi_max:           float | None = None
    rsi_min:           float | None = None
    # Moving-average relationship
    price_above_sma50:  bool = False
    price_below_sma50:  bool = False
    price_above_sma200: bool = False
    price_below_sma200: bool = False
    # Volume
    volume_ratio_min:  float | None = None
    # Daily change
    change_pct_min:    float | None = None
    change_pct_max:    float | None = None
    # 52-week proximity (as %)
    near_52w_high_pct: float | None = None
    near_52w_low_pct:  float | None = None
    # Scope
    symbols:           list[str] | None = None
    # Sort
    sort_by:   str  = "symbol"  # symbol|rsi|change_pct|volume_ratio|vs_sma50|vs_sma200
    sort_desc: bool = False


def _passes(snap: SymbolSnapshot, c: ScanCriteria) -> bool:
    """Return True iff the snapshot satisfies every active filter."""
    if c.rsi_max is not None and snap.rsi_14 > c.rsi_max:
        return False
    if c.rsi_min is not None and snap.rsi_14 < c.rsi_min:
        return False
    if c.price_above_sma50  and (snap.vs_sma50 is None or snap.vs_sma50 <= 0):
        return False
    if c.price_below_sma50  and (snap.vs_sma50 is None or snap.vs_sma50 >= 0):
        return False
    if c.price_above_sma200 and (snap.vs_sma200 is None or snap.vs_sma200 <= 0):
        return False
    if c.price_below_sma200 and (snap.vs_sma200 is None or snap.vs_sma200 >= 0):
        return False
    if c.volume_ratio_min is not None and (snap.volume_ratio is None or snap.volume_ratio < c.volume_ratio_min):
        return False
    if c.change_pct_min is not None and snap.change_pct < c.change_pct_min:
        return False
    if c.change_pct_max is not None and snap.change_pct > c.change_pct_max:
        return False
    # near_52w_high_pct: vs_52w_high is the *gap* from high as a fraction
    # within 5% of 52w high → gap <= 0.05
    if c.near_52w_high_pct is not None and snap.vs_52w_high * 100 > c.near_52w_high_pct:
        return False
    if c.near_52w_low_pct  is not None and snap.vs_52w_low  * 100 > c.near_52w_low_pct:
        return False
    return True


_SORT_KEYS: dict[str, Any] = {
    "symbol":       lambda s: s.symbol,
    "rsi":          lambda s: s.rsi_14,
    "change_pct":   lambda s: s.change_pct,
    "volume_ratio": lambda s: (s.volume_ratio or 0.0),
    "vs_sma50":     lambda s: (s.vs_sma50  or 0.0),
    "vs_sma200":    lambda s: (s.vs_sma200 or 0.0),
}


# ── Public API ─────────────────────────────────────────────────────────────────

async def get_symbols(session: AsyncSession) -> list[str]:
    """Return all distinct symbols in the market_data table, sorted alphabetically."""
    rows = await session.execute(
        select(MarketData.symbol).distinct().order_by(MarketData.symbol)
    )
    return [r[0] for r in rows]


async def run_scan(session: AsyncSession, criteria: ScanCriteria) -> list[dict]:
    """
    Load market data, compute snapshots, apply filter criteria, sort, and return.

    All target symbols are fetched in a single DB query.
    Snapshots that don't pass any one filter are excluded.
    Returns a list of JSON-serializable dicts.
    """
    target = criteria.symbols or await get_symbols(session)
    if not target:
        return []

    # Single query for all bars — more efficient than N queries
    rows = (await session.scalars(
        select(MarketData)
        .where(MarketData.symbol.in_([s.upper() for s in target]))
        .order_by(MarketData.symbol, MarketData.timestamp.asc())
    )).all()

    # Group rows by symbol while preserving asc order
    by_symbol: dict[str, list] = {}
    for r in rows:
        by_symbol.setdefault(r.symbol, []).append(r)

    snapshots: list[SymbolSnapshot] = []
    for sym, bars in by_symbol.items():
        snap = _compute_snapshot(sym, bars)
        if snap and _passes(snap, criteria):
            snapshots.append(snap)

    key_fn = _SORT_KEYS.get(criteria.sort_by, _SORT_KEYS["symbol"])
    snapshots.sort(key=key_fn, reverse=criteria.sort_desc)

    def _serialize(snap: SymbolSnapshot) -> dict:
        d = asdict(snap)
        # Guard against float NaN / Inf (JSON-unsafe)
        for k, v in d.items():
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                d[k] = None
        return d

    return [_serialize(s) for s in snapshots]

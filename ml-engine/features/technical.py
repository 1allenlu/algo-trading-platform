"""
Technical indicator feature engineering — Phase 2.

Computes 40+ indicators from OHLCV data using pure pandas/numpy.
No external TA library required, keeping the dependency footprint minimal.

Indicator groups:
  - Trend:      SMA(20/50/200), EMA(12/26), MACD(12,26,9), ADX(14)
  - Momentum:   RSI(14), ROC(10), Williams %R(14), Stochastic(14)
  - Volatility: Bollinger Bands(20,2), ATR(14), Historical Vol(20/60d)
  - Volume:     OBV, Volume Z-score, Volume/SMA ratio
  - Returns:    1d, 5d, 20d, 60d log-returns + lag features

All functions operate on a DataFrame with columns:
  open, high, low, close, volume (lowercase)
"""

from __future__ import annotations

import numpy as np
import pandas as pd


# ── Trend indicators ──────────────────────────────────────────────────────────

def sma(close: pd.Series, window: int) -> pd.Series:
    return close.rolling(window, min_periods=window).mean()


def ema(close: pd.Series, span: int) -> pd.Series:
    return close.ewm(span=span, adjust=False).mean()


def macd(close: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series]:
    """MACD line, signal line, histogram (12-26-9)."""
    fast   = ema(close, 12)
    slow   = ema(close, 26)
    line   = fast - slow
    signal = line.ewm(span=9, adjust=False).mean()
    hist   = line - signal
    return line, signal, hist


def adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average Directional Index — trend strength (0-100)."""
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low  - close.shift(1)).abs(),
    ], axis=1).max(axis=1)

    dm_plus  = (high - high.shift(1)).clip(lower=0)
    dm_minus = (low.shift(1) - low).clip(lower=0)
    dm_plus  = dm_plus.where(dm_plus > dm_minus, 0)
    dm_minus = dm_minus.where(dm_minus > dm_plus, 0)

    atr14    = tr.ewm(alpha=1 / period, adjust=False).mean()
    di_plus  = 100 * dm_plus.ewm(alpha=1 / period, adjust=False).mean() / atr14.replace(0, np.nan)
    di_minus = 100 * dm_minus.ewm(alpha=1 / period, adjust=False).mean() / atr14.replace(0, np.nan)

    dx = 100 * (di_plus - di_minus).abs() / (di_plus + di_minus).replace(0, np.nan)
    return dx.ewm(alpha=1 / period, adjust=False).mean()


# ── Momentum indicators ───────────────────────────────────────────────────────

def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index (0-100). >70 = overbought, <30 = oversold."""
    delta = close.diff()
    gain  = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss  = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    rs    = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def roc(close: pd.Series, period: int = 10) -> pd.Series:
    """Rate of Change — % return over `period` bars."""
    return (close / close.shift(period) - 1) * 100


def williams_r(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Williams %R (-100 to 0). <-80 = oversold, >-20 = overbought."""
    highest_high = high.rolling(period).max()
    lowest_low   = low.rolling(period).min()
    return -100 * (highest_high - close) / (highest_high - lowest_low).replace(0, np.nan)


def stochastic_k(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Stochastic %K (0-100)."""
    lowest_low   = low.rolling(period).min()
    highest_high = high.rolling(period).max()
    return 100 * (close - lowest_low) / (highest_high - lowest_low).replace(0, np.nan)


# ── Volatility indicators ─────────────────────────────────────────────────────

def bollinger_bands(
    close: pd.Series, window: int = 20, num_std: float = 2.0
) -> tuple[pd.Series, pd.Series, pd.Series, pd.Series]:
    """
    Returns: upper, middle (SMA), lower, %B
    %B = 0 → at lower band, %B = 1 → at upper band, %B > 1 = above upper.
    """
    mid   = close.rolling(window).mean()
    std   = close.rolling(window).std()
    upper = mid + num_std * std
    lower = mid - num_std * std
    pct_b = (close - lower) / (upper - lower).replace(0, np.nan)
    return upper, mid, lower, pct_b


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average True Range — raw volatility in price units."""
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low  - close.shift(1)).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False).mean()


def historical_volatility(close: pd.Series, window: int = 20) -> pd.Series:
    """Annualized historical volatility (rolling std of log returns × sqrt(252))."""
    log_ret = np.log(close / close.shift(1))
    return log_ret.rolling(window).std() * np.sqrt(252)


# ── Volume indicators ─────────────────────────────────────────────────────────

def obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    """On-Balance Volume — cumulative volume signed by price direction."""
    direction = np.sign(close.diff()).fillna(0)
    return (direction * volume).cumsum()


def volume_sma_ratio(volume: pd.Series, window: int = 20) -> pd.Series:
    """Volume / SMA(volume) — today's volume vs recent average."""
    return volume / volume.rolling(window).mean()


def volume_zscore(volume: pd.Series, window: int = 20) -> pd.Series:
    """Z-score of volume within a rolling window."""
    mean = volume.rolling(window).mean()
    std  = volume.rolling(window).std()
    return (volume - mean) / std.replace(0, np.nan)


# ── Return features ───────────────────────────────────────────────────────────

def log_return(close: pd.Series, period: int = 1) -> pd.Series:
    """Log return over `period` trading days."""
    return np.log(close / close.shift(period))


# ── Main feature builder ──────────────────────────────────────────────────────

def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute all technical features for a single-symbol OHLCV DataFrame.

    Input:
        df — DataFrame with columns [open, high, low, close, volume],
             indexed by timestamp in ascending chronological order.

    Output:
        DataFrame with 42 feature columns + 'target' column.
        NaN rows (indicator warm-up period, ~200 rows) are dropped.
        Last row is also dropped because target = next-day direction
        (no target available for the most recent bar).

    Target definition:
        target = 1  if tomorrow's close > today's close  (up)
        target = 0  otherwise                            (down / flat)

    Feature engineering philosophy:
        - All features are computed from past data only (no lookahead).
        - Raw prices (SMA, BB bands) are kept as-is; the model handles scaling.
        - Ratio features (price_sma20_ratio) are scale-invariant.
    """
    feat = pd.DataFrame(index=df.index)

    c  = df["close"]
    h  = df["high"]
    lo = df["low"]
    v  = df["volume"]

    # ── Trend ──────────────────────────────────────────────────────────────────
    feat["sma_20"]  = sma(c, 20)
    feat["sma_50"]  = sma(c, 50)
    feat["sma_200"] = sma(c, 200)
    feat["ema_12"]  = ema(c, 12)
    feat["ema_26"]  = ema(c, 26)

    # Price position relative to MAs (scale-invariant)
    feat["price_sma20_ratio"]  = c / feat["sma_20"]  - 1
    feat["price_sma50_ratio"]  = c / feat["sma_50"]  - 1
    feat["price_sma200_ratio"] = c / feat["sma_200"] - 1
    feat["sma20_sma50_ratio"]  = feat["sma_20"] / feat["sma_50"] - 1  # Golden / death cross

    # MACD
    macd_line, macd_sig, macd_hist = macd(c)
    feat["macd_line"]   = macd_line
    feat["macd_signal"] = macd_sig
    feat["macd_hist"]   = macd_hist

    # ADX — trend strength (tree models benefit from raw value)
    feat["adx"] = adx(h, lo, c, 14)

    # ── Momentum ───────────────────────────────────────────────────────────────
    feat["rsi_14"]     = rsi(c, 14)
    feat["roc_10"]     = roc(c, 10)
    feat["williams_r"] = williams_r(h, lo, c, 14)
    feat["stoch_k"]    = stochastic_k(h, lo, c, 14)
    feat["stoch_d"]    = feat["stoch_k"].rolling(3).mean()   # Smoothed = %D
    feat["rsi_norm"]   = (feat["rsi_14"] - 50) / 50          # Centered around 0

    # ── Volatility ─────────────────────────────────────────────────────────────
    bb_upper, bb_mid, bb_lower, bb_pct = bollinger_bands(c, 20, 2.0)
    feat["bb_pct_b"]   = bb_pct                               # Position within bands
    feat["bb_width"]   = (bb_upper - bb_lower) / bb_mid.replace(0, np.nan)

    feat["atr_14"]     = atr(h, lo, c, 14)
    feat["atr_pct"]    = feat["atr_14"] / c                   # ATR as % of price
    feat["hist_vol_20"] = historical_volatility(c, 20)
    feat["hist_vol_60"] = historical_volatility(c, 60)

    # ── Volume ─────────────────────────────────────────────────────────────────
    feat["obv"]          = obv(c, v)
    feat["vol_sma_ratio"] = volume_sma_ratio(v, 20)
    feat["vol_zscore"]    = volume_zscore(v, 20)
    obv_series            = feat["obv"]
    feat["obv_ratio"]     = obv_series / sma(obv_series, 20).replace(0, np.nan) - 1

    # ── Return features ────────────────────────────────────────────────────────
    feat["ret_1d"]  = log_return(c, 1)
    feat["ret_5d"]  = log_return(c, 5)
    feat["ret_20d"] = log_return(c, 20)
    feat["ret_60d"] = log_return(c, 60)

    # Lagged returns — past signals for predicting future
    feat["ret_1d_lag1"] = feat["ret_1d"].shift(1)
    feat["ret_1d_lag2"] = feat["ret_1d"].shift(2)
    feat["ret_1d_lag3"] = feat["ret_1d"].shift(3)
    feat["ret_5d_lag1"] = feat["ret_5d"].shift(5)

    # ── Candlestick / price structure ─────────────────────────────────────────
    feat["hl_range_pct"]    = (h - lo) / c                    # Day range as % of close
    feat["close_position"]  = (c - lo) / (h - lo).replace(0, np.nan)  # Where close sits in day's range

    # ── Target ────────────────────────────────────────────────────────────────
    # shift(-1): align tomorrow's return with today's features.
    # This row is then dropped in dropna() below.
    next_ret = log_return(c, 1).shift(-1)
    feat["target"] = (next_ret > 0).astype(int)

    # Drop NaN rows (indicator warm-up + last row with no target)
    feat = feat.dropna()

    return feat


# ── Canonical feature column order ───────────────────────────────────────────
# Used by models to ensure consistent column ordering across train / predict.

FEATURE_COLUMNS: list[str] = [
    # Trend
    "sma_20", "sma_50", "sma_200", "ema_12", "ema_26",
    "price_sma20_ratio", "price_sma50_ratio", "price_sma200_ratio", "sma20_sma50_ratio",
    "macd_line", "macd_signal", "macd_hist", "adx",
    # Momentum
    "rsi_14", "roc_10", "williams_r", "stoch_k", "stoch_d", "rsi_norm",
    # Volatility
    "bb_pct_b", "bb_width",
    "atr_14", "atr_pct", "hist_vol_20", "hist_vol_60",
    # Volume
    "obv", "vol_sma_ratio", "vol_zscore", "obv_ratio",
    # Returns
    "ret_1d", "ret_5d", "ret_20d", "ret_60d",
    "ret_1d_lag1", "ret_1d_lag2", "ret_1d_lag3", "ret_5d_lag1",
    # Price structure
    "hl_range_pct", "close_position",
]

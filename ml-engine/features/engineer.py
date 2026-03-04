"""
Feature engineering pipeline — Phase 2.

Orchestrates the full pipeline:
  1. Load OHLCV bars from TimescaleDB (or from a pandas DataFrame)
  2. Apply technical.compute_features()
  3. Return train/test splits with proper chronological ordering

Walk-forward validation (no lookahead bias):
  - All splits are strictly chronological
  - Test data is always AFTER training data
  - No shuffling

Usage (standalone):
    python -m ml_engine.features.engineer --symbol SPY --database-url postgresql://...

Usage (library):
    from ml_engine.features.engineer import load_features
    X_train, X_test, y_train, y_test = load_features("SPY", db_url)
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import asyncpg
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

from ml_engine.features.technical import FEATURE_COLUMNS, compute_features


# ── Database loader ───────────────────────────────────────────────────────────

async def _fetch_ohlcv_async(symbol: str, db_url: str) -> pd.DataFrame:
    """Load all OHLCV bars for a symbol from PostgreSQL."""
    # asyncpg uses postgresql:// scheme (no +asyncpg suffix)
    pg_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(pg_url)
    try:
        rows = await conn.fetch(
            """
            SELECT timestamp, open, high, low, close, volume
            FROM   market_data
            WHERE  symbol = $1
            ORDER  BY timestamp ASC
            """,
            symbol.upper(),
        )
    finally:
        await conn.close()

    if not rows:
        raise ValueError(f"No market data found for symbol '{symbol}'. Run `make ingest` first.")

    df = pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.set_index("timestamp").sort_index()
    return df


def fetch_ohlcv(symbol: str, db_url: str) -> pd.DataFrame:
    """Synchronous wrapper — only call this from non-async contexts (e.g. scripts)."""
    return asyncio.run(_fetch_ohlcv_async(symbol, db_url))


# ── Feature pipeline ──────────────────────────────────────────────────────────

def build_feature_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute features and return a clean DataFrame.
    Rows with NaN (indicator warm-up) are dropped automatically.
    """
    feat = compute_features(df)
    # Ensure canonical column ordering (important for model consistency)
    X_cols = [c for c in FEATURE_COLUMNS if c in feat.columns]
    return feat[X_cols + ["target"]]


def chronological_split(
    feat: pd.DataFrame,
    test_frac: float = 0.2,
    val_frac: float = 0.0,
) -> tuple:
    """
    Split feature DataFrame chronologically (no shuffling).

    Returns:
        If val_frac > 0: (X_train, X_val, X_test, y_train, y_val, y_test)
        If val_frac == 0: (X_train, X_test, y_train, y_test)

    Example with 1000 rows, test=0.2, val=0.1:
        train: rows 0–699   (70%)
        val:   rows 700–799 (10%)
        test:  rows 800–999 (20%)
    """
    n = len(feat)
    n_test = int(n * test_frac)
    n_val  = int(n * val_frac)
    n_train = n - n_test - n_val

    X = feat.drop(columns=["target"]).values
    y = feat["target"].values

    X_train = X[:n_train]
    y_train = y[:n_train]

    if val_frac > 0:
        X_val = X[n_train: n_train + n_val]
        y_val = y[n_train: n_train + n_val]
        X_test = X[n_train + n_val:]
        y_test = y[n_train + n_val:]
        return X_train, X_val, X_test, y_train, y_val, y_test
    else:
        X_test = X[n_train:]
        y_test = y[n_train:]
        return X_train, X_test, y_train, y_test


def scale_features(
    X_train: np.ndarray,
    X_test: np.ndarray,
    X_val: np.ndarray | None = None,
) -> tuple:
    """
    Fit StandardScaler on training data, apply to val/test.

    IMPORTANT: Scaler is ONLY fit on training data to prevent data leakage.
    The same scaler must be saved and used at prediction time.

    Returns: (X_train_scaled, X_test_scaled, scaler) or
             (X_train_scaled, X_val_scaled, X_test_scaled, scaler)
    """
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)

    if X_val is not None:
        X_val_s = scaler.transform(X_val)
        return X_train_s, X_val_s, X_test_s, scaler

    return X_train_s, X_test_s, scaler


# ── High-level convenience function ──────────────────────────────────────────

async def load_features(
    symbol: str,
    db_url: str,
    test_frac: float = 0.2,
    scale: bool = True,
) -> dict:
    """
    End-to-end feature loading + splitting (async — awaits DB fetch).

    Returns a dict with:
        X_train, X_test, y_train, y_test  — numpy arrays
        feature_names                     — list of feature column names
        scaler                            — fitted StandardScaler (or None)
        feat_df                           — full feature DataFrame (for inspection)
        n_samples                         — total usable samples
        train_end_date                    — last date in training set (for walk-forward)
    """
    ohlcv = await _fetch_ohlcv_async(symbol, db_url)
    feat  = build_feature_matrix(ohlcv)
    feature_names = [c for c in FEATURE_COLUMNS if c in feat.columns]

    n = len(feat)
    n_train = n - int(n * test_frac)
    train_end_date = feat.index[n_train - 1]

    X_train, X_test, y_train, y_test = chronological_split(feat, test_frac=test_frac)

    scaler = None
    if scale:
        X_train, X_test, scaler = scale_features(X_train, X_test)

    return {
        "X_train":        X_train,
        "X_test":         X_test,
        "y_train":        y_train,
        "y_test":         y_test,
        "feature_names":  feature_names,
        "scaler":         scaler,
        "feat_df":        feat,
        "n_samples":      n,
        "train_end_date": train_end_date,
    }

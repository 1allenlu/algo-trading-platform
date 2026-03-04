"""
ML training entry point — Phase 2.

Trains an XGBoost (or LSTM) direction classifier for a given symbol and
persists the results to:
  - /data/models/{symbol}_{model_type}_v{version}.joblib  (model artifact)
  - ml_models table in PostgreSQL (metadata + metrics + feature importance)

Usage:
    # Inside Docker:
    python /ml_engine/train.py --symbol SPY --model xgboost

    # With custom DB:
    python /ml_engine/train.py \
        --symbol SPY \
        --model xgboost \
        --database-url postgresql://trading:trading@localhost:5432/trading_db \
        --output-dir /data/models

    # Via Makefile:
    make train symbol=SPY model=xgboost
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import asyncpg

# ── Ensure ml_engine is importable (handles both Docker and local execution) ──
_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR.parent) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR.parent))

from ml_engine.features.engineer import load_features
from ml_engine.models.xgboost_model import train_xgboost


# ── Logging helpers ────────────────────────────────────────────────────────────
def log(msg: str, level: str = "INFO") -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"{ts} | {level:8s} | {msg}", flush=True)

def log_ok(msg: str)   -> None: log(f"✓ {msg}", "OK")
def log_err(msg: str)  -> None: log(f"✗ {msg}", "ERROR")


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _get_next_version(conn: asyncpg.Connection, symbol: str, model_type: str) -> int:
    """Return the next version number for a (symbol, model_type) pair."""
    row = await conn.fetchrow(
        "SELECT MAX(version) as v FROM ml_models WHERE symbol=$1 AND model_type=$2",
        symbol, model_type,
    )
    current = row["v"] if row and row["v"] is not None else 0
    return current + 1


async def _insert_model_record(
    conn:        asyncpg.Connection,
    symbol:      str,
    model_type:  str,
    version:     int,
    accuracy:    float,
    f1_score:    float,
    roc_auc:     float,
    train_samples: int,
    test_samples:  int,
    feature_count: int,
    feature_importance: dict,
    model_path:  str,
    params:      dict,
) -> int:
    """Insert a model record and return its id."""
    row = await conn.fetchrow(
        """
        INSERT INTO ml_models (
            name, symbol, model_type, version,
            accuracy, f1_score, roc_auc,
            train_samples, test_samples, feature_count,
            feature_importance, model_path, params, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id
        """,
        f"{symbol}_{model_type}_v{version}",
        symbol, model_type, version,
        accuracy, f1_score, roc_auc,
        train_samples, test_samples, feature_count,
        json.dumps(feature_importance),
        model_path,
        json.dumps(params),
        datetime.now(tz=timezone.utc),
    )
    return row["id"]


async def _insert_predictions(
    conn:      asyncpg.Connection,
    model_id:  int,
    symbol:    str,
    feat_df,
    clf,
    scaler,
    feature_names: list[str],
) -> int:
    """
    Generate and store predictions for the full feature dataset.

    Predictions are stored so the backend API can serve them without
    running the model at request time.
    """
    import numpy as np

    X_all = feat_df[feature_names].values
    if scaler is not None:
        X_all = scaler.transform(X_all)

    directions, confidences = clf.predict_confidence(X_all)

    records = []
    for i, (ts, row) in enumerate(feat_df.iterrows()):
        records.append((
            symbol,
            model_id,
            ts.to_pydatetime() if hasattr(ts, 'to_pydatetime') else ts,
            "up" if directions[i] == 1 else "down",
            float(confidences[i]),
        ))

    await conn.executemany(
        """
        INSERT INTO ml_predictions (symbol, model_id, timestamp, predicted_dir, confidence, created_at)
        VALUES ($1,$2,$3,$4,$5,NOW())
        ON CONFLICT (symbol, model_id, timestamp) DO UPDATE SET
            predicted_dir = EXCLUDED.predicted_dir,
            confidence    = EXCLUDED.confidence
        """,
        records,
    )
    return len(records)


# ── Main training pipeline ────────────────────────────────────────────────────

async def run_training(
    symbol:     str,
    model_type: str,
    db_url:     str,
    output_dir: Path,
) -> dict:
    """
    Full training pipeline:
      1. Load OHLCV → engineer features
      2. Train model
      3. Save artifact to disk
      4. Write metadata to DB
      5. Generate + store predictions for all dates

    Returns a summary dict.
    """
    log(f"Training {model_type.upper()} for {symbol}")
    log(f"Database: {db_url.split('@')[-1]}")

    # ── 1. Features ───────────────────────────────────────────────────────────
    log("Loading + engineering features...")
    data = await load_features(symbol, db_url, test_frac=0.2, scale=True)
    n = data["n_samples"]
    log_ok(f"{n} usable samples | {len(data['feature_names'])} features")
    log(f"  Train: {len(data['X_train'])} | Test: {len(data['X_test'])}")

    # ── 2. Train ──────────────────────────────────────────────────────────────
    if model_type == "xgboost":
        pg_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(pg_url)
        try:
            version    = await _get_next_version(conn, symbol, model_type)
            model_path = output_dir / f"{symbol}_{model_type}_v{version}.joblib"

            log(f"Training XGBoost (version {version})...")
            clf, metrics = train_xgboost(
                data["X_train"], data["y_train"],
                data["X_test"],  data["y_test"],
                feature_names=data["feature_names"],
                save_path=model_path,
                scaler=data["scaler"],
                verbose=False,
            )

            log_ok(
                f"Accuracy={metrics['accuracy']:.4f} | "
                f"F1={metrics['f1']:.4f} | "
                f"AUC={metrics['roc_auc']:.4f}"
            )

            # ── 3. Write model record ──────────────────────────────────────────
            fi = clf.feature_importance()
            model_id = await _insert_model_record(
                conn,
                symbol=symbol, model_type=model_type, version=version,
                accuracy=metrics["accuracy"], f1_score=metrics["f1"], roc_auc=metrics["roc_auc"],
                train_samples=len(data["X_train"]), test_samples=len(data["X_test"]),
                feature_count=len(data["feature_names"]),
                feature_importance=fi,
                model_path=str(model_path),
                params=clf.params,
            )
            log_ok(f"Model record inserted (id={model_id})")

            # ── 4. Store predictions ───────────────────────────────────────────
            log("Generating and storing predictions for all dates...")
            n_preds = await _insert_predictions(
                conn, model_id, symbol,
                data["feat_df"], clf, data["scaler"], data["feature_names"],
            )
            log_ok(f"{n_preds} predictions stored")

        finally:
            await conn.close()

    elif model_type == "lstm":
        # LSTM training requires PyTorch — delegate to standalone script
        log("LSTM training requires PyTorch. Run ml_engine/train_lstm.py directly.")
        sys.exit(1)
    else:
        log_err(f"Unknown model type: {model_type}. Use 'xgboost' or 'lstm'.")
        sys.exit(1)

    log(f"{'─' * 50}")
    log_ok(f"Training complete for {symbol} ({model_type})")
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train ML direction classifier",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--symbol",       default="SPY",   help="Ticker symbol")
    parser.add_argument("--model",        default="xgboost", choices=["xgboost", "lstm"])
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL", "postgresql://trading:trading@localhost:5432/trading_db"),
    )
    parser.add_argument("--output-dir",   default="/data/models", help="Directory to save model files")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print()
    log("Trading Platform — ML Training")
    log(f"Symbol : {args.symbol}")
    log(f"Model  : {args.model}")
    print()

    asyncio.run(run_training(
        symbol=args.symbol.upper(),
        model_type=args.model,
        db_url=args.database_url,
        output_dir=output_dir,
    ))


if __name__ == "__main__":
    main()

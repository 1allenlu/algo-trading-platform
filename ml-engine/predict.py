"""
Prediction script — Phase 2.

Loads the latest trained model for a symbol and generates predictions
for the most recent N bars.

Usage:
    python /ml_engine/predict.py --symbol SPY --n-bars 5
    python /ml_engine/predict.py --symbol SPY --model-type xgboost
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import asyncpg

_THIS_DIR = Path(__file__).resolve().parent
if str(_THIS_DIR.parent) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR.parent))

from ml_engine.features.engineer import _fetch_ohlcv_async, build_feature_matrix, FEATURE_COLUMNS
from ml_engine.models.xgboost_model import XGBoostDirectionClassifier


def log(msg: str) -> None:
    print(f"{datetime.now().strftime('%H:%M:%S')} | {msg}", flush=True)


async def predict_latest(
    symbol:     str,
    model_type: str,
    n_bars:     int,
    db_url:     str,
) -> list[dict]:
    """
    Load the latest trained model and generate predictions for recent bars.

    Returns a list of dicts: [{date, direction, confidence, is_correct (if known)}]
    """
    pg_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    conn   = await asyncpg.connect(pg_url)

    try:
        # ── Find latest model ──────────────────────────────────────────────────
        row = await conn.fetchrow(
            """
            SELECT id, model_path, feature_importance
            FROM ml_models
            WHERE symbol=$1 AND model_type=$2
            ORDER BY version DESC LIMIT 1
            """,
            symbol, model_type,
        )
        if not row:
            raise ValueError(f"No trained {model_type} model for {symbol}. Run `make train symbol={symbol}`")

        model_path = row["model_path"]
        log(f"Loading model from {model_path}")

        # ── Load model ─────────────────────────────────────────────────────────
        clf, scaler = XGBoostDirectionClassifier.load(model_path)

        # ── Fetch recent OHLCV ─────────────────────────────────────────────────
        ohlcv = await _fetch_ohlcv_async(symbol, db_url)
        feat  = build_feature_matrix(ohlcv)

        feat_cols = [c for c in FEATURE_COLUMNS if c in feat.columns]
        X_recent  = feat[feat_cols].values[-n_bars:]
        dates     = feat.index[-n_bars:]
        targets   = feat["target"].values[-n_bars:]

        if scaler is not None:
            X_recent = scaler.transform(X_recent)

        directions, confidences = clf.predict_confidence(X_recent)

        results = []
        for i, (ts, direction, conf, actual) in enumerate(zip(dates, directions, confidences, targets)):
            results.append({
                "date":       ts.strftime("%Y-%m-%d"),
                "direction":  "up" if direction == 1 else "down",
                "confidence": round(float(conf), 4),
                "actual":     "up" if actual == 1 else "down",
                "correct":    bool(direction == actual),
            })

        log(f"Recent {n_bars} predictions for {symbol} ({model_type}):")
        print()
        print(f"  {'Date':<12} {'Predicted':<10} {'Actual':<10} {'Confidence':<12} {'Correct'}")
        print(f"  {'─' * 55}")
        for r in results:
            tick = "✓" if r["correct"] else "✗"
            print(f"  {r['date']:<12} {r['direction']:<10} {r['actual']:<10} {r['confidence']:<12.4f} {tick}")

        accuracy = sum(r["correct"] for r in results) / len(results)
        print(f"\n  Recent accuracy: {accuracy:.1%} over {n_bars} bars")

        return results

    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate ML predictions for a symbol")
    parser.add_argument("--symbol",      default="SPY")
    parser.add_argument("--model-type",  default="xgboost", choices=["xgboost", "lstm"])
    parser.add_argument("--n-bars",      type=int, default=20, help="Number of recent bars to predict")
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL", "postgresql://trading:trading@localhost:5432/trading_db"),
    )
    args = parser.parse_args()

    print()
    log(f"Prediction | {args.symbol} | {args.model_type}")
    print()

    asyncio.run(predict_latest(
        symbol=args.symbol.upper(),
        model_type=args.model_type,
        n_bars=args.n_bars,
        db_url=args.database_url,
    ))


if __name__ == "__main__":
    main()

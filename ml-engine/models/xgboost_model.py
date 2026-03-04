"""
XGBoost classifier for next-day price direction — Phase 2.

Task: Binary classification
  - Input:  42 technical features (from technical.py)
  - Output: P(up) — probability that tomorrow's close > today's close
  - Label:  1 = up, 0 = down/flat

Design notes:
  - Walk-forward ready: train/test split is always chronological
  - Feature importance via model.feature_importances_ (gain-based)
  - Model + scaler persisted together via joblib
  - MLflow logging is optional (gracefully skipped if not configured)

Typical accuracy on daily stock data: 52-56% (hard problem due to near-random walk).
The edge comes from consistent performance, not high accuracy.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
    roc_auc_score,
)
from xgboost import XGBClassifier


# ── Default hyperparameters ───────────────────────────────────────────────────
# Conservative settings to reduce overfitting on small financial datasets.
# key insight: max_depth=4 and n_estimators=300 with low learning rate
# is generally better than deep trees + few estimators for tabular finance data.

DEFAULT_PARAMS: dict[str, Any] = {
    "n_estimators":      300,
    "max_depth":         4,
    "learning_rate":     0.05,
    "subsample":         0.8,
    "colsample_bytree":  0.8,
    "min_child_weight":  5,    # Regularization: avoid splits on tiny subsets
    "gamma":             0.1,  # Minimum loss reduction for a split
    "reg_alpha":         0.1,  # L1 regularization
    "reg_lambda":        1.0,  # L2 regularization
    "eval_metric":       "logloss",
    "random_state":      42,
    "n_jobs":            -1,   # Use all CPU cores
}


# ── Model class ───────────────────────────────────────────────────────────────

class XGBoostDirectionClassifier:
    """
    Wrapper around XGBClassifier for stock direction prediction.

    Adds:
      - Consistent feature name tracking
      - Feature importance as a sorted dict
      - Save/load with embedded scaler
      - Metrics computation
    """

    def __init__(
        self,
        feature_names: list[str],
        params: dict[str, Any] | None = None,
    ) -> None:
        self.feature_names = feature_names
        self.params = params or DEFAULT_PARAMS
        self.model = XGBClassifier(**self.params)
        self.is_trained = False

    def fit(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray | None = None,
        y_val: np.ndarray | None = None,
        verbose: bool = True,
    ) -> "XGBoostDirectionClassifier":
        """
        Train the model.

        If X_val/y_val provided, uses early stopping (stops if val logloss
        doesn't improve for 30 rounds). This prevents overfitting.
        """
        if X_val is not None and y_val is not None:
            self.model.set_params(early_stopping_rounds=30)
            self.model.fit(
                X_train, y_train,
                eval_set=[(X_val, y_val)],
                verbose=verbose,
            )
        else:
            self.model.fit(X_train, y_train, verbose=verbose)

        self.is_trained = True
        return self

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """Return P(down), P(up) for each sample. Shape: (n, 2)."""
        if not self.is_trained:
            raise RuntimeError("Model not trained. Call .fit() first.")
        return self.model.predict_proba(X)

    def predict(self, X: np.ndarray) -> np.ndarray:
        """Return predicted class (0=down, 1=up) for each sample."""
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)

    def predict_confidence(self, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Return (predicted_direction, confidence_probability).

        confidence = P(predicted_class) — higher is more confident.
        confidence range: [0.5, 1.0] (always >= 0.5 by construction).
        """
        proba = self.predict_proba(X)
        direction = (proba[:, 1] >= 0.5).astype(int)
        # Confidence = max(P(up), P(down)) — always >= 0.5
        confidence = np.where(direction == 1, proba[:, 1], proba[:, 0])
        return direction, confidence

    def evaluate(self, X_test: np.ndarray, y_test: np.ndarray) -> dict[str, float]:
        """
        Compute test metrics.

        Returns dict with: accuracy, f1, roc_auc, up_rate, sample_count
        """
        y_pred  = self.predict(X_test)
        y_proba = self.predict_proba(X_test)[:, 1]

        metrics = {
            "accuracy":     round(accuracy_score(y_test, y_pred), 4),
            "f1":           round(f1_score(y_test, y_pred, zero_division=0), 4),
            "roc_auc":      round(roc_auc_score(y_test, y_proba), 4),
            "up_rate":      round(float(y_test.mean()), 4),   # Base rate (how often market goes up)
            "sample_count": int(len(y_test)),
        }
        return metrics

    def feature_importance(self) -> dict[str, float]:
        """
        Return feature importance scores as a dict, sorted descending.

        XGBoost importance type: 'gain' — average gain when feature is used to split.
        More interpretable than 'weight' (frequency) for variable importance ranking.
        """
        if not self.is_trained:
            return {}

        importances = self.model.feature_importances_
        importance_dict = {
            name: round(float(score), 6)
            for name, score in zip(self.feature_names, importances)
        }
        return dict(sorted(importance_dict.items(), key=lambda x: x[1], reverse=True))

    # ── Persistence ──────────────────────────────────────────────────────────

    def save(self, path: str | Path, scaler=None) -> Path:
        """
        Save model (+ optional scaler) to a .joblib file.

        The scaler trained on features must be saved together with the model
        so that prediction time uses the same normalization.

        Returns the resolved save path.
        """
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        payload = {
            "model":         self.model,
            "feature_names": self.feature_names,
            "params":        self.params,
            "scaler":        scaler,
        }
        joblib.dump(payload, path)
        return path

    @classmethod
    def load(cls, path: str | Path) -> tuple["XGBoostDirectionClassifier", Any]:
        """
        Load a saved model from disk.

        Returns: (XGBoostDirectionClassifier instance, scaler)
        """
        payload = joblib.load(path)
        obj = cls(
            feature_names=payload["feature_names"],
            params=payload["params"],
        )
        obj.model = payload["model"]
        obj.is_trained = True
        return obj, payload.get("scaler")


# ── Convenience training function ─────────────────────────────────────────────

def train_xgboost(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
    feature_names: list[str],
    save_path: str | Path | None = None,
    scaler=None,
    params: dict[str, Any] | None = None,
    verbose: bool = False,
) -> tuple["XGBoostDirectionClassifier", dict[str, float]]:
    """
    Train XGBoost, evaluate, optionally save.

    Returns: (trained_model, metrics_dict)
    """
    clf = XGBoostDirectionClassifier(feature_names=feature_names, params=params)
    clf.fit(X_train, y_train, verbose=verbose)

    metrics = clf.evaluate(X_test, y_test)

    if save_path:
        clf.save(save_path, scaler=scaler)

    return clf, metrics

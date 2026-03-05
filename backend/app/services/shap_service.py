"""
SHAP explainability service — Phase 6.

Computes SHAP values for the most recent bar's XGBoost prediction.
Uses shap.TreeExplainer which has native XGBoost support — no sampling or
kernel approximation needed, giving exact Shapley values in <200ms.

How to read SHAP values:
  - SHAP values are in log-odds space (output of the XGBoost leaf scores).
  - Positive SHAP value → feature pushes prediction toward "up" (class 1).
  - Negative SHAP value → feature pushes prediction toward "down" (class 0).
  - base_value + sum(SHAP values) = raw log-odds for this prediction.

This module is CPU-bound and should be called via asyncio.to_thread()
from the async FastAPI route to avoid blocking the event loop.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import shap

# Imported from the mounted ml_engine volume (PYTHONPATH=/ in docker-compose).
from ml_engine.models.xgboost_model import XGBoostDirectionClassifier


def compute_shap_values(
    model_path:    str,
    feature_vector: np.ndarray,   # Shape (1, n_features) — the latest bar
    feature_names:  list[str],
    top_n:          int = 12,
) -> dict[str, Any]:
    """
    Load the XGBoost model from disk and run SHAP TreeExplainer on one row.

    Args:
        model_path:     Absolute path to the .joblib model file.
        feature_vector: Shape (1, n_features). Raw (unscaled) feature values
                        for the most recent bar; scaling is applied here if the
                        model was trained with a scaler.
        feature_names:  Column names in the same order as feature_vector columns.
        top_n:          Return only the top N features by |SHAP value|.

    Returns:
        {
          "base_value":      float,   # E[f(X)] in log-odds
          "predicted_proba": float,   # P(up) for this observation
          "features": [               # Top N sorted by |SHAP|
            {"name": str, "shap_value": float, "feature_value": float},
            ...
          ]
        }
    """
    # ── Load model ────────────────────────────────────────────────────────────
    clf, scaler = XGBoostDirectionClassifier.load(model_path)

    # ── Apply scaler if one was saved with the model ──────────────────────────
    X = feature_vector.copy()
    if scaler is not None:
        X = scaler.transform(X)

    # ── SHAP TreeExplainer ────────────────────────────────────────────────────
    # TreeExplainer is exact for tree-based models (no approximation).
    # model_output="raw" gives log-odds outputs (cleaner for binary classification).
    explainer = shap.TreeExplainer(clf.model, model_output="raw")
    shap_values = explainer.shap_values(X)   # Shape: (1, n_features)

    # For binary XGBClassifier with model_output="raw":
    #   shap_values is a 2-D array of shape (n_samples, n_features) in log-odds.
    if isinstance(shap_values, list):
        # Older shap versions return a list [class0_shap, class1_shap]
        sv = np.array(shap_values[1])[0]
    else:
        sv = np.array(shap_values)[0]

    base_value = float(
        explainer.expected_value[1]
        if isinstance(explainer.expected_value, (list, np.ndarray))
        else explainer.expected_value
    )

    predicted_proba = float(clf.predict_proba(X)[0, 1])

    # ── Rank features by |SHAP| ───────────────────────────────────────────────
    raw_feature_values = feature_vector[0]   # Unscaled for display
    pairs = sorted(
        zip(feature_names, sv, raw_feature_values),
        key=lambda x: abs(x[1]),
        reverse=True,
    )[:top_n]

    return {
        "base_value":      round(base_value, 6),
        "predicted_proba": round(predicted_proba, 6),
        "features": [
            {
                "name":          name,
                "shap_value":    round(float(sv_val), 6),
                "feature_value": round(float(fv), 6),
            }
            for name, sv_val, fv in pairs
        ],
    }

"""
LSTM model for time-series price prediction — Phase 2.

Architecture:
  Input:  (batch, sequence_len, n_features)
  LSTM:   2-layer bidirectional, hidden_size=128, dropout=0.2
  Output: (batch, 1) — next-day return prediction (regression)
          or (batch, 3) — down/flat/up classification

Training:
  Walk-forward validation (no lookahead bias)
  MLflow experiment tracking
  SHAP for feature importance
"""

# Placeholder — implementation begins in Phase 2

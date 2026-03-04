"""
LSTM model for time-series price direction prediction — Phase 2.

Architecture:
  Input:  (batch, sequence_len=20, n_features=42)
  LSTM:   2-layer bidirectional, hidden_size=128, dropout=0.3
  Output: (batch, 1) sigmoid — P(up)

Training:
  - Walk-forward chronological splits (no shuffling)
  - Binary cross-entropy loss
  - Adam optimizer with cosine LR schedule
  - Early stopping on validation loss (patience=10)
  - Gradient clipping (max_norm=1.0) for stable training

Note: PyTorch (~2GB) is NOT installed in the backend container.
      This module is used by the standalone train.py script only.
      The trained model is exported to a .pt file and its predictions
      are stored in the ml_predictions table for the API to serve.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset


# ── Dataset ───────────────────────────────────────────────────────────────────

class SequenceDataset(Dataset):
    """
    Sliding-window dataset for time-series classification.

    Given a feature matrix X of shape (T, F) and labels y of shape (T,),
    produces overlapping sequences of length `seq_len`.

    Sample i: X[i : i+seq_len] → y[i + seq_len - 1]
    (predict the direction of the last day in the sequence)
    """

    def __init__(self, X: np.ndarray, y: np.ndarray, seq_len: int = 20) -> None:
        self.seq_len = seq_len
        self.X = torch.tensor(X, dtype=torch.float32)
        self.y = torch.tensor(y, dtype=torch.float32)

    def __len__(self) -> int:
        return max(0, len(self.X) - self.seq_len + 1)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        x_seq = self.X[idx : idx + self.seq_len]
        y_val = self.y[idx + self.seq_len - 1]
        return x_seq, y_val


# ── Model ─────────────────────────────────────────────────────────────────────

class LSTMClassifier(nn.Module):
    """
    2-layer bidirectional LSTM for binary sequence classification.

    Bidirectional doubles hidden state size, letting the model learn
    both forward and backward temporal patterns within the input window.
    (Inputs are historical-only, so no data leakage from future.)

    Architecture:
        LSTM(input_size, hidden=128, layers=2, bidirectional=True, dropout=0.3)
        → take last hidden state (size 128*2=256)
        → Linear(256, 64) + ReLU + Dropout(0.3)
        → Linear(64, 1) + Sigmoid
    """

    def __init__(
        self,
        input_size:  int,
        hidden_size: int = 128,
        num_layers:  int = 2,
        dropout:     float = 0.3,
    ) -> None:
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers  = num_layers

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout if num_layers > 1 else 0.0,
            bidirectional=True,
            batch_first=True,       # (batch, seq, features) input format
        )

        lstm_out_size = hidden_size * 2     # *2 for bidirectional

        self.head = nn.Sequential(
            nn.Linear(lstm_out_size, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: (batch, seq_len, input_size)
        Returns: (batch, 1) — P(up) for each sample in [0, 1]
        """
        lstm_out, _ = self.lstm(x)          # (batch, seq_len, hidden*2)
        last_out = lstm_out[:, -1, :]       # Take last time step
        return self.head(last_out)           # (batch, 1)


# ── Training ──────────────────────────────────────────────────────────────────

def train_lstm(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test:  np.ndarray,
    y_test:  np.ndarray,
    seq_len:       int   = 20,
    hidden_size:   int   = 128,
    num_layers:    int   = 2,
    dropout:       float = 0.3,
    epochs:        int   = 100,
    batch_size:    int   = 64,
    learning_rate: float = 1e-3,
    patience:      int   = 10,
    save_path: str | Path | None = None,
    device: str | None = None,
    verbose: bool = True,
) -> tuple[LSTMClassifier, dict[str, float]]:
    """
    Train LSTM with early stopping on an internal validation split.

    Uses the last 10% of training data as validation (chronological).

    Returns: (trained_model, metrics_dict)
    """
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    # Chronological validation split from end of training set
    n_val    = max(int(len(X_train) * 0.1), seq_len + 1)
    X_tr     = X_train[:-n_val]
    y_tr     = y_train[:-n_val]
    X_val    = X_train[-n_val:]
    y_val    = y_train[-n_val:]

    train_loader = DataLoader(SequenceDataset(X_tr,    y_tr,   seq_len), batch_size=batch_size, shuffle=False)
    val_loader   = DataLoader(SequenceDataset(X_val,   y_val,  seq_len), batch_size=batch_size, shuffle=False)
    test_loader  = DataLoader(SequenceDataset(X_test,  y_test, seq_len), batch_size=batch_size, shuffle=False)

    n_features = X_train.shape[1]
    model      = LSTMClassifier(n_features, hidden_size, num_layers, dropout).to(device)

    criterion = nn.BCELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    best_val_loss = float("inf")
    best_state:   dict | None = None
    patience_left = patience

    for epoch in range(1, epochs + 1):
        # Training
        model.train()
        train_loss = 0.0
        for X_batch, y_batch in train_loader:
            X_batch = X_batch.to(device)
            y_batch = y_batch.to(device).unsqueeze(1)
            optimizer.zero_grad()
            preds = model(X_batch)
            loss  = criterion(preds, y_batch)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_loss += loss.item()

        # Validation
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for X_batch, y_batch in val_loader:
                X_batch = X_batch.to(device)
                y_batch = y_batch.to(device).unsqueeze(1)
                val_loss += criterion(model(X_batch), y_batch).item()

        scheduler.step()
        avg_val = val_loss / max(len(val_loader), 1)

        if verbose and epoch % 10 == 0:
            print(f"Epoch {epoch:3d} | train={train_loss/max(len(train_loader),1):.4f} | val={avg_val:.4f}")

        # Early stopping
        if avg_val < best_val_loss - 1e-5:
            best_val_loss = avg_val
            best_state    = {k: v.clone() for k, v in model.state_dict().items()}
            patience_left = patience
        else:
            patience_left -= 1
            if patience_left == 0:
                if verbose:
                    print(f"Early stopping at epoch {epoch}")
                break

    if best_state is not None:
        model.load_state_dict(best_state)

    metrics = _evaluate(model, test_loader, device)

    if save_path:
        _save(model, save_path, n_features, hidden_size, num_layers, dropout, seq_len)

    return model, metrics


def _evaluate(model: LSTMClassifier, loader: DataLoader, device: str) -> dict[str, float]:
    from sklearn.metrics import accuracy_score, f1_score, roc_auc_score

    model.eval()
    all_proba:  list[float] = []
    all_labels: list[int]   = []

    with torch.no_grad():
        for X_batch, y_batch in loader:
            proba = model(X_batch.to(device)).squeeze(1).cpu().numpy()
            all_proba.extend(proba.tolist())
            all_labels.extend(y_batch.numpy().astype(int).tolist())

    y_true = np.array(all_labels, dtype=int)
    y_pred = (np.array(all_proba) >= 0.5).astype(int)
    y_prob = np.array(all_proba)

    return {
        "accuracy":     round(accuracy_score(y_true, y_pred), 4),
        "f1":           round(f1_score(y_true, y_pred, zero_division=0), 4),
        "roc_auc":      round(roc_auc_score(y_true, y_prob), 4),
        "up_rate":      round(float(y_true.mean()), 4),
        "sample_count": int(len(y_true)),
    }


def _save(
    model:       LSTMClassifier,
    path:        str | Path,
    input_size:  int,
    hidden_size: int,
    num_layers:  int,
    dropout:     float,
    seq_len:     int,
) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "model_state": model.state_dict(),
        "config": {
            "input_size":  input_size,
            "hidden_size": hidden_size,
            "num_layers":  num_layers,
            "dropout":     dropout,
            "seq_len":     seq_len,
        },
    }, path)


# ── Inference ─────────────────────────────────────────────────────────────────

def load_lstm(path: str | Path, device: str | None = None) -> tuple[LSTMClassifier, dict]:
    """Load a saved LSTM model. Returns (model, config)."""
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    ckpt  = torch.load(path, map_location=device)
    cfg   = ckpt["config"]
    model = LSTMClassifier(
        input_size=cfg["input_size"],
        hidden_size=cfg["hidden_size"],
        num_layers=cfg["num_layers"],
        dropout=cfg["dropout"],
    ).to(device)
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    return model, cfg


def predict_lstm(
    model:   LSTMClassifier,
    X:       np.ndarray,
    seq_len: int = 20,
    device:  str | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Run inference on feature matrix X.

    Returns: (directions, probabilities)  shape (n_samples,)
    where n_samples = len(X) - seq_len + 1
    """
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    X_tensor = torch.tensor(X, dtype=torch.float32)
    seqs     = torch.stack([X_tensor[i: i + seq_len] for i in range(len(X) - seq_len + 1)])

    model.eval()
    with torch.no_grad():
        proba = model(seqs.to(device)).squeeze(1).cpu().numpy()

    return (proba >= 0.5).astype(int), proba

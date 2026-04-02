"""
Reinforcement Learning Agent — Phase 42.

Implements a tabular Q-learning agent that learns when to Buy / Hold / Sell
a single equity using daily OHLCV features as state.

State representation (discretized to keep Q-table tractable):
  - RSI bucket        (0=oversold <30, 1=neutral 30-70, 2=overbought >70)
  - Momentum bucket   (0=negative, 1=flat, 2=positive) — 5-day price change
  - Position bucket   (0=flat, 1=long)                  — current position

Actions: 0=Hold, 1=Buy, 2=Sell
Reward:  daily P&L if in position, else 0 on hold; –penalty on invalid (e.g. sell when flat)

Training:
  - Runs N episodes over the entire price history (each episode = one full pass)
  - Uses ε-greedy exploration decaying linearly to ε_min
  - Q-table saved as a JSON dict (state_key → [q_hold, q_buy, q_sell])

Public API:
  train(closes, n_episodes=50) → QTable
  predict(closes, q_table)     → {"action": "buy"|"hold"|"sell", "q_values": [...], "state": {...}}
  save_q_table(q_table, path)
  load_q_table(path)           → QTable
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import TypeAlias

import numpy as np

# ── Types ─────────────────────────────────────────────────────────────────────

QTable: TypeAlias = dict[str, list[float]]

# ── Constants ─────────────────────────────────────────────────────────────────

ACTIONS     = [0, 1, 2]   # Hold, Buy, Sell
ACTION_NAMES = {0: "hold", 1: "buy", 2: "sell"}

# Reward shaping
INVALID_PENALTY = -0.02    # Trying to sell when flat or buy when already long
TRANSACTION_COST = 0.001   # 0.1% per trade (commission + slippage)


# ── Feature helpers ───────────────────────────────────────────────────────────

def _rsi(closes: np.ndarray, period: int = 14) -> np.ndarray:
    """Return RSI array (same length as closes, NaN for first `period` bars)."""
    delta = np.diff(closes, prepend=closes[0])
    gain  = np.where(delta > 0, delta, 0.0)
    loss  = np.where(delta < 0, -delta, 0.0)

    avg_gain = np.full_like(closes, np.nan)
    avg_loss = np.full_like(closes, np.nan)

    # Seed with simple average
    avg_gain[period] = gain[1:period+1].mean()
    avg_loss[period] = loss[1:period+1].mean()

    for i in range(period + 1, len(closes)):
        avg_gain[i] = (avg_gain[i-1] * (period - 1) + gain[i]) / period
        avg_loss[i] = (avg_loss[i-1] * (period - 1) + loss[i]) / period

    rs  = np.where(avg_loss == 0, 100.0, avg_gain / avg_loss)
    rsi = 100 - (100 / (1 + rs))
    rsi[:period] = np.nan
    return rsi


def _state(closes: np.ndarray, idx: int, position: int) -> tuple[int, int, int] | None:
    """
    Compute discretized state at bar index `idx`.
    Returns None if features can't be computed yet (early bars).
    """
    if idx < 20:
        return None

    # RSI bucket
    rsi_vals = _rsi(closes[:idx+1])
    rsi = rsi_vals[-1]
    if np.isnan(rsi):
        return None
    if rsi < 30:
        rsi_bucket = 0
    elif rsi > 70:
        rsi_bucket = 2
    else:
        rsi_bucket = 1

    # 5-day momentum bucket
    mom = (closes[idx] - closes[idx-5]) / closes[idx-5]
    if mom < -0.01:
        mom_bucket = 0
    elif mom > 0.01:
        mom_bucket = 2
    else:
        mom_bucket = 1

    return (rsi_bucket, mom_bucket, position)


def _state_key(state: tuple[int, int, int]) -> str:
    return f"{state[0]}_{state[1]}_{state[2]}"


# ── Q-learning core ───────────────────────────────────────────────────────────

def _init_q(state: tuple[int, int, int], q_table: QTable) -> None:
    key = _state_key(state)
    if key not in q_table:
        q_table[key] = [0.0, 0.0, 0.0]   # [q_hold, q_buy, q_sell]


def _choose_action(state: tuple[int, int, int], q_table: QTable, epsilon: float) -> int:
    if random.random() < epsilon:
        return random.choice(ACTIONS)
    key = _state_key(state)
    q   = q_table.get(key, [0.0, 0.0, 0.0])
    return int(np.argmax(q))


def train(
    closes: np.ndarray,
    n_episodes: int = 50,
    lr: float = 0.1,
    gamma: float = 0.95,
    eps_start: float = 1.0,
    eps_min: float = 0.05,
) -> QTable:
    """
    Train a Q-table on the provided close prices.

    Each episode is a full left-to-right pass through the price series.
    Epsilon decays linearly from eps_start to eps_min over n_episodes.

    Returns the trained Q-table.
    """
    q_table: QTable = {}
    eps_decay = (eps_start - eps_min) / max(n_episodes - 1, 1)
    epsilon = eps_start

    for _ in range(n_episodes):
        position  = 0       # 0 = flat, 1 = long
        entry_price: float = 0.0

        for idx in range(20, len(closes) - 1):
            state = _state(closes, idx, position)
            if state is None:
                continue

            _init_q(state, q_table)
            action = _choose_action(state, q_table, epsilon)

            # ── Simulate action ──────────────────────────────────────────────
            reward = 0.0
            next_price = closes[idx + 1]
            curr_price = closes[idx]

            if action == 1:   # Buy
                if position == 0:
                    position    = 1
                    entry_price = curr_price * (1 + TRANSACTION_COST)
                    reward      = 0.0
                else:
                    reward = INVALID_PENALTY   # already long

            elif action == 2:  # Sell
                if position == 1:
                    pnl    = (curr_price * (1 - TRANSACTION_COST) - entry_price) / entry_price
                    reward = pnl
                    position = 0
                else:
                    reward = INVALID_PENALTY   # nothing to sell

            else:  # Hold
                if position == 1:
                    daily_ret = (next_price - curr_price) / curr_price
                    reward    = daily_ret

            # ── Q-update ─────────────────────────────────────────────────────
            next_state = _state(closes, idx + 1, position)
            if next_state is not None:
                _init_q(next_state, q_table)
                max_q_next = max(q_table[_state_key(next_state)])
            else:
                max_q_next = 0.0

            key = _state_key(state)
            q_table[key][action] += lr * (reward + gamma * max_q_next - q_table[key][action])

        epsilon = max(eps_min, epsilon - eps_decay)

    return q_table


def predict(closes: np.ndarray, q_table: QTable) -> dict:
    """
    Return the greedy action recommendation for the most recent bar.

    Returns:
      {
        "action":   "buy" | "hold" | "sell",
        "q_values": [q_hold, q_buy, q_sell],
        "state": {"rsi_bucket": int, "momentum_bucket": int, "position": int},
        "confidence": float   # max Q value − min Q value (spread as proxy)
      }
    """
    idx = len(closes) - 1
    # Predict always assumes flat position (no live position tracking here)
    state = _state(closes, idx, 0)
    if state is None:
        return {
            "action":     "hold",
            "q_values":   [0.0, 0.0, 0.0],
            "state":      {},
            "confidence": 0.0,
            "note":       "Not enough history for state computation",
        }

    key     = _state_key(state)
    q_vals  = q_table.get(key, [0.0, 0.0, 0.0])
    best    = int(np.argmax(q_vals))
    spread  = float(max(q_vals) - min(q_vals))

    return {
        "action":    ACTION_NAMES[best],
        "q_values":  [round(v, 6) for v in q_vals],
        "state":     {
            "rsi_bucket":      state[0],
            "momentum_bucket": state[1],
            "position":        state[2],
        },
        "confidence": round(spread, 6),
    }


def save_q_table(q_table: QTable, path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(q_table, f)


def load_q_table(path: str | Path) -> QTable:
    with open(path) as f:
        return json.load(f)

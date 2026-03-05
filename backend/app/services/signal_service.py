"""
Composite signal aggregator — Phase 6.

Combines three independent signal sources into a single trading action
(BUY / HOLD / SELL) with a confidence score and human-readable reasoning.

Signal sources (each normalized to [-1, +1]):
  1. ML signal     (weight 0.50) — XGBoost direction + confidence
  2. Sentiment     (weight 0.30) — RSI + moving-average sentiment score
  3. Technical     (weight 0.20) — MACD histogram direction + RSI zone

Action thresholds:
  composite > +0.35  → BUY
  composite < -0.35  → SELL
  else               → HOLD

Confidence = abs(composite_score) — a direct measure of signal conviction.

This is intentionally a rule-based system (no Q-table or neural network).
The "intelligence" lies in combining diverse, validated signal types rather
than a single indicator, reducing false positives vs any one signal alone.
"""

from __future__ import annotations

from typing import Any


def compute_composite_signal(
    ml_direction:   str,    # "up" | "down"
    ml_confidence:  float,  # P(predicted_class) in [0.5, 1.0]
    sentiment_score: float, # Composite RSI+MA score in [-1, +1]
    latest_features: dict[str, float],  # Must include: rsi_14, macd_hist
) -> dict[str, Any]:
    """
    Aggregate ML, sentiment, and technical signals into a composite action.

    Args:
        ml_direction:    "up" or "down" from the XGBoost model.
        ml_confidence:   P(predicted class) — [0.5, 1.0].
        sentiment_score: Output of sentiment_service.compute_sentiment()["score"].
        latest_features: Dict with at least {"rsi_14": float, "macd_hist": float}.

    Returns:
        {
          "signal":      str,        # "buy" | "hold" | "sell"
          "confidence":  float,      # [0, 1] — abs(composite score)
          "score":       float,      # Raw weighted composite [-1, +1]
          "reasoning":   list[str],  # Human-readable bullet points
          "sub_signals": {
            "ml":        {"vote": float, "label": str},
            "sentiment": {"vote": float, "label": str},
            "technical": {"vote": float, "label": str},
          }
        }
    """
    reasoning: list[str] = []

    # ── Signal 1: ML ──────────────────────────────────────────────────────────
    # Map [0.5, 1.0] confidence to [0, 1] strength, then apply direction sign.
    ml_strength = (ml_confidence - 0.5) * 2    # e.g. 0.75 confidence → 0.5 strength
    ml_vote = ml_strength if ml_direction == "up" else -ml_strength
    ml_pct  = ml_confidence * 100
    ml_label = (
        f"XGBoost: {'UP' if ml_direction == 'up' else 'DOWN'} "
        f"({ml_pct:.1f}% confidence)"
    )
    reasoning.append(ml_label)

    # ── Signal 2: Sentiment ───────────────────────────────────────────────────
    sentiment_vote = sentiment_score    # Already in [-1, +1]
    rsi_val = latest_features.get("rsi_14", 50.0)
    sign = "+" if sentiment_score > 0 else ""
    sentiment_label = (
        f"Sentiment: {sign}{sentiment_score:.2f} "
        f"(RSI={rsi_val:.0f})"
    )
    reasoning.append(sentiment_label)

    # ── Signal 3: Technical (MACD + RSI zone) ─────────────────────────────────
    macd_hist = latest_features.get("macd_hist", 0.0)
    tech_vote = 0.0
    tech_parts: list[str] = []

    if macd_hist > 0:
        tech_vote += 0.5
        tech_parts.append("MACD histogram +")
    elif macd_hist < 0:
        tech_vote -= 0.5
        tech_parts.append("MACD histogram -")
    else:
        tech_parts.append("MACD neutral")

    if rsi_val < 30:
        tech_vote += 0.5
        tech_parts.append(f"RSI oversold ({rsi_val:.0f})")
    elif rsi_val > 70:
        tech_vote -= 0.5
        tech_parts.append(f"RSI overbought ({rsi_val:.0f})")
    else:
        tech_parts.append(f"RSI neutral ({rsi_val:.0f})")

    tech_vote = max(-1.0, min(1.0, tech_vote))
    tech_label = ", ".join(tech_parts)
    reasoning.append(f"Technical: {tech_label}")

    # ── Weighted composite ────────────────────────────────────────────────────
    score = (
        0.50 * ml_vote +
        0.30 * sentiment_vote +
        0.20 * tech_vote
    )
    score = round(float(score), 4)
    confidence = round(abs(score), 4)

    sign_str = "+" if score > 0 else ""
    if score > 0.35:
        signal = "buy"
        reasoning.append(f"Composite score {sign_str}{score:.2f} → BUY")
    elif score < -0.35:
        signal = "sell"
        reasoning.append(f"Composite score {sign_str}{score:.2f} → SELL")
    else:
        signal = "hold"
        reasoning.append(
            f"Composite score {sign_str}{score:.2f} → HOLD (threshold is ±0.35)"
        )

    return {
        "signal":     signal,
        "confidence": confidence,
        "score":      score,
        "reasoning":  reasoning,
        "sub_signals": {
            "ml":        {"vote": round(ml_vote, 4),        "label": ml_label},
            "sentiment": {"vote": round(sentiment_vote, 4), "label": sentiment_label},
            "technical": {"vote": round(tech_vote, 4),      "label": tech_label},
        },
    }

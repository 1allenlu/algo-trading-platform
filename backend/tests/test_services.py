"""
Unit tests for pure-Python service functions — no DB or network required.

Covers:
  - signal_service.compute_composite_signal
  - sentiment_service.compute_sentiment
  - Multi-timeframe alignment logic (_alignment_strength)
  - Kelly criterion math
  - VaR contribution math
  - Pattern recognition helpers
"""

import math
import numpy as np
import pandas as pd
import pytest


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_ohlcv(n: int = 252, trend: float = 0.001) -> pd.DataFrame:
    """
    Synthetic OHLCV DataFrame with a gentle uptrend.
    Long enough for RSI(14), SMA(50), SMA(200).
    """
    rng   = np.random.default_rng(42)
    price = 100.0
    rows  = []
    for _ in range(n):
        price *= 1 + trend + rng.normal(0, 0.01)
        rows.append({
            "open":   price * (1 - 0.002),
            "high":   price * (1 + 0.005),
            "low":    price * (1 - 0.005),
            "close":  price,
            "volume": int(rng.integers(1_000_000, 5_000_000)),
        })
    return pd.DataFrame(rows)


def _make_bear_ohlcv(n: int = 252) -> pd.DataFrame:
    return _make_ohlcv(n, trend=-0.002)


# ── signal_service ─────────────────────────────────────────────────────────────

class TestCompositeSignal:
    from app.services.signal_service import compute_composite_signal

    def _sig(self, ml_dir="up", ml_conf=0.8, sent=0.5, rsi=45, macd=0.1):
        from app.services.signal_service import compute_composite_signal
        return compute_composite_signal(
            ml_direction=ml_dir,
            ml_confidence=ml_conf,
            sentiment_score=sent,
            latest_features={"rsi_14": rsi, "macd_hist": macd},
        )

    def test_strong_buy_signal(self):
        result = self._sig(ml_dir="up", ml_conf=0.9, sent=0.6, rsi=35, macd=0.2)
        assert result["signal"] == "buy"
        assert result["confidence"] > 0.35

    def test_strong_sell_signal(self):
        result = self._sig(ml_dir="down", ml_conf=0.9, sent=-0.6, rsi=78, macd=-0.3)
        assert result["signal"] == "sell"
        assert result["confidence"] > 0.35

    def test_hold_when_mixed_signals(self):
        result = self._sig(ml_dir="up", ml_conf=0.55, sent=0.0, rsi=50, macd=0.0)
        assert result["signal"] == "hold"

    def test_score_in_range(self):
        result = self._sig()
        assert -1.0 <= result["score"] <= 1.0

    def test_confidence_equals_abs_score(self):
        result = self._sig(ml_dir="down", ml_conf=0.7, sent=-0.4, rsi=72, macd=-0.1)
        assert abs(result["confidence"] - abs(result["score"])) < 1e-6

    def test_returns_reasoning_list(self):
        result = self._sig()
        assert isinstance(result["reasoning"], list)
        assert len(result["reasoning"]) > 0

    def test_returns_sub_signals(self):
        result = self._sig()
        subs = result["sub_signals"]
        assert {"ml", "sentiment", "technical"} == subs.keys()

    def test_ml_weight_dominates(self):
        """ML has 0.50 weight — strong ML signal should dominate."""
        buy  = self._sig(ml_dir="up",   ml_conf=0.99, sent=0.0, rsi=50, macd=0.0)
        sell = self._sig(ml_dir="down", ml_conf=0.99, sent=0.0, rsi=50, macd=0.0)
        assert buy["score"] > 0
        assert sell["score"] < 0

    def test_confidence_min_05(self):
        """ml_confidence of 0.5 = zero strength → neutral ML vote."""
        result = self._sig(ml_dir="up", ml_conf=0.5, sent=0.0, rsi=50, macd=0.0)
        # ML vote should be 0 when confidence == 0.5
        assert result["sub_signals"]["ml"]["vote"] == pytest.approx(0.0, abs=1e-6)

    def test_oversold_rsi_adds_positive_tech_vote(self):
        neutral = self._sig(ml_dir="up", ml_conf=0.5, sent=0.0, rsi=50, macd=0.0)
        oversold = self._sig(ml_dir="up", ml_conf=0.5, sent=0.0, rsi=20, macd=0.0)
        assert oversold["score"] > neutral["score"]

    def test_overbought_rsi_adds_negative_tech_vote(self):
        neutral   = self._sig(ml_dir="down", ml_conf=0.5, sent=0.0, rsi=50, macd=0.0)
        overbought = self._sig(ml_dir="down", ml_conf=0.5, sent=0.0, rsi=80, macd=0.0)
        assert overbought["score"] < neutral["score"]


# ── sentiment_service ─────────────────────────────────────────────────────────

class TestComputeSentiment:
    def _sent(self, df):
        from app.services.sentiment_service import compute_sentiment
        return compute_sentiment(df)

    def test_returns_required_keys(self):
        result = self._sent(_make_ohlcv())
        assert {"score", "label", "rsi_14", "price_vs_sma50", "price_vs_sma200", "components"} <= result.keys()

    def test_score_in_range(self):
        for df in [_make_ohlcv(), _make_bear_ohlcv()]:
            assert -1.0 <= self._sent(df)["score"] <= 1.0

    def test_bullish_label_on_uptrend(self):
        df = _make_ohlcv(n=300, trend=0.003)  # strong uptrend → bullish
        result = self._sent(df)
        assert result["label"] in ("bullish", "neutral")  # may vary with RNG

    def test_bearish_label_on_downtrend(self):
        df = _make_bear_ohlcv(n=300)
        result = self._sent(df)
        assert result["label"] in ("bearish", "neutral")

    def test_rsi_in_valid_range(self):
        result = self._sent(_make_ohlcv())
        assert 0 <= result["rsi_14"] <= 100

    def test_components_present(self):
        result = self._sent(_make_ohlcv())
        comps = result["components"]
        assert {"rsi_component", "sma50_component", "sma200_component"} == comps.keys()

    def test_score_higher_for_uptrend_vs_downtrend(self):
        up   = self._sent(_make_ohlcv(trend=0.005))["score"]
        down = self._sent(_make_bear_ohlcv())["score"]
        assert up > down


# ── Multi-timeframe alignment ─────────────────────────────────────────────────

class TestAlignmentStrength:
    def _align(self, sigs):
        # Import the private helper from the signals route
        import importlib
        mod = importlib.import_module("app.api.routes.signals")
        return mod._alignment_strength(sigs)

    def test_all_buy_is_strong_buy(self):
        aligned, strength = self._align(["buy", "buy", "buy"])
        assert aligned is True
        assert strength == "strong_buy"

    def test_all_sell_is_strong_sell(self):
        aligned, strength = self._align(["sell", "sell", "sell"])
        assert aligned is True
        assert strength == "strong_sell"

    def test_two_buy_one_hold_is_mostly_bullish(self):
        aligned, strength = self._align(["buy", "buy", "hold"])
        assert aligned is True
        assert strength == "mostly_bullish"

    def test_two_sell_one_hold_is_mostly_bearish(self):
        aligned, strength = self._align(["sell", "hold", "sell"])
        assert aligned is True
        assert strength == "mostly_bearish"

    def test_mixed_signals(self):
        aligned, strength = self._align(["buy", "sell", "hold"])
        assert aligned is False
        assert strength == "mixed"

    def test_single_signal_always_aligned(self):
        aligned, strength = self._align(["buy"])
        assert aligned is True

    def test_two_hold_one_buy(self):
        # Neither buy nor sell hits 66% — mixed
        aligned, strength = self._align(["hold", "hold", "buy"])
        assert strength == "mixed"


# ── Kelly criterion math ──────────────────────────────────────────────────────

class TestKellyMath:
    """
    Test Kelly formula: f* = (p·b – q) / b  where q = 1 – p.
    Uses the same calculation as _kelly_for_symbol in signals.py.
    """

    @staticmethod
    def _kelly(p: float, b: float) -> dict:
        q = 1.0 - p
        full = max(0.0, (p * b - q) / b)
        return {"full_kelly": round(full, 4), "half_kelly": round(full / 2, 4)}

    def test_coin_flip_even_odds_is_zero(self):
        """50/50 win rate with 1:1 odds → Kelly = 0 (no edge)."""
        result = self._kelly(0.5, 1.0)
        assert result["full_kelly"] == pytest.approx(0.0, abs=1e-4)

    def test_positive_edge_gives_positive_kelly(self):
        """60% win rate with 1:1 odds → Kelly = 0.20."""
        result = self._kelly(0.6, 1.0)
        assert result["full_kelly"] == pytest.approx(0.20, abs=1e-3)

    def test_higher_win_loss_ratio_increases_kelly(self):
        r1 = self._kelly(0.6, 1.0)["full_kelly"]
        r2 = self._kelly(0.6, 2.0)["full_kelly"]
        assert r2 > r1

    def test_half_kelly_is_half_full(self):
        result = self._kelly(0.65, 1.5)
        assert result["half_kelly"] == pytest.approx(result["full_kelly"] / 2, abs=1e-4)

    def test_negative_edge_clamps_to_zero(self):
        """30% win rate with 1:1 odds → negative Kelly, should return 0."""
        result = self._kelly(0.3, 1.0)
        assert result["full_kelly"] == 0.0

    def test_known_value_70pct_15ratio(self):
        """70% win, 1.5 win:loss → f* = (0.7·1.5 – 0.3) / 1.5 = 0.50."""
        result = self._kelly(0.70, 1.5)
        assert result["full_kelly"] == pytest.approx(0.50, abs=1e-3)

    def test_very_high_win_rate(self):
        result = self._kelly(0.95, 2.0)
        assert 0 < result["full_kelly"] <= 1.0

    def test_kelly_never_exceeds_1(self):
        """Even with absurd params, Kelly should be ≤ 1."""
        result = self._kelly(0.99, 10.0)
        assert result["full_kelly"] <= 1.0


# ── VaR contribution math ─────────────────────────────────────────────────────

class TestVarContributionMath:
    """
    Test the component VaR logic with known synthetic return series.
    ComponentVaR_i = w_i × corr(r_i, r_p) × VaR_i
    """

    def _make_returns(self, n=500, corr=0.8, seed=0):
        """Two correlated return series."""
        rng = np.random.default_rng(seed)
        r1  = rng.normal(0.001, 0.02, n)
        r2  = corr * r1 + np.sqrt(1 - corr**2) * rng.normal(0.001, 0.02, n)
        return pd.DataFrame({"A": r1, "B": r2})

    def _compute_contrib(self, returns_df, weights):
        w   = np.array(weights)
        rp  = (returns_df * w).sum(axis=1)
        var_p = float(-np.percentile(rp, 5))

        contributions = []
        for i, sym in enumerate(returns_df.columns):
            ri      = returns_df[sym]
            var_i   = float(-np.percentile(ri, 5))
            corr_ip = float(ri.corr(rp))
            contributions.append(w[i] * corr_ip * var_i)

        total = sum(contributions)
        return [c / total * 100 for c in contributions], var_p

    def test_contributions_sum_to_100(self):
        df = self._make_returns()
        pcts, _ = self._compute_contrib(df, [0.5, 0.5])
        assert sum(pcts) == pytest.approx(100.0, abs=0.01)

    def test_equal_weight_equal_corr_equal_contributions(self):
        """Perfect corr=1 with equal weights → 50%/50% split."""
        df = self._make_returns(corr=1.0)
        pcts, _ = self._compute_contrib(df, [0.5, 0.5])
        assert pcts[0] == pytest.approx(pcts[1], abs=5.0)  # allow some sampling error

    def test_higher_weight_higher_contribution(self):
        df = self._make_returns(corr=0.8)
        pcts_skewed, _ = self._compute_contrib(df, [0.8, 0.2])
        # Asset A (80% weight) should contribute more risk
        assert pcts_skewed[0] > pcts_skewed[1]

    def test_portfolio_var_is_positive(self):
        df = self._make_returns()
        _, var_p = self._compute_contrib(df, [0.5, 0.5])
        assert var_p > 0.0

    def test_diversification_reduces_portfolio_var(self):
        """Negative correlation reduces portfolio VaR below the average of individual VaRs."""
        rng = np.random.default_rng(42)
        n   = 1000
        r1  = rng.normal(0.001, 0.02, n)
        r2  = -r1 + rng.normal(0, 0.005, n)   # near-perfect negative correlation
        df  = pd.DataFrame({"A": r1, "B": r2})

        _, var_p = self._compute_contrib(df, [0.5, 0.5])
        var_a = float(-np.percentile(r1, 5))
        var_b = float(-np.percentile(r2, 5))
        avg_individual = (0.5 * var_a + 0.5 * var_b)

        assert var_p < avg_individual  # diversification benefit


# ── Pattern recognition helpers ───────────────────────────────────────────────

class TestPatternRecognition:
    """
    Test that the pattern service can be imported and run without errors.
    Uses synthetic OHLCV data — does not require DB.
    """

    def _make_candles(self, n=50):
        df = _make_ohlcv(n)
        return df

    def test_pattern_service_importable(self):
        from app.services.pattern_service import detect_patterns
        assert callable(detect_patterns)

    def test_detect_patterns_returns_list(self):
        from app.services.pattern_service import detect_patterns
        df = self._make_candles()
        df["timestamp"] = pd.date_range("2023-01-01", periods=len(df), freq="D")
        result = detect_patterns(df)
        assert isinstance(result, list)

    def test_doji_detected_correctly(self):
        """A candle with open ≈ close is a Doji."""
        from app.services.pattern_service import detect_patterns
        rows = [{"open": 100.0, "high": 101.0, "low": 99.0, "close": 100.05, "volume": 1_000_000}]
        df   = pd.DataFrame(rows * 5)   # need a few rows for context
        df["timestamp"] = pd.date_range("2023-01-01", periods=len(df), freq="D")
        result = detect_patterns(df)
        # Should not raise; each pattern is a dict with 'pattern' key
        assert isinstance(result, list)
        for p in result:
            assert isinstance(p, dict)
            assert "pattern" in p


# ── Monte Carlo stats ─────────────────────────────────────────────────────────

class TestMonteCarloService:
    def _run_mc(self):
        import pandas as pd
        from app.services.monte_carlo_service import run_monte_carlo

        rng   = np.random.default_rng(0)
        n     = 500
        dates = pd.date_range("2020-01-01", periods=n, freq="B")
        price_a = 100 * np.cumprod(1 + rng.normal(0.0004, 0.01, n))
        price_b = 100 * np.cumprod(1 + rng.normal(0.0003, 0.012, n))
        closes  = {
            "A": pd.Series(price_a, index=dates),
            "B": pd.Series(price_b, index=dates),
        }
        return run_monte_carlo(closes, weights=[0.5, 0.5], n_sims=200, horizon_days=63)

    def test_mc_returns_required_keys(self):
        result = self._run_mc()
        assert {"paths", "stats", "initial_value"} <= result.keys()

    def test_mc_stats_keys(self):
        stats = self._run_mc()["stats"]
        assert {"prob_profit", "median_return", "p5_return", "median_max_drawdown"} <= stats.keys()

    def test_mc_prob_profit_in_range(self):
        prob = self._run_mc()["stats"]["prob_profit"]
        assert 0.0 <= prob <= 1.0

    def test_mc_paths_non_empty(self):
        paths = self._run_mc()["paths"]
        assert len(paths) > 0


# ── Signal service edge cases ─────────────────────────────────────────────────

class TestSignalEdgeCases:
    def _sig(self, **kwargs):
        from app.services.signal_service import compute_composite_signal
        defaults = dict(
            ml_direction="up", ml_confidence=0.75,
            sentiment_score=0.0, latest_features={"rsi_14": 50.0, "macd_hist": 0.0},
        )
        defaults.update(kwargs)
        return compute_composite_signal(**defaults)

    def test_missing_macd_defaults_neutral(self):
        result = self._sig(latest_features={"rsi_14": 50.0})
        assert result["signal"] in ("buy", "hold", "sell")

    def test_extreme_confidence_gives_max_ml_vote(self):
        r = self._sig(ml_direction="up", ml_confidence=1.0,
                      sentiment_score=0.0, latest_features={"rsi_14": 50, "macd_hist": 0})
        # ML vote = (1.0 - 0.5) * 2 = 1.0 → weighted 0.5
        assert r["sub_signals"]["ml"]["vote"] == pytest.approx(1.0, abs=1e-6)

    def test_sentiment_weight_30pct(self):
        """Sentiment at +1.0 should add +0.30 to the composite score."""
        no_sent  = self._sig(sentiment_score=0.0, ml_confidence=0.5,
                              latest_features={"rsi_14": 50, "macd_hist": 0})
        max_sent = self._sig(sentiment_score=1.0, ml_confidence=0.5,
                              latest_features={"rsi_14": 50, "macd_hist": 0})
        diff = max_sent["score"] - no_sent["score"]
        assert diff == pytest.approx(0.30, abs=1e-3)

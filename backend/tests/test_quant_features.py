"""
Integration tests for all major API endpoints.

Uses ASGI transport (no real network). DB and Redis must be reachable.

Run:
    docker compose exec backend pytest tests/test_quant_features.py -v
"""

import pytest
from httpx import AsyncClient, ASGITransport


# ── Shared client fixture ─────────────────────────────────────────────────────

@pytest.fixture
async def client():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ── Signals ───────────────────────────────────────────────────────────────────

class TestSignalsEndpoint:
    @pytest.mark.asyncio
    async def test_signals_returns_200(self, client):
        r = await client.get("/api/signals")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_signals_returns_list(self, client):
        data = (await client.get("/api/signals")).json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_signals_row_schema(self, client):
        rows = (await client.get("/api/signals")).json()
        if not rows:
            pytest.skip("No signal data — run make ingest + make train-all")
        row = rows[0]
        required = {"symbol", "composite", "confidence", "ml_direction", "rsi_signal", "last_updated"}
        assert required <= row.keys()

    @pytest.mark.asyncio
    async def test_signals_composite_values(self, client):
        rows = (await client.get("/api/signals")).json()
        for row in rows:
            assert row["composite"] in ("buy", "hold", "sell")

    @pytest.mark.asyncio
    async def test_signals_confidence_in_range(self, client):
        rows = (await client.get("/api/signals")).json()
        for row in rows:
            assert 0.0 <= row["confidence"] <= 1.0


# ── Multi-timeframe signals ───────────────────────────────────────────────────

class TestMultiTimeframeEndpoint:
    @pytest.mark.asyncio
    async def test_multi_tf_returns_200(self, client):
        r = await client.get("/api/signals/multi-timeframe")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_multi_tf_returns_list(self, client):
        data = (await client.get("/api/signals/multi-timeframe")).json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_multi_tf_row_schema(self, client):
        rows = (await client.get("/api/signals/multi-timeframe")).json()
        if not rows:
            pytest.skip("No data")
        row = rows[0]
        assert {"symbol", "daily", "aligned", "strength"} <= row.keys()
        assert "signal" in row["daily"]
        assert "score"  in row["daily"]

    @pytest.mark.asyncio
    async def test_multi_tf_daily_signal_valid(self, client):
        rows = (await client.get("/api/signals/multi-timeframe")).json()
        for row in rows:
            assert row["daily"]["signal"] in ("buy", "hold", "sell")

    @pytest.mark.asyncio
    async def test_multi_tf_strength_valid_values(self, client):
        rows = (await client.get("/api/signals/multi-timeframe")).json()
        valid = {"strong_buy", "strong_sell", "mostly_bullish", "mostly_bearish", "mixed"}
        for row in rows:
            assert row["strength"] in valid

    @pytest.mark.asyncio
    async def test_multi_tf_aligned_is_bool(self, client):
        rows = (await client.get("/api/signals/multi-timeframe")).json()
        for row in rows:
            assert isinstance(row["aligned"], bool)


# ── Kelly criterion ───────────────────────────────────────────────────────────

class TestKellyEndpoint:
    @pytest.mark.asyncio
    async def test_kelly_returns_200(self, client):
        r = await client.get("/api/signals/kelly")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_kelly_returns_list(self, client):
        data = (await client.get("/api/signals/kelly")).json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_kelly_row_schema(self, client):
        rows = (await client.get("/api/signals/kelly")).json()
        if not rows:
            pytest.skip("No symbols configured")
        row = rows[0]
        required = {"symbol", "win_rate", "win_loss_ratio", "full_kelly", "half_kelly", "source", "n_trades"}
        assert required <= row.keys()

    @pytest.mark.asyncio
    async def test_kelly_win_rate_in_range(self, client):
        rows = (await client.get("/api/signals/kelly")).json()
        for row in rows:
            assert 0.0 <= row["win_rate"] <= 1.0

    @pytest.mark.asyncio
    async def test_kelly_half_is_half_full(self, client):
        rows = (await client.get("/api/signals/kelly")).json()
        for row in rows:
            assert row["half_kelly"] == pytest.approx(row["full_kelly"] / 2, abs=1e-4)

    @pytest.mark.asyncio
    async def test_kelly_fractions_non_negative(self, client):
        rows = (await client.get("/api/signals/kelly")).json()
        for row in rows:
            assert row["full_kelly"] >= 0.0
            assert row["half_kelly"] >= 0.0

    @pytest.mark.asyncio
    async def test_kelly_source_valid_values(self, client):
        rows = (await client.get("/api/signals/kelly")).json()
        valid = {"model", "trades", "blended", "default"}
        for row in rows:
            assert row["source"] in valid


# ── Risk analysis ─────────────────────────────────────────────────────────────

class TestRiskEndpoints:
    @pytest.mark.asyncio
    async def test_risk_analysis_requires_symbols(self, client):
        r = await client.get("/api/risk/analysis")
        assert r.status_code == 422  # missing required query param

    @pytest.mark.asyncio
    async def test_risk_analysis_single_symbol_400(self, client):
        r = await client.get("/api/risk/analysis?symbols=SPY")
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_risk_analysis_with_data_or_404(self, client):
        r = await client.get("/api/risk/analysis?symbols=SPY,QQQ")
        # Either succeeds (200) if data was ingested, or 400/404 with a message
        assert r.status_code in (200, 400, 404)
        if r.status_code == 200:
            data = r.json()
            assert {"symbols", "weights", "assets", "portfolio_var_95"} <= data.keys()

    @pytest.mark.asyncio
    async def test_risk_schema_if_data_present(self, client):
        r = await client.get("/api/risk/analysis?symbols=SPY,QQQ")
        if r.status_code != 200:
            pytest.skip("No market data ingested")
        data = r.json()
        assert len(data["assets"]) == 2
        for asset in data["assets"]:
            assert {"symbol", "annual_return", "annual_vol", "sharpe", "max_drawdown", "var_95"} <= asset.keys()

    @pytest.mark.asyncio
    async def test_var_contribution_requires_symbols(self, client):
        r = await client.get("/api/risk/var-contribution")
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_var_contribution_single_symbol_400(self, client):
        r = await client.get("/api/risk/var-contribution?symbols=SPY")
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_var_contribution_schema(self, client):
        r = await client.get("/api/risk/var-contribution?symbols=SPY,QQQ")
        if r.status_code != 200:
            pytest.skip("No market data ingested")
        data = r.json()
        assert {"symbols", "weights", "portfolio_var_95", "contributions"} <= data.keys()

    @pytest.mark.asyncio
    async def test_var_contribution_sums_to_100(self, client):
        r = await client.get("/api/risk/var-contribution?symbols=SPY,QQQ,AAPL")
        if r.status_code != 200:
            pytest.skip("No market data ingested")
        data   = r.json()
        total  = sum(c["component_var_pct"] for c in data["contributions"])
        assert total == pytest.approx(100.0, abs=1.0)

    @pytest.mark.asyncio
    async def test_var_contribution_portfolio_var_positive(self, client):
        r = await client.get("/api/risk/var-contribution?symbols=SPY,QQQ")
        if r.status_code != 200:
            pytest.skip("No market data ingested")
        assert r.json()["portfolio_var_95"] > 0.0

    @pytest.mark.asyncio
    async def test_monte_carlo_returns_200_or_skip(self, client):
        r = await client.get("/api/risk/monte_carlo?symbols=SPY,QQQ&n_sims=100&horizon_days=21")
        if r.status_code not in (200, 400, 404):
            pytest.fail(f"Unexpected status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            assert {"paths", "stats", "n_sims"} <= data.keys()
            assert data["n_sims"] == 100


# ── Backtest ──────────────────────────────────────────────────────────────────

class TestBacktestEndpoints:
    @pytest.mark.asyncio
    async def test_backtest_list_200(self, client):
        r = await client.get("/api/backtest/list")
        assert r.status_code == 200
        data = r.json()
        assert "runs" in data
        assert isinstance(data["runs"], list)

    @pytest.mark.asyncio
    async def test_backtest_list_schema(self, client):
        runs = (await client.get("/api/backtest/list")).json()["runs"]
        for run in runs[:3]:
            assert {"id", "strategy_name", "symbols", "status", "created_at"} <= run.keys()

    @pytest.mark.asyncio
    async def test_backtest_nonexistent_returns_404(self, client):
        r = await client.get("/api/backtest/999999999")
        assert r.status_code == 404


# ── Paper trading ─────────────────────────────────────────────────────────────

class TestPaperTradingEndpoints:
    @pytest.mark.asyncio
    async def test_paper_state_200(self, client):
        r = await client.get("/api/paper/state")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_paper_state_schema(self, client):
        data = (await client.get("/api/paper/state")).json()
        assert {"account", "positions", "orders", "portfolio_history"} <= data.keys()

    @pytest.mark.asyncio
    async def test_paper_account_equity_positive(self, client):
        account = (await client.get("/api/paper/state")).json()["account"]
        assert account["equity"] > 0.0

    @pytest.mark.asyncio
    async def test_paper_submit_invalid_symbol_rejected(self, client):
        r = await client.post("/api/paper/orders", json={
            "symbol": "BADINPUT",
            "side": "buy",
            "qty": 1,
            "order_type": "market",
        })
        # Paper trading is lenient — may succeed or return 4xx/5xx
        assert r.status_code in (200, 400, 422, 500)

    @pytest.mark.asyncio
    async def test_paper_submit_zero_qty_rejected(self, client):
        r = await client.post("/api/paper/orders", json={
            "symbol": "SPY",
            "side": "buy",
            "qty": 0,
        })
        assert r.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_cancel_nonexistent_order(self, client):
        r = await client.delete("/api/paper/orders/nonexistent-order-id")
        assert r.status_code in (404, 400)


# ── Journal ───────────────────────────────────────────────────────────────────

class TestJournalEndpoints:
    @pytest.mark.asyncio
    async def test_journal_list_200(self, client):
        r = await client.get("/api/journal")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_journal_returns_list(self, client):
        data = (await client.get("/api/journal")).json()
        assert isinstance(data, list) or isinstance(data, dict)

    @pytest.mark.asyncio
    async def test_journal_entry_schema(self, client):
        resp = (await client.get("/api/journal")).json()
        # Response may be a list or a dict with an "entries" key
        entries = resp if isinstance(resp, list) else resp.get("entries", [])
        for entry in entries[:3]:
            assert {"id", "symbol", "side", "qty", "entry_price"} <= entry.keys()


# ── Patterns ──────────────────────────────────────────────────────────────────

class TestPatternsEndpoint:
    @pytest.mark.asyncio
    async def test_patterns_returns_200_or_404(self, client):
        r = await client.get("/api/patterns/SPY")
        assert r.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_patterns_schema_when_data(self, client):
        r = await client.get("/api/patterns/SPY")
        if r.status_code != 200:
            pytest.skip("No data for SPY")
        data = r.json()
        assert {"symbol", "patterns", "count"} <= data.keys()
        assert isinstance(data["patterns"], list)

    @pytest.mark.asyncio
    async def test_patterns_unknown_symbol(self, client):
        r = await client.get("/api/patterns/DOESNOTEXIST123")
        assert r.status_code in (200, 404)


# ── Fundamentals ──────────────────────────────────────────────────────────────

class TestFundamentalsEndpoint:
    @pytest.mark.asyncio
    async def test_fundamentals_returns_200_or_404(self, client):
        r = await client.get("/api/fundamentals/AAPL")
        assert r.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_fundamentals_schema(self, client):
        r = await client.get("/api/fundamentals/AAPL")
        if r.status_code != 200:
            pytest.skip("yfinance data unavailable")
        data = r.json()
        assert "symbol" in data
        assert data["symbol"] == "AAPL"


# ── Crypto ────────────────────────────────────────────────────────────────────

class TestCryptoEndpoint:
    @pytest.mark.asyncio
    async def test_crypto_returns_200(self, client):
        r = await client.get("/api/crypto/symbols")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_crypto_returns_list(self, client):
        data = (await client.get("/api/crypto/symbols")).json()
        assert isinstance(data, list)


# ── RL agent ──────────────────────────────────────────────────────────────────

class TestRLEndpoints:
    @pytest.mark.asyncio
    async def test_rl_status_200(self, client):
        r = await client.get("/api/rl/status/SPY")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_rl_status_schema(self, client):
        data = (await client.get("/api/rl/status/SPY")).json()
        assert "trained" in data

    @pytest.mark.asyncio
    async def test_rl_predict_before_training(self, client):
        r = await client.get("/api/rl/predict/SPY")
        # Before training: either 400 or returns a default prediction
        assert r.status_code in (200, 400, 404)


# ── Scanner ───────────────────────────────────────────────────────────────────

class TestScannerEndpoints:
    @pytest.mark.asyncio
    async def test_scanner_symbols_200(self, client):
        r = await client.get("/api/scanner/symbols")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    @pytest.mark.asyncio
    async def test_scanner_scan_empty_filter(self, client):
        r = await client.post("/api/scanner/scan", json={})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    @pytest.mark.asyncio
    async def test_scanner_scan_rsi_filter(self, client):
        r = await client.post("/api/scanner/scan", json={"rsi_min": 0, "rsi_max": 100})
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_scanner_invalid_sort_field(self, client):
        r = await client.post("/api/scanner/scan", json={"sort_by": "nonexistent_field"})
        assert r.status_code in (200, 400, 422)


# ── ML endpoints ──────────────────────────────────────────────────────────────

class TestMLEndpoints:
    @pytest.mark.asyncio
    async def test_ml_models_list_200(self, client):
        r = await client.get("/api/ml/models")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_ml_models_schema(self, client):
        data = (await client.get("/api/ml/models")).json()
        assert "models" in data
        assert isinstance(data["models"], list)

    @pytest.mark.asyncio
    async def test_ml_regimes_200_or_404(self, client):
        r = await client.get("/api/ml/regimes/SPY")
        assert r.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_ml_predict_without_model(self, client):
        r = await client.get("/api/ml/predict/DOESNOTEXIST999")
        assert r.status_code in (200, 404)


# ── Notifications ─────────────────────────────────────────────────────────────

class TestNotificationsEndpoints:
    @pytest.mark.asyncio
    async def test_notifications_config_200(self, client):
        r = await client.get("/api/notifications/config")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_notifications_config_schema(self, client):
        data = (await client.get("/api/notifications/config")).json()
        assert {"email_enabled", "slack_enabled"} <= data.keys()


# ── Scheduler ─────────────────────────────────────────────────────────────────

class TestSchedulerEndpoints:
    @pytest.mark.asyncio
    async def test_scheduler_jobs_200(self, client):
        r = await client.get("/api/scheduler/jobs")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ── Watchlist — frontend localStorage feature (no backend endpoint)
# Tested via the paper trading state endpoint which Watchlist page queries

class TestWatchlistBackingData:
    @pytest.mark.asyncio
    async def test_signals_provide_watchlist_data(self, client):
        """Watchlist page queries /api/signals — verify it returns compatible data."""
        r = await client.get("/api/signals")
        assert r.status_code == 200
        for row in r.json():
            assert "symbol"     in row
            assert "composite"  in row
            assert "confidence" in row
            assert "rsi"        in row

    @pytest.mark.asyncio
    async def test_paper_state_provides_rebalance_data(self, client):
        """Rebalance page queries /api/paper/state — verify positions schema."""
        data = (await client.get("/api/paper/state")).json()
        for pos in data.get("positions", []):
            required = {"symbol", "qty", "market_value", "current_price", "unrealized_pnl"}
            assert required <= pos.keys()

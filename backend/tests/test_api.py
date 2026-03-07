"""
API integration tests — covers all major route groups.

Uses ASGI transport (no real network) but connects to the real DB/Redis
when running inside the backend container via:
    docker compose -f docker-compose.prod.yml exec backend pytest tests/ -v
"""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ── Health ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_200(client):
    r = await client.get("/api/health")
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_health_schema(client):
    data = (await client.get("/api/health")).json()
    assert {"status", "database", "redis", "version"} <= data.keys()

@pytest.mark.asyncio
async def test_api_root_redirects(client):
    r = await client.get("/api/", follow_redirects=False)
    assert r.status_code in (307, 308)
    assert "/docs" in r.headers["location"]


# ── Auth ───────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_auth_me_returns_200(client):
    r = await client.get("/api/auth/me")
    assert r.status_code == 200
    data = r.json()
    assert "username" in data
    assert "auth_enabled" in data

@pytest.mark.asyncio
async def test_auth_me_disabled_when_no_key(client):
    data = (await client.get("/api/auth/me")).json()
    assert data["auth_enabled"] is False

@pytest.mark.asyncio
async def test_auth_hash_endpoint(client):
    r = await client.post("/api/auth/hash", json={"password": "testpass"})
    assert r.status_code == 200
    assert r.json()["hash"].startswith("$2b$")

@pytest.mark.asyncio
async def test_auth_login_succeeds_when_disabled(client):
    """When auth is disabled any credentials return a token."""
    r = await client.post("/api/auth/login", json={"username": "admin", "password": "anything"})
    assert r.status_code == 200
    assert "access_token" in r.json()


# ── Strategies ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_strategies_list(client):
    r = await client.get("/api/strategies")
    assert r.status_code == 200
    data = r.json()
    assert "strategies" in data
    assert isinstance(data["strategies"], list)
    assert len(data["strategies"]) > 0

@pytest.mark.asyncio
async def test_strategy_has_required_fields(client):
    first = (await client.get("/api/strategies")).json()["strategies"][0]
    assert {"name", "description", "default_params"} <= first.keys()


# ── Market data ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ohlcv_unknown_symbol_returns_empty_or_404(client):
    r = await client.get("/api/data/ohlcv/DOESNOTEXIST999")
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert isinstance(r.json(), list)


# ── Alerts ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_alerts_rules_list(client):
    r = await client.get("/api/alerts/rules")
    assert r.status_code == 200
    data = r.json()
    assert "rules" in data
    assert isinstance(data["rules"], list)

@pytest.mark.asyncio
async def test_alert_events_list(client):
    r = await client.get("/api/alerts/events")
    assert r.status_code == 200
    data = r.json()
    assert "events" in data
    assert "count" in data

@pytest.mark.asyncio
async def test_create_and_delete_alert_rule(client):
    payload = {"symbol": "SPY", "condition": "price_above", "threshold": 999999.0, "message": "pytest rule"}
    r = await client.post("/api/alerts/rules", json=payload)
    assert r.status_code in (200, 201)
    rule_id = r.json()["id"]
    rd = await client.delete(f"/api/alerts/rules/{rule_id}")
    assert rd.status_code in (200, 204)


# ── Paper trading ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_paper_state(client):
    r = await client.get("/api/paper/state")
    assert r.status_code == 200
    data = r.json()
    assert "account" in data
    assert "positions" in data
    assert "orders" in data

@pytest.mark.asyncio
async def test_paper_account_fields(client):
    account = (await client.get("/api/paper/state")).json()["account"]
    assert {"equity", "cash", "buying_power"} <= account.keys()


# ── Scanner ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_scanner_symbols(client):
    r = await client.get("/api/scanner/symbols")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

@pytest.mark.asyncio
async def test_scanner_scan_empty_filter(client):
    r = await client.post("/api/scanner/scan", json={})
    assert r.status_code == 200
    assert isinstance(r.json(), list)

@pytest.mark.asyncio
async def test_scanner_scan_with_rsi_filter(client):
    r = await client.post("/api/scanner/scan", json={"rsi_max": 100, "sort_by": "symbol", "sort_desc": False})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ── Optimize ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_optimize_default_params(client):
    r = await client.get("/api/optimize/params")
    assert r.status_code == 200
    assert isinstance(r.json(), dict)

@pytest.mark.asyncio
async def test_optimize_list(client):
    r = await client.get("/api/optimize/list")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ── Analytics ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_analytics_summary(client):
    r = await client.get("/api/analytics/summary")
    assert r.status_code == 200
    data = r.json()
    assert {"equity", "total_return", "sharpe_ratio"} <= data.keys()

@pytest.mark.asyncio
async def test_analytics_rolling(client):
    r = await client.get("/api/analytics/rolling")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

@pytest.mark.asyncio
async def test_analytics_pnl_attribution(client):
    r = await client.get("/api/analytics/pnl_attribution")
    assert r.status_code == 200

@pytest.mark.asyncio
async def test_analytics_export(client):
    r = await client.get("/api/analytics/export")
    assert r.status_code == 200


# ── Auto-trade ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_autotrade_config(client):
    r = await client.get("/api/autotrade/config")
    assert r.status_code == 200
    data = r.json()
    assert "enabled" in data
    assert "symbols" in data

@pytest.mark.asyncio
async def test_autotrade_log(client):
    r = await client.get("/api/autotrade/log")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ── News sentiment ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_news_returns_aggregate(client):
    r = await client.get("/api/news/SPY?max_articles=3")
    assert r.status_code == 200
    data = r.json()
    assert {"symbol", "article_count", "avg_compound", "label", "articles"} <= data.keys()
    assert data["symbol"] == "SPY"

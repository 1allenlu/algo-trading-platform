"""
pytest configuration for the trading platform test suite.

The session-scoped event_loop fixture ensures all async tests share a single
event loop, preventing "Future attached to a different loop" errors from
SQLAlchemy's asyncpg connection pool.
"""

import asyncio
import pytest
from httpx import AsyncClient, ASGITransport


@pytest.fixture(scope="session")
def event_loop():
    """Single event loop shared across all async tests in the session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def client():
    """
    Async HTTP client wired directly to the FastAPI ASGI app.
    No real network — speaks directly via ASGI transport.
    """
    from app.main import app
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c

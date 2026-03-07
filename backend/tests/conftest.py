"""
pytest configuration for the trading platform test suite.

The session-scoped event_loop fixture ensures all async tests share a single
event loop, preventing "Future attached to a different loop" errors from
SQLAlchemy's asyncpg connection pool.
"""

import asyncio
import pytest


@pytest.fixture(scope="session")
def event_loop():
    """Single event loop shared across all async tests in the session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

"""
FastAPI dependency injection functions.

These are injected into route handlers via Depends().
Using DI keeps routes thin and makes testing easy (override deps in tests).
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield an async database session for the duration of a request.

    Pattern: one session per request, automatically committed on success
    and rolled back on exception. The finally block ensures the session
    is always closed, returning the connection to the pool.

    Usage in routes:
        @router.get("/example")
        async def example(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

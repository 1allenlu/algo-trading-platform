"""
FastAPI dependency injection functions.

These are injected into route handlers via Depends().
Using DI keeps routes thin and makes testing easy (override deps in tests).
"""

from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal

# OAuth2 scheme — extracts Bearer token from Authorization header.
# auto_error=False so we can return "anonymous" when auth is disabled
# instead of always raising 401.
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(token: str | None = Depends(_oauth2_scheme)) -> str:
    """
    Validate the JWT Bearer token and return the username.

    When JWT_SECRET_KEY is not set (auth disabled), returns "anonymous"
    unconditionally so all existing routes keep working without a token.

    Raises HTTP 401 when:
      - Auth IS enabled
      - No token provided, or token is invalid / expired
    """
    from app.services.auth_service import auth_enabled, decode_token

    if not auth_enabled():
        return "anonymous"   # Auth disabled — all routes are public

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated — provide a Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = decode_token(token)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return username


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

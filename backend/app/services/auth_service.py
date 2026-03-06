"""
Auth Service — Phase 17.

Single-user JWT authentication backed by environment variables.
No database User table — credentials are stored in .env for simplicity.

Configuration (set in .env):
  JWT_SECRET_KEY       = <random 64-char hex string>
  ADMIN_USERNAME       = admin
  ADMIN_PASSWORD_HASH  = <bcrypt hash of your password>

Generate a password hash:
  python -c "from passlib.context import CryptContext; c = CryptContext(schemes=['bcrypt']); print(c.hash('your-password'))"

If JWT_SECRET_KEY is empty, authentication is DISABLED and all routes
are accessible without a token (development convenience).

Access token lifetime: settings.JWT_EXPIRE_MINUTES (default 8 hours).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from loguru import logger

from app.core.config import settings

# Lazy imports — only needed when auth is enabled
_pwd_context = None
_jwt = None


def _get_pwd_context():
    global _pwd_context
    if _pwd_context is None:
        from passlib.context import CryptContext
        _pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return _pwd_context


def auth_enabled() -> bool:
    """Return True if JWT_SECRET_KEY is configured."""
    return bool(settings.JWT_SECRET_KEY)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        return _get_pwd_context().verify(plain, hashed)
    except Exception as exc:
        logger.warning(f"[auth] Password verify error: {exc}")
        return False


def hash_password(plain: str) -> str:
    """Return a bcrypt hash for a plaintext password."""
    return _get_pwd_context().hash(plain)


def authenticate_user(username: str, password: str) -> bool:
    """
    Check credentials against the configured admin account.
    Returns True if valid, False otherwise.
    """
    if not auth_enabled():
        return True   # Auth disabled — always succeed

    if username != settings.ADMIN_USERNAME:
        return False

    if not settings.ADMIN_PASSWORD_HASH:
        # No hash configured — reject all logins (force user to set hash)
        logger.warning("[auth] ADMIN_PASSWORD_HASH not set — rejecting login")
        return False

    return verify_password(password, settings.ADMIN_PASSWORD_HASH)


def create_access_token(subject: str) -> str:
    """
    Create a signed JWT access token.

    Claims:
      sub  — username
      exp  — expiry (now + JWT_EXPIRE_MINUTES)
      iat  — issued at
    """
    from jose import jwt

    now    = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> str | None:
    """
    Decode and validate a JWT.
    Returns the `sub` claim on success, None on any failure.
    """
    if not auth_enabled():
        return "anonymous"

    try:
        from jose import JWTError, jwt
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload.get("sub")
    except Exception:
        return None

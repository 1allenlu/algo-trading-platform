"""
Auth Service — Phase 17 / Phase 23.

Phase 17: single-user JWT backed by environment variables.
Phase 23: multi-user JWT backed by the PostgreSQL `users` table.

Migration path:
  When the `users` table is empty, the service falls back to the env-var
  ADMIN_PASSWORD_HASH / ADMIN_USERNAME so existing deployments keep working
  without any manual steps. Creating the first user via POST /api/auth/users
  switches the system to DB-backed auth automatically.

Configuration:
  JWT_SECRET_KEY       = <random 64-char hex string>  (required to enable auth)
  ADMIN_USERNAME       = admin
  ADMIN_PASSWORD_HASH  = <bcrypt hash>                (used only when no DB users)

If JWT_SECRET_KEY is empty, authentication is DISABLED (development convenience).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from loguru import logger

from app.core.config import settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


def auth_enabled() -> bool:
    """Return True if JWT_SECRET_KEY is configured."""
    return bool(settings.JWT_SECRET_KEY)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    try:
        import bcrypt
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception as exc:
        logger.warning(f"[auth] Password verify error: {exc}")
        return False


def hash_password(plain: str) -> str:
    """Return a bcrypt hash for a plaintext password."""
    import bcrypt
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


async def authenticate_user(username: str, password: str, db: "AsyncSession | None" = None) -> bool:
    """
    Check credentials. Strategy:
      1. If DB session provided + users table has rows → DB lookup (Phase 23)
      2. Otherwise fall back to ADMIN_USERNAME / ADMIN_PASSWORD_HASH env vars
    Returns True if valid, False otherwise.
    """
    if not auth_enabled():
        return True   # Auth disabled — always succeed

    # ── Phase 23: DB lookup ──────────────────────────────────────────────────
    if db is not None:
        try:
            from sqlalchemy import func, select
            from app.models.database import User
            count = await db.scalar(select(func.count()).select_from(User))
            if count and count > 0:
                user = await db.scalar(
                    select(User).where(User.username == username, User.is_active == True)  # noqa: E712
                )
                if user is None:
                    return False
                ok = verify_password(password, user.password_hash)
                if ok:
                    # Update last_login_at
                    user.last_login_at = datetime.now(timezone.utc)
                    await db.flush()
                return ok
        except Exception as exc:
            logger.warning(f"[auth] DB lookup failed, falling back to env: {exc}")

    # ── Phase 17 fallback: env-var credentials ────────────────────────────────
    if username != settings.ADMIN_USERNAME:
        return False
    if not settings.ADMIN_PASSWORD_HASH:
        logger.warning("[auth] ADMIN_PASSWORD_HASH not set — rejecting login")
        return False
    return verify_password(password, settings.ADMIN_PASSWORD_HASH)


async def create_user(
    username: str,
    email: str | None,
    password: str,
    role: str,
    db: "AsyncSession",
) -> object:
    """Create a new user row. Raises ValueError on duplicate username."""
    from sqlalchemy import select
    from app.models.database import User

    existing = await db.scalar(select(User).where(User.username == username))
    if existing:
        raise ValueError(f"Username '{username}' already exists")

    user = User(
        username      = username,
        email         = email,
        password_hash = hash_password(password),
        role          = role,
        is_active     = True,
        created_at    = datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


async def list_users(db: "AsyncSession") -> list:
    """Return all users ordered by created_at."""
    from sqlalchemy import select
    from app.models.database import User
    rows = (await db.scalars(select(User).order_by(User.created_at))).all()
    return list(rows)


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
        from jose import jwt
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload.get("sub")
    except Exception:
        return None

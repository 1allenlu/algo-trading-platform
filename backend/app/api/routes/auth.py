"""
Auth routes — Phase 17 / Phase 23.

Phase 17: single-user JWT (env-var credentials)
Phase 23: multi-user JWT with PostgreSQL users table + user management API

Endpoints:
  POST /api/auth/login              → {access_token, token_type, expires_in}
  POST /api/auth/register           → open self-signup (viewer role)
  GET  /api/auth/me                 → {username, role, auth_enabled}
  POST /api/auth/hash               → {hash} (dev utility)

  Phase 23 user management (admin only):
  GET  /api/auth/users              → list all users
  POST /api/auth/users              → create user
  DELETE /api/auth/users/{id}       → deactivate user
  POST /api/auth/users/{id}/password → change password
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_admin
from app.core.config import settings
from app.services.auth_service import (
    auth_enabled,
    authenticate_user,
    create_access_token,
    create_user,
    hash_password,
    list_users,
    verify_password,
)

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    expires_in:   int


class LoginRequest(BaseModel):
    username: str
    password: str


class HashRequest(BaseModel):
    password: str


class UserResponse(BaseModel):
    id:            int
    username:      str
    email:         str | None
    role:          str
    is_active:     bool
    created_at:    str
    last_login_at: str | None


class CreateUserRequest(BaseModel):
    username: str
    password: str
    email:    str | None = None
    role:     str = "viewer"   # "admin" | "viewer"


class RegisterRequest(BaseModel):
    username: str
    password: str
    email:    str | None = None


class ChangePasswordRequest(BaseModel):
    new_password: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """
    Exchange credentials for a JWT access token.
    Phase 23: tries DB lookup first; falls back to env-var credentials when
    no users exist in the database.
    """
    if not await authenticate_user(body.username, body.password, db):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(body.username)
    return TokenResponse(
        access_token = token,
        expires_in   = settings.JWT_EXPIRE_MINUTES * 60,
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """
    Open self-registration. Creates a new account with 'viewer' role and
    immediately returns a JWT so the user is logged in after signing up.
    """
    if not auth_enabled():
        raise HTTPException(status_code=400, detail="Auth is disabled on this server")

    try:
        await create_user(body.username, body.email, body.password, "viewer", db)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    token = create_access_token(body.username)
    return TokenResponse(
        access_token=token,
        expires_in=settings.JWT_EXPIRE_MINUTES * 60,
    )


@router.get("/me")
async def get_me(
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the currently authenticated user with role information."""
    role = "admin"   # default when using env-var auth
    email = None

    if current_user != "anonymous":
        try:
            from sqlalchemy import select
            from app.models.database import User
            user = await db.scalar(select(User).where(User.username == current_user))
            if user:
                role  = user.role
                email = user.email
        except Exception:
            pass

    return {
        "username":     current_user,
        "role":         role,
        "email":        email,
        "auth_enabled": auth_enabled(),
    }


@router.post("/hash")
async def generate_hash(body: HashRequest) -> dict:
    """Dev utility — generate a bcrypt hash for a plaintext password."""
    return {"hash": hash_password(body.password)}


# ── Phase 23: User management (admin only) ────────────────────────────────────

@router.get("/users", response_model=list[UserResponse])
async def get_users(
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[UserResponse]:
    """List all users (admin only)."""
    users = await list_users(db)
    return [
        UserResponse(
            id            = u.id,
            username      = u.username,
            email         = u.email,
            role          = u.role,
            is_active     = u.is_active,
            created_at    = u.created_at.isoformat(),
            last_login_at = u.last_login_at.isoformat() if u.last_login_at else None,
        )
        for u in users
    ]


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_new_user(
    body: CreateUserRequest,
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Create a new user (admin only)."""
    if body.role not in ("admin", "viewer"):
        raise HTTPException(status_code=400, detail="role must be 'admin' or 'viewer'")
    try:
        user = await create_user(body.username, body.email, body.password, body.role, db)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return UserResponse(
        id            = user.id,
        username      = user.username,
        email         = user.email,
        role          = user.role,
        is_active     = user.is_active,
        created_at    = user.created_at.isoformat(),
        last_login_at = None,
    )


@router.delete("/users/{user_id}", status_code=204)
async def deactivate_user(
    user_id: int,
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Deactivate a user account (soft delete — sets is_active=False). Admin only."""
    from app.models.database import User
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    await db.flush()


@router.post("/users/{user_id}/password")
async def change_password(
    user_id: int,
    body: ChangePasswordRequest,
    current_user: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Change a user's password.
    Users can change their own password; admins can change any password.
    """
    from sqlalchemy import select
    from app.models.database import User

    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Check authorization: must be self or admin
    caller = await db.scalar(select(User).where(User.username == current_user))
    is_admin = (caller is not None and caller.role == "admin")
    is_self  = (caller is not None and caller.id == user_id)

    if not (is_admin or is_self) and current_user != "anonymous":
        raise HTTPException(status_code=403, detail="Not authorized")

    target.password_hash = hash_password(body.new_password)
    await db.flush()
    return {"message": "Password updated"}

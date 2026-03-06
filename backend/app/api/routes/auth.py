"""
Auth routes — Phase 17.

Single-user JWT authentication.  No registration flow — credentials are
configured via environment variables (ADMIN_USERNAME, ADMIN_PASSWORD_HASH).

Endpoints:
  POST /api/auth/login   → {access_token, token_type, expires_in}
  GET  /api/auth/me      → {username, auth_enabled}
  POST /api/auth/hash    → {hash} (dev utility — generate a bcrypt hash)
"""

from fastapi import APIRouter, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from fastapi import Depends

from app.services.auth_service import (
    authenticate_user,
    auth_enabled,
    create_access_token,
    hash_password,
)
from app.core.config import settings
from app.api.deps import get_current_user

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    expires_in:   int            # seconds


class LoginRequest(BaseModel):
    username: str
    password: str


class HashRequest(BaseModel):
    password: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest) -> TokenResponse:
    """
    Exchange username + password for a JWT access token.

    When auth is DISABLED (JWT_SECRET_KEY not set), any credentials are
    accepted and a dummy token is returned (frontend stays compatible).
    """
    if not authenticate_user(body.username, body.password):
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


@router.get("/me")
async def get_me(current_user: str = Depends(get_current_user)) -> dict:
    """Return the currently authenticated user (or 'anonymous' when auth disabled)."""
    return {
        "username":     current_user,
        "auth_enabled": auth_enabled(),
    }


@router.post("/hash")
async def generate_hash(body: HashRequest) -> dict:
    """
    Development utility — generate a bcrypt hash for a plaintext password.
    Copy the returned hash into ADMIN_PASSWORD_HASH in your .env file.

    This endpoint is always accessible (even with auth enabled) so you can
    set up credentials on a fresh deployment.
    """
    return {"hash": hash_password(body.password)}

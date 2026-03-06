from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables or .env file.
    Pydantic-settings validates types and provides sensible defaults.
    Override any value by setting the corresponding env var.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # Silently ignore unknown env vars (e.g., Docker injections)
    )

    # ── Database ──────────────────────────────────────────────────────────────
    # Uses asyncpg driver for async SQLAlchemy. The +asyncpg suffix selects
    # the async driver instead of the default sync psycopg2.
    DATABASE_URL: str = "postgresql+asyncpg://trading:trading@localhost:5432/trading_db"
    DATABASE_POOL_SIZE: int = 10       # Connections kept open in the pool
    DATABASE_MAX_OVERFLOW: int = 20    # Extra connections allowed beyond pool_size

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379"
    CACHE_TTL_SECONDS: int = 300       # 5 min default cache expiry

    # ── API ───────────────────────────────────────────────────────────────────
    API_V1_PREFIX: str = "/api"
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    # ── Application ───────────────────────────────────────────────────────────
    APP_NAME: str = "Trading Platform"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # ── Alpaca (Phase 13) ─────────────────────────────────────────────────────
    # Free paper-trading keys at https://alpaca.markets → Paper Trading
    # Leave empty to use DB prices only (no external API needed)
    ALPACA_API_KEY:    str = ""
    ALPACA_SECRET_KEY: str = ""

    # ── Auth (Phase 17) ───────────────────────────────────────────────────────
    # Set JWT_SECRET_KEY to enable JWT authentication. Leave empty to skip.
    # Generate: python -c "import secrets; print(secrets.token_hex(32))"
    JWT_SECRET_KEY:      str = ""
    JWT_ALGORITHM:       str = "HS256"
    JWT_EXPIRE_MINUTES:  int = 480   # 8 hours access token lifetime
    ADMIN_USERNAME:      str = "admin"
    ADMIN_PASSWORD_HASH: str = ""    # bcrypt hash — set via .env


# Single shared instance — import this everywhere
settings = Settings()

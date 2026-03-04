import sys
from pathlib import Path
from loguru import logger
from app.core.config import settings


def setup_logging() -> None:
    """
    Configure loguru with:
    - Colored stdout output (human-friendly in dev)
    - Rotating file output in logs/ (machine-readable, persists across restarts)
    """
    # Remove loguru's default handler before adding our own
    logger.remove()

    # ── Stdout (colored, dev-friendly) ────────────────────────────────────────
    logger.add(
        sys.stdout,
        level=settings.LOG_LEVEL,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> — "
            "<level>{message}</level>"
        ),
        colorize=True,
        enqueue=True,   # Thread-safe async logging
    )

    # ── File output (rotating, compressed) ────────────────────────────────────
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)

    logger.add(
        log_dir / "app.log",
        level="DEBUG",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} — {message}",
        rotation="1 day",     # New file each day
        retention="7 days",   # Keep 1 week of logs
        compression="gz",     # Compress rotated logs
        enqueue=True,
    )

    logger.info(f"Logging initialized — level={settings.LOG_LEVEL}")

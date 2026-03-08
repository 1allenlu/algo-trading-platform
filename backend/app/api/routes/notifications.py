"""
Notifications Routes — Phase 20.

GET  /api/notifications/config  — show which channels are configured
POST /api/notifications/test    — send a test notification
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings
from app.services.notification_service import send_test

router = APIRouter()


class NotificationConfig(BaseModel):
    email_enabled: bool
    email_recipient: str
    smtp_host: str
    slack_enabled: bool


class TestRequest(BaseModel):
    channel: str   # "email" | "slack"


class TestResponse(BaseModel):
    ok: bool
    message: str


@router.get("/config", response_model=NotificationConfig, tags=["notifications"])
async def get_notification_config() -> NotificationConfig:
    """Return which notification channels are configured (no secrets exposed)."""
    return NotificationConfig(
        email_enabled=bool(settings.SMTP_HOST and settings.SMTP_USER and settings.NOTIFY_EMAIL),
        email_recipient=settings.NOTIFY_EMAIL,
        smtp_host=settings.SMTP_HOST,
        slack_enabled=bool(settings.SLACK_WEBHOOK_URL),
    )


@router.post("/test", response_model=TestResponse, tags=["notifications"])
async def test_notification(body: TestRequest) -> TestResponse:
    """Send a test message to verify the chosen channel is working."""
    result = await send_test(body.channel)
    return TestResponse(**result)

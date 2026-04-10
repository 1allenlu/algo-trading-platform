"""
Notification Service — Phase 20.

Sends email (SMTP via aiosmtplib) and/or Slack (incoming webhook via httpx)
when alert rules fire.

Configuration (set in .env — all optional):
  SMTP_HOST         = smtp.gmail.com
  SMTP_PORT         = 587            (TLS port; use 465 for SSL)
  SMTP_USER         = you@gmail.com
  SMTP_PASSWORD     = app-password
  NOTIFY_EMAIL      = recipient@example.com
  SLACK_WEBHOOK_URL = https://hooks.slack.com/services/...

If none are configured the service is a no-op — the alert pipeline works
exactly as before.

The notify_alert() function is called from alert_service._fire_alert() via
asyncio.create_task() so it never blocks the main alert evaluation loop.
"""

from __future__ import annotations

from loguru import logger

from app.core.config import settings


async def send_email(subject: str, body: str) -> None:
    """Send a plain-text email via SMTP TLS."""
    if not (settings.SMTP_HOST and settings.SMTP_USER and settings.NOTIFY_EMAIL):
        return
    try:
        import aiosmtplib
        await aiosmtplib.send(
            f"Subject: {subject}\nFrom: {settings.SMTP_USER}\nTo: {settings.NOTIFY_EMAIL}\n\n{body}",
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
            sender=settings.SMTP_USER,
            recipients=[settings.NOTIFY_EMAIL],
        )
        logger.info(f"[notify] Email sent: {subject}")
    except Exception as exc:
        logger.warning(f"[notify] Email send failed: {exc}")


async def send_slack(text: str) -> None:
    """Send a Slack message via an incoming webhook URL."""
    if not settings.SLACK_WEBHOOK_URL:
        return
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(
                settings.SLACK_WEBHOOK_URL,
                json={"text": text},
            )
            if resp.status_code != 200:
                logger.warning(f"[notify] Slack returned {resp.status_code}: {resp.text}")
            else:
                logger.info("[notify] Slack message sent")
    except Exception as exc:
        logger.warning(f"[notify] Slack send failed: {exc}")


async def send_webhook(url: str, payload: dict) -> None:
    """Phase 66 — POST alert payload to a custom webhook URL."""
    if not url:
        return
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code not in (200, 201, 202, 204):
                logger.warning(f"[notify] Webhook {url} returned {resp.status_code}")
            else:
                logger.info(f"[notify] Webhook delivered to {url}")
    except Exception as exc:
        logger.warning(f"[notify] Webhook failed: {exc}")


async def notify_alert(rule: dict, event: dict) -> None:
    """
    Dispatch notifications for a fired alert.
    Called fire-and-forget from alert_service — never raises.

    Args:
        rule:  dict with keys: symbol, condition, threshold
        event: dict with keys: current_value, message, triggered_at
    """
    try:
        symbol    = rule.get("symbol", "?")
        condition = rule.get("condition", "?")
        threshold = rule.get("threshold", 0)
        value     = event.get("current_value", 0)
        message   = event.get("message", "")
        timestamp = event.get("triggered_at", "")

        subject = f"[Trading Alert] {symbol}: {condition} @ {value:.2f}"
        body = (
            f"Alert fired!\n\n"
            f"Symbol:    {symbol}\n"
            f"Condition: {condition}\n"
            f"Threshold: {threshold}\n"
            f"Value:     {value:.4f}\n"
            f"Message:   {message}\n"
            f"Time:      {timestamp}\n"
        )
        slack_text = (
            f":bell: *Alert: {symbol}* — {condition} triggered\n"
            f"> Value: `{value:.4f}` | Threshold: `{threshold}` | {message}"
        )

        # Phase 66: custom webhook
        webhook_url = rule.get("webhook_url")
        webhook_payload = {
            "symbol": symbol, "condition": condition,
            "threshold": threshold, "value": value,
            "message": message, "triggered_at": timestamp,
        }

        import asyncio
        await asyncio.gather(
            send_email(subject, body),
            send_slack(slack_text),
            send_webhook(webhook_url, webhook_payload) if webhook_url else asyncio.sleep(0),
            return_exceptions=True,
        )
    except Exception as exc:
        logger.warning(f"[notify] notify_alert error (non-fatal): {exc}")


async def send_test(channel: str) -> dict:
    """
    Send a test notification to verify configuration.
    Returns {"ok": bool, "message": str}.
    """
    subject = "QuantStream — Test Notification"
    body    = "This is a test notification from your QuantStream."

    if channel == "email":
        if not (settings.SMTP_HOST and settings.SMTP_USER and settings.NOTIFY_EMAIL):
            return {"ok": False, "message": "Email not configured (SMTP_HOST / SMTP_USER / NOTIFY_EMAIL missing)"}
        try:
            await send_email(subject, body)
            return {"ok": True, "message": f"Test email sent to {settings.NOTIFY_EMAIL}"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    elif channel == "slack":
        if not settings.SLACK_WEBHOOK_URL:
            return {"ok": False, "message": "Slack not configured (SLACK_WEBHOOK_URL missing)"}
        try:
            await send_slack(f":white_check_mark: {subject}")
            return {"ok": True, "message": "Test Slack message sent"}
        except Exception as exc:
            return {"ok": False, "message": str(exc)}

    return {"ok": False, "message": f"Unknown channel: {channel}"}

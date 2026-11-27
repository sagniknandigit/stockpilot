"""Outgoing email. Sends via SMTP when configured; otherwise logs the message (dev)."""

import asyncio
import html
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def render(title: str, paragraphs: list[str], cta: tuple[str, str] | None = None) -> str:
    """Minimal inline-styled HTML that renders acceptably in every mail client."""
    body = "".join(
        f'<p style="margin:0 0 12px;color:#334155;line-height:1.5">{p}</p>' for p in paragraphs
    )
    button = ""
    if cta:
        label, url = cta
        button = (
            f'<a href="{html.escape(url)}" style="display:inline-block;margin-top:8px;'
            "padding:10px 16px;border-radius:8px;background:#4f46e5;color:#fff;"
            f'text-decoration:none;font-weight:600">{html.escape(label)}</a>'
        )
    return (
        '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;'
        'margin:0 auto;padding:24px">'
        '<div style="font-weight:700;color:#4f46e5;margin-bottom:16px">StockPilot</div>'
        f'<h1 style="font-size:20px;color:#0f172a;margin:0 0 16px">{html.escape(title)}</h1>'
        f"{body}{button}</div>"
    )


def _send_smtp(message: EmailMessage) -> None:
    assert settings.smtp_host
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
        if settings.smtp_use_tls:
            smtp.starttls()
        if settings.smtp_username and settings.smtp_password:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


async def send_email(to: list[str], subject: str, html_body: str, text_body: str) -> None:
    if not to:
        return
    if not settings.smtp_host:
        logger.info("email (SMTP not configured) to=%s subject=%r\n%s", to, subject, text_body)
        return
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = ", ".join(to)
    message["Subject"] = subject
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    await asyncio.to_thread(_send_smtp, message)

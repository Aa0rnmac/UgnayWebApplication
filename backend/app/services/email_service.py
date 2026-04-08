from __future__ import annotations

from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
import re
import smtplib

from app.core.config import settings


class EmailDeliveryError(RuntimeError):
    pass


def _build_from_header() -> str:
    return f"{settings.email_from_name} <{settings.email_from_address}>"


def _safe_filename_fragment(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip().lower())
    return cleaned.strip("-") or "recipient"


def _write_dev_email(message: EmailMessage) -> Path:
    output_dir = settings.dev_email_output_dir_path
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    recipient = _safe_filename_fragment(message["To"] or "recipient")
    destination = output_dir / f"{timestamp}-{recipient}.eml"
    destination.write_text(message.as_string(), encoding="utf-8")
    return destination


def send_email(message: EmailMessage) -> str:
    if not settings.smtp_host:
        destination = _write_dev_email(message)
        return f"logged:{destination.as_posix()}"

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=settings.smtp_timeout_seconds,
            ) as server:
                if settings.smtp_username and settings.smtp_password:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(message)
        else:
            with smtplib.SMTP(
                settings.smtp_host,
                settings.smtp_port,
                timeout=settings.smtp_timeout_seconds,
            ) as server:
                if settings.smtp_use_tls:
                    server.starttls()
                if settings.smtp_username and settings.smtp_password:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(message)
    except Exception as exc:  # pragma: no cover - transport-specific failures
        raise EmailDeliveryError(str(exc)) from exc

    return "sent"


def build_student_credentials_email(
    *,
    recipient_email: str,
    recipient_name: str,
    username: str,
    temporary_password: str,
    batch_name: str | None,
) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = "Your FSL Learning Hub Student Credentials"
    message["From"] = _build_from_header()
    message["To"] = recipient_email

    batch_line = f"Assigned batch: {batch_name}\n" if batch_name else ""
    message.set_content(
        (
            f"Hello {recipient_name},\n\n"
            "Your student enrollment has been approved.\n\n"
            f"Username: {username}\n"
            f"Temporary password: {temporary_password}\n"
            f"{batch_line}"
            "Please sign in and change your password after your first login.\n\n"
            "FSL Learning Hub"
        )
    )
    return message

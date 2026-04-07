import smtplib
from email.message import EmailMessage

from app.core.config import settings


def send_password_reset_otp_email(
    to_email: str, otp_code: str, username: str, otp_valid_minutes: int
) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL in backend/.env."
        )

    message = EmailMessage()
    message["Subject"] = "UGNAY Learning Hub - Password Reset OTP"
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(
        (
            f"Hello {username},\n\n"
            "You requested a password reset for your UGNAY Learning Hub account.\n"
            f"Your OTP code is: {otp_code}\n"
            f"This code expires in {otp_valid_minutes} minutes.\n\n"
            "If you did not request this, you can ignore this email.\n\n"
            "Hand and Heart\n"
        )
    )

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=30) as client:
                if settings.smtp_username:
                    client.login(settings.smtp_username, settings.smtp_password)
                client.send_message(message)
            return

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as client:
            if settings.smtp_use_tls:
                client.starttls()
            if settings.smtp_username:
                client.login(settings.smtp_username, settings.smtp_password)
            client.send_message(message)
    except Exception as exc:  # pragma: no cover - depends on SMTP environment
        raise RuntimeError("Failed to send OTP email. Check SMTP credentials/settings.") from exc

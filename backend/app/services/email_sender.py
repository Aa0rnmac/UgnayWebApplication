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


def send_teacher_initial_credentials_email(
    to_email: str, username: str, temporary_password: str
) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL in backend/.env."
        )

    message = EmailMessage()
    message["Subject"] = "UGNAY Learning Hub - Teacher Initial Credentials"
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(
        (
            "Hello Teacher,\n\n"
            "Your teacher account has been created for UGNAY Learning Hub.\n\n"
            f"Username: {username}\n"
            f"Temporary Password: {temporary_password}\n\n"
            "Please log in and change your password immediately.\n\n"
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
        raise RuntimeError("Failed to send teacher credentials email. Check SMTP settings.") from exc


def send_admin_initial_credentials_email(
    to_email: str, username: str, temporary_password: str
) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL in backend/.env."
        )

    message = EmailMessage()
    message["Subject"] = "UGNAY Learning Hub - Admin Initial Credentials"
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(
        (
            "Hello Admin,\n\n"
            "Your admin account has been created for UGNAY Learning Hub.\n\n"
            f"Username: {username}\n"
            f"Temporary Password: {temporary_password}\n\n"
            "Please log in and change your password immediately.\n\n"
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
        raise RuntimeError("Failed to send admin credentials email. Check SMTP settings.") from exc


def send_student_initial_credentials_email(
    *,
    to_email: str,
    username: str,
    temporary_password: str,
    batch_name: str | None = None,
) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL in backend/.env."
        )

    batch_line = f"Assigned Batch: {batch_name}\n" if batch_name else ""
    message = EmailMessage()
    message["Subject"] = "UGNAY Learning Hub - Student Initial Credentials"
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(
        (
            "Hello Student,\n\n"
            "Your enrollment has been approved for UGNAY Learning Hub.\n\n"
            f"Username: {username}\n"
            f"Temporary Password: {temporary_password}\n"
            f"{batch_line}\n"
            "Please log in and change your password immediately.\n\n"
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
        raise RuntimeError("Failed to send student credentials email. Check SMTP settings.") from exc


def send_teacher_student_report_email(
    to_email: str,
    teacher_name: str,
    student_name: str,
    module_title: str,
    assessment_title: str,
    right_count: int,
    wrong_count: int,
    score_percent: float | None,
    improvement_areas: list[str],
    completed_modules: int,
    total_modules: int,
) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL in backend/.env."
        )

    score_text = "N/A" if score_percent is None else f"{score_percent:.2f}%"
    improvements = (
        "\n".join([f"- {area}" for area in improvement_areas])
        if improvement_areas
        else "- No specific weak areas detected from this assessment."
    )

    message = EmailMessage()
    message["Subject"] = f"UGNAY Report - {student_name} - {module_title}"
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(
        (
            f"Hello {teacher_name},\n\n"
            "A student completed an assessment and the report is ready for your review.\n\n"
            f"Student: {student_name}\n"
            f"Module: {module_title}\n"
            f"Assessment: {assessment_title}\n"
            f"Right: {right_count}\n"
            f"Wrong: {wrong_count}\n"
            f"Score: {score_text}\n"
            f"Modules Completed: {completed_modules}/{total_modules}\n\n"
            "Suggested focus areas:\n"
            f"{improvements}\n\n"
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
        raise RuntimeError("Failed to send teacher report email. Check SMTP settings.") from exc


def send_student_rejection_email(
    *,
    to_email: str,
    student_name: str,
    rejection_reason: str,
) -> None:
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL in backend/.env."
        )

    message = EmailMessage()
    message["Subject"] = "UGNAY Learning Hub - Enrollment Application Update"
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(
        (
            f"Hello {student_name},\n\n"
            "Thank you for applying to UGNAY Learning Hub.\n\n"
            "After reviewing your application, we are unable to approve it at this time.\n\n"
            "Reason:\n"
            f"{rejection_reason}\n\n"
            "If you believe this was a mistake or you would like to clarify the submitted details, "
            "please contact the school or teacher.\n\n"
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
        raise RuntimeError("Failed to send student rejection email. Check SMTP settings.") from exc

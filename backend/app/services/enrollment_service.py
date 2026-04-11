from dataclasses import dataclass
from datetime import datetime, timezone
import re

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.batch import Batch
from app.models.enrollment import Enrollment
from app.models.registration import Registration
from app.models.user import User
from app.services.email_sender import send_student_initial_credentials_email
from app.services.teacher_scope import ensure_teacher_can_assign_batch
from app.services.teacher_invites import generate_temporary_password

BATCH_CODE_PATTERN = re.compile(r"[^A-Z0-9-]+")


@dataclass
class EnrollmentApprovalResult:
    enrollment: Enrollment
    issued_username: str
    temporary_password: str
    delivery_status: str
    delivery_message: str
    recipient_email: str


def teacher_display_name(user: User) -> str:
    full_name = " ".join(
        part.strip()
        for part in [user.first_name or "", user.middle_name or "", user.last_name or ""]
        if part and part.strip()
    ).strip()
    return full_name or user.username


def registration_display_name(registration: Registration) -> str:
    full_name = " ".join(
        part.strip()
        for part in [registration.first_name, registration.middle_name or "", registration.last_name]
        if part and part.strip()
    ).strip()
    return full_name or registration.email


def normalize_batch_code(value: str) -> str:
    normalized = BATCH_CODE_PATTERN.sub("-", value.strip().upper())
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Batch code is required.",
        )
    return normalized


def _normalize_batch_name(value: str) -> str:
    normalized = " ".join(value.split()).strip()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Batch name is required.",
        )
    return normalized


def get_or_create_batch(
    db: Session,
    *,
    current_teacher: User,
    batch_id: int | None = None,
    batch_code: str | None = None,
    batch_name: str | None = None,
) -> Batch:
    if batch_id is not None:
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        if not batch:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")
        return ensure_teacher_can_assign_batch(db, current_teacher=current_teacher, batch=batch)

    if not batch_code and not batch_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide batch_id or batch_code/batch_name.",
        )

    normalized_code = normalize_batch_code(batch_code or batch_name or "")
    normalized_name = _normalize_batch_name(batch_name or normalized_code)
    batch = db.query(Batch).filter(Batch.code == normalized_code).first()
    if batch:
        return ensure_teacher_can_assign_batch(db, current_teacher=current_teacher, batch=batch)

    batch = Batch(
        code=normalized_code,
        name=normalized_name,
        status="active",
        created_by_user_id=current_teacher.id,
        primary_teacher_id=None if current_teacher.role == "admin" else current_teacher.id,
    )
    db.add(batch)
    db.flush()
    return batch


def approve_enrollment(
    db: Session,
    *,
    enrollment: Enrollment,
    current_teacher: User,
    batch: Batch | None,
    issued_username: str | None = None,
    temporary_password: str | None = None,
    notes: str | None = None,
    send_email: bool = True,
) -> EnrollmentApprovalResult:
    registration = enrollment.registration
    if registration is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Enrollment is missing registration data.")
    if batch is not None and batch.status == "archived":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archived batches cannot accept new approvals. Restore the batch first.",
        )
    if enrollment.status == "approved" and enrollment.user_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Enrollment is already approved.")
    if enrollment.status == "rejected":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Enrollment has already been rejected.")

    normalized_email = registration.email.strip().lower()
    resolved_username = (issued_username or normalized_email).strip()
    if not resolved_username:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Issued username could not be resolved.",
        )

    existing_user = db.query(User).filter(User.username == resolved_username).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.")

    existing_email = db.query(User).filter(User.email == normalized_email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already linked to another account.",
        )

    raw_password = temporary_password or generate_temporary_password()

    if send_email:
        if not settings.smtp_host or not settings.smtp_from_email or not settings.smtp_username or not settings.smtp_password:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Approval not completed because SMTP is not configured. "
                    "Set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, and SMTP_FROM_EMAIL in backend/.env."
                ),
            )
        try:
            send_student_initial_credentials_email(
                to_email=normalized_email,
                username=resolved_username,
                temporary_password=raw_password,
                batch_name=batch.name if batch is not None else "Unassigned",
            )
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Approval not completed because the credential email could not be sent.",
            ) from exc
        delivery_status = "sent"
        delivery_message = f"Initial credentials emailed to {normalized_email}."
    else:
        delivery_status = "skipped"
        delivery_message = "Credential email skipped. Share the one-time credentials manually."

    student_user = User(
        username=resolved_username,
        password_hash=hash_password(raw_password),
        first_name=registration.first_name,
        middle_name=registration.middle_name,
        last_name=registration.last_name,
        birth_date=registration.birth_date,
        address=registration.address,
        email=normalized_email,
        phone_number=registration.phone_number,
        role="student",
        must_change_password=True,
    )
    db.add(student_user)
    db.flush()

    now = datetime.now(timezone.utc)
    enrollment.user_id = student_user.id
    enrollment.batch_id = batch.id if batch is not None else None
    enrollment.status = "approved"
    enrollment.payment_review_status = "approved"
    enrollment.review_notes = notes.strip() if notes else None
    enrollment.reviewed_at = now
    enrollment.approved_at = now
    enrollment.approved_by_user_id = current_teacher.id
    enrollment.requested_teacher_id = None
    enrollment.teacher_assignment_request_status = "none"
    enrollment.teacher_assignment_request_note = None
    enrollment.teacher_assignment_requested_at = None
    enrollment.teacher_assignment_reviewed_at = None
    enrollment.teacher_assignment_reviewed_by_user_id = None
    enrollment.teacher_assignment_decision_note = None
    enrollment.rejected_at = None
    enrollment.rejected_by_user_id = None
    db.add(enrollment)

    registration.status = "approved"
    registration.validated_at = now
    registration.validated_by = teacher_display_name(current_teacher)
    registration.linked_user_id = student_user.id
    registration.issued_username = resolved_username
    registration.notes = notes.strip() if notes else None
    db.add(registration)

    return EnrollmentApprovalResult(
        enrollment=enrollment,
        issued_username=resolved_username,
        temporary_password=raw_password,
        delivery_status=delivery_status,
        delivery_message=delivery_message,
        recipient_email=normalized_email,
    )


def reject_enrollment(
    db: Session,
    *,
    enrollment: Enrollment,
    current_teacher: User,
    internal_note: str | None,
    rejection_reason_code: str,
    rejection_reason_detail: str | None = None,
) -> Enrollment:
    registration = enrollment.registration
    if registration is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Enrollment is missing registration data.")
    if enrollment.status == "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approved enrollments cannot be rejected from this flow.",
        )
    if enrollment.status == "rejected":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Enrollment is already rejected.")

    now = datetime.now(timezone.utc)
    normalized_internal_note = internal_note.strip() if internal_note and internal_note.strip() else None
    normalized_reason_detail = (
        rejection_reason_detail.strip() if rejection_reason_detail and rejection_reason_detail.strip() else None
    )
    enrollment.status = "rejected"
    enrollment.payment_review_status = "rejected"
    enrollment.review_notes = normalized_internal_note
    enrollment.rejection_reason_code = rejection_reason_code
    enrollment.rejection_reason_detail = normalized_reason_detail
    enrollment.reviewed_at = now
    enrollment.rejected_at = now
    enrollment.rejected_by_user_id = current_teacher.id
    db.add(enrollment)

    registration.status = "rejected"
    registration.notes = normalized_internal_note
    db.add(registration)
    return enrollment


def assign_approved_enrollment_to_batch(
    db: Session,
    *,
    enrollment: Enrollment,
    current_teacher: User,
    batch: Batch,
    notes: str | None = None,
) -> Enrollment:
    registration = enrollment.registration
    if registration is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Enrollment is missing registration data.")

    if enrollment.status != "approved" or enrollment.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only approved enrollments can be assigned to a batch.",
        )

    if batch.status == "archived":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archived batches cannot accept student assignments. Restore the batch first.",
        )

    if (
        enrollment.teacher_assignment_request_status == "pending"
        and enrollment.requested_teacher_id is not None
        and current_teacher.role != "admin"
        and enrollment.requested_teacher_id != current_teacher.id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another teacher already has an active management request for this student.",
        )

    now = datetime.now(timezone.utc)
    normalized_note = notes.strip() if notes and notes.strip() else None
    enrollment.batch_id = batch.id
    enrollment.reviewed_at = now
    if enrollment.teacher_assignment_request_status == "pending":
        enrollment.teacher_assignment_request_status = "approved"
        enrollment.teacher_assignment_reviewed_at = now
        enrollment.teacher_assignment_reviewed_by_user_id = current_teacher.id
        enrollment.teacher_assignment_decision_note = normalized_note
    if normalized_note is not None:
        enrollment.review_notes = normalized_note
        registration.notes = normalized_note
    db.add(enrollment)
    db.add(registration)
    return enrollment

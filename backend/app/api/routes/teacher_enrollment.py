from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_teacher
from app.core.security import create_temporary_password, hash_password
from app.db.session import get_db
from app.models.batch import Batch
from app.models.registration import Registration
from app.models.user import User
from app.schemas.registration import (
    RegistrationOut,
    TeacherRegistrationActionResponse,
    TeacherRegistrationApprovalRequest,
    TeacherRegistrationRejectRequest,
)
from app.schemas.teacher import TeacherBatchOverview, TeacherBatchStudent, TeacherBatchUpdateRequest
from app.services.email_service import EmailDeliveryError, build_student_credentials_email, send_email

router = APIRouter(prefix="/teacher", tags=["teacher-enrollment"])


def _teacher_display_name(user: User) -> str:
    full_name = " ".join(
        part.strip() for part in [user.first_name, user.last_name] if part and part.strip()
    ).strip()
    return full_name or user.username


def _normalize_batch_name(value: str) -> str:
    normalized = " ".join(value.split()).strip()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Batch name is required.",
        )
    return normalized


def _registration_query(db: Session, status_filter: str | None):
    query = db.query(Registration).order_by(Registration.created_at.desc())
    if status_filter:
        query = query.filter(Registration.status == status_filter)
    return query


def _get_registration_or_404(db: Session, registration_id: int) -> Registration:
    registration = db.query(Registration).filter(Registration.id == registration_id).first()
    if not registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")
    return registration


def _get_or_create_batch(
    *,
    db: Session,
    batch_name: str,
    current_week_number: int,
) -> Batch:
    normalized_name = _normalize_batch_name(batch_name)
    batch = db.query(Batch).filter(Batch.name == normalized_name).first()
    if batch:
        return batch

    batch = Batch(name=normalized_name, current_week_number=current_week_number)
    db.add(batch)
    db.flush()
    return batch


def _registration_full_name(registration: Registration) -> str:
    return " ".join(
        part.strip()
        for part in [registration.first_name, registration.middle_name or "", registration.last_name]
        if part and part.strip()
    ).strip()


def _send_credentials_email(
    *,
    registration: Registration,
    username: str,
    temporary_password: str,
    batch_name: str | None,
) -> str:
    message = build_student_credentials_email(
        recipient_email=registration.email,
        recipient_name=_registration_full_name(registration),
        username=username,
        temporary_password=temporary_password,
        batch_name=batch_name,
    )
    return send_email(message)


@router.get("/registrations", response_model=list[RegistrationOut])
def get_teacher_registrations(
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> list[RegistrationOut]:
    query = _registration_query(db, status_filter)
    return query.all()


@router.post(
    "/registrations/{registration_id}/approve",
    response_model=TeacherRegistrationActionResponse,
)
def approve_registration(
    registration_id: int,
    payload: TeacherRegistrationApprovalRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherRegistrationActionResponse:
    registration = _get_registration_or_404(db, registration_id)
    if registration.status == "approved" and registration.linked_user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration is already approved.",
        )
    if registration.status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration has already been rejected.",
        )

    issued_username = payload.issued_username.strip()
    existing_user = db.query(User).filter(User.username == issued_username).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.")

    normalized_email = registration.email.strip().lower()
    existing_email = db.query(User).filter(User.email == normalized_email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already linked to another account.",
        )

    batch = _get_or_create_batch(
        db=db,
        batch_name=payload.batch_name,
        current_week_number=payload.current_week_number,
    )
    temporary_password = create_temporary_password()
    user = User(
        username=issued_username,
        password_hash=hash_password(temporary_password),
        role="student",
        first_name=registration.first_name,
        middle_name=registration.middle_name,
        last_name=registration.last_name,
        birth_date=registration.birth_date,
        address=registration.address,
        email=normalized_email,
        phone_number=registration.phone_number,
        batch_id=batch.id,
        must_change_password=True,
    )
    db.add(user)
    db.flush()

    try:
        email_status = _send_credentials_email(
            registration=registration,
            username=issued_username,
            temporary_password=temporary_password,
            batch_name=batch.name,
        )
    except EmailDeliveryError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Student account email could not be sent. {exc}",
        ) from exc

    now = datetime.now(timezone.utc)
    registration.status = "approved"
    registration.validated_at = now
    registration.validated_by = _teacher_display_name(current_teacher)
    registration.rejected_at = None
    registration.rejected_by = None
    registration.linked_user_id = user.id
    registration.batch_id = batch.id
    registration.issued_username = issued_username
    registration.notes = payload.notes.strip() if payload.notes else None
    registration.credential_email_status = "sent" if email_status == "sent" else "logged"
    registration.credential_sent_at = now
    registration.credential_email_error = None

    db.add(registration)
    db.commit()
    db.refresh(registration)

    return TeacherRegistrationActionResponse(
        message="Registration approved and credentials prepared for delivery.",
        registration=registration,
    )


@router.post(
    "/registrations/{registration_id}/reject",
    response_model=TeacherRegistrationActionResponse,
)
def reject_registration(
    registration_id: int,
    payload: TeacherRegistrationRejectRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherRegistrationActionResponse:
    registration = _get_registration_or_404(db, registration_id)
    if registration.status == "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approved registrations cannot be rejected from this flow.",
        )
    if registration.status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration is already rejected.",
        )

    registration.status = "rejected"
    registration.rejected_at = datetime.now(timezone.utc)
    registration.rejected_by = _teacher_display_name(current_teacher)
    registration.notes = payload.notes.strip() if payload.notes else None
    db.add(registration)
    db.commit()
    db.refresh(registration)

    return TeacherRegistrationActionResponse(
        message="Registration rejected successfully.",
        registration=registration,
    )


@router.post(
    "/registrations/{registration_id}/resend-credentials",
    response_model=TeacherRegistrationActionResponse,
)
def resend_registration_credentials(
    registration_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> TeacherRegistrationActionResponse:
    registration = _get_registration_or_404(db, registration_id)
    if registration.status != "approved" or not registration.linked_user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only approved registrations with linked accounts can resend credentials.",
        )

    user = db.query(User).filter(User.id == registration.linked_user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked user not found.")

    temporary_password = create_temporary_password()
    user.password_hash = hash_password(temporary_password)
    user.must_change_password = True
    db.add(user)

    batch = db.query(Batch).filter(Batch.id == registration.batch_id).first() if registration.batch_id else None
    try:
        email_status = _send_credentials_email(
            registration=registration,
            username=user.username,
            temporary_password=temporary_password,
            batch_name=batch.name if batch else None,
        )
    except EmailDeliveryError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Credential resend email could not be sent. {exc}",
        ) from exc

    registration.credential_email_status = "sent" if email_status == "sent" else "logged"
    registration.credential_sent_at = datetime.now(timezone.utc)
    registration.credential_email_error = None
    db.add(registration)
    db.commit()
    db.refresh(registration)

    return TeacherRegistrationActionResponse(
        message="Credentials resent successfully.",
        registration=registration,
    )


@router.get("/batches", response_model=list[TeacherBatchOverview])
def get_teacher_batches(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> list[TeacherBatchOverview]:
    batches = db.query(Batch).order_by(Batch.name.asc()).all()
    payload: list[TeacherBatchOverview] = []
    for batch in batches:
        students = (
            db.query(User)
            .filter(User.batch_id == batch.id, User.role == "student")
            .order_by(User.last_name.asc(), User.first_name.asc(), User.username.asc())
            .all()
        )
        payload.append(
            TeacherBatchOverview(
                id=batch.id,
                name=batch.name,
                current_week_number=batch.current_week_number,
                student_count=len(students),
                students=[
                    TeacherBatchStudent(
                        user_id=student.id,
                        username=student.username,
                        full_name=" ".join(
                            part.strip()
                            for part in [
                                student.first_name or "",
                                student.middle_name or "",
                                student.last_name or "",
                            ]
                            if part and part.strip()
                        ).strip()
                        or student.username,
                        email=student.email,
                    )
                    for student in students
                ],
            )
        )
    return payload


@router.patch("/batches/{batch_id}", response_model=TeacherBatchOverview)
def update_teacher_batch(
    batch_id: int,
    payload: TeacherBatchUpdateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> TeacherBatchOverview:
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")

    batch.current_week_number = payload.current_week_number
    db.add(batch)
    db.commit()
    db.refresh(batch)

    students = (
        db.query(User)
        .filter(User.batch_id == batch.id, User.role == "student")
        .order_by(User.last_name.asc(), User.first_name.asc(), User.username.asc())
        .all()
    )
    return TeacherBatchOverview(
        id=batch.id,
        name=batch.name,
        current_week_number=batch.current_week_number,
        student_count=len(students),
        students=[
            TeacherBatchStudent(
                user_id=student.id,
                username=student.username,
                full_name=" ".join(
                    part.strip()
                    for part in [
                        student.first_name or "",
                        student.middle_name or "",
                        student.last_name or "",
                    ]
                    if part and part.strip()
                ).strip()
                or student.username,
                email=student.email,
            )
            for student in students
        ],
    )

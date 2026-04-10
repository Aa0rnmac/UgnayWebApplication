from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_teacher
from app.core.config import settings
from app.core.datetime_utils import utc_now
from app.models.activity_attempt import ActivityAttempt
from app.core.config import PROJECT_ROOT
from app.db.session import get_db
from app.models.batch import Batch
from app.models.enrollment import Enrollment
from app.models.progress import UserModuleProgress
from app.models.registration import Registration
from app.models.student_certificate import StudentCertificate
from app.models.user import User
from app.schemas.registration import RegistrationOut
from app.schemas.teacher import (
    TeacherBatchCreateRequest,
    TeacherBatchOut,
    TeacherCertificateHistoryItemOut,
    TeacherEnrollmentApprovalResultOut,
    TeacherEnrollmentApproveRequest,
    TeacherEnrollmentOut,
    TeacherEnrollmentRejectRequest,
    TeacherEnrollmentRejectionResultOut,
    TeacherStudentCertificateDecisionRequest,
    TeacherStudentCertificateOut,
    TeacherStudentModuleProgressOut,
    TeacherStudentOut,
    TeacherHandlingSessionOut,
    TeacherUserSummary,
)
from app.schemas.teacher_report import TeacherActivityAttemptItemOut, TeacherActivityAttemptOut
from app.services.email_sender import send_student_rejection_email
from app.services.enrollment_service import (
    approve_enrollment,
    EnrollmentApprovalResult,
    get_or_create_batch,
    normalize_batch_code,
    registration_display_name,
)
from app.services.student_certificate import build_student_certificate_status, certificate_reference
from app.services.teacher_context import approved_enrollment_for_student, resolve_teacher_context_for_student
from app.services.teacher_scope import (
    ensure_teacher_can_access_batch,
    ensure_teacher_can_access_enrollment,
    ensure_teacher_can_decide_certificate,
    ensure_teacher_can_view_student,
    resolve_teacher_student_scope,
    teacher_can_access_enrollment,
    teacher_can_access_performance_record,
    teacher_has_global_access,
)

router = APIRouter(prefix="/teacher", tags=["teacher-enrollment"])

REGISTRATION_UPLOADS_DIR = (PROJECT_ROOT / "backend" / "uploads" / "registrations").resolve()


def _full_name(user: User) -> str:
    full_name = " ".join(
        part.strip()
        for part in [user.first_name or "", user.middle_name or "", user.last_name or ""]
        if part and part.strip()
    ).strip()
    return full_name or user.username


def _get_student_or_404(db: Session, student_id: int) -> User:
    student = (
        db.query(User)
        .filter(User.id == student_id, User.role == "student", User.archived_at.is_(None))
        .first()
    )
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")
    return student


def _registration_out(registration: Registration, enrollment: Enrollment | None = None) -> RegistrationOut:
    resolved_enrollment = enrollment or registration.enrollment
    return RegistrationOut(
        id=registration.id,
        first_name=registration.first_name,
        middle_name=registration.middle_name,
        last_name=registration.last_name,
        birth_date=registration.birth_date,
        address=registration.address,
        email=registration.email,
        phone_number=registration.phone_number,
        reference_number=registration.reference_number,
        reference_image_path=registration.reference_image_path,
        status=registration.status,
        validated_at=registration.validated_at,
        validated_by=registration.validated_by,
        linked_user_id=registration.linked_user_id,
        issued_username=registration.issued_username,
        enrollment_id=resolved_enrollment.id if resolved_enrollment else None,
        payment_review_status=resolved_enrollment.payment_review_status if resolved_enrollment else None,
        notes=registration.notes,
        created_at=registration.created_at,
    )


def _batch_out(batch: Batch | None, *, student_count: int = 0) -> TeacherBatchOut | None:
    if batch is None:
        return None
    return TeacherBatchOut(
        id=batch.id,
        code=batch.code,
        name=batch.name,
        status=batch.status,
        start_date=batch.start_date,
        end_date=batch.end_date,
        capacity=batch.capacity,
        notes=batch.notes,
        student_count=student_count,
        primary_teacher=_student_summary(batch.primary_teacher),
        created_at=batch.created_at,
    )


def _batch_student_count(batch: Batch) -> int:
    return sum(
        1
        for enrollment in batch.enrollments
        if enrollment.status == "approved"
        and enrollment.user_id is not None
        and enrollment.user is not None
        and enrollment.user.archived_at is None
    )


def _student_summary(user: User | None) -> TeacherUserSummary | None:
    if user is None:
        return None
    return TeacherUserSummary(
        id=user.id,
        username=user.username,
        full_name=_full_name(user),
        email=user.email,
    )


def _enrollment_out(enrollment: Enrollment) -> TeacherEnrollmentOut:
    registration = enrollment.registration
    batch = enrollment.batch
    student = enrollment.user
    student_count = _batch_student_count(batch) if batch else 0
    return TeacherEnrollmentOut(
        id=enrollment.id,
        status=enrollment.status,
        payment_review_status=enrollment.payment_review_status,
        review_notes=enrollment.review_notes,
        rejection_reason_code=enrollment.rejection_reason_code,
        rejection_reason_detail=enrollment.rejection_reason_detail,
        reviewed_at=enrollment.reviewed_at,
        approved_at=enrollment.approved_at,
        rejected_at=enrollment.rejected_at,
        created_at=enrollment.created_at,
        updated_at=enrollment.updated_at,
        registration=_registration_out(registration, enrollment),
        batch=_batch_out(batch, student_count=student_count),
        student=_student_summary(student),
    )


def _approval_result_out(result: EnrollmentApprovalResult) -> TeacherEnrollmentApprovalResultOut:
    return TeacherEnrollmentApprovalResultOut(
        enrollment=_enrollment_out(result.enrollment),
        issued_username=result.issued_username,
        temporary_password=result.temporary_password,
        delivery_status=result.delivery_status,
        delivery_message=result.delivery_message,
        recipient_email=result.recipient_email,
    )


def _rejection_result_out(
    enrollment: Enrollment,
    *,
    delivery_status: Literal["sent", "skipped", "failed"],
    delivery_message: str,
    recipient_email: str,
) -> TeacherEnrollmentRejectionResultOut:
    return TeacherEnrollmentRejectionResultOut(
        enrollment=_enrollment_out(enrollment),
        delivery_status=delivery_status,
        delivery_message=delivery_message,
        recipient_email=recipient_email,
    )


def _send_rejection_notice(
    *,
    enrollment: Enrollment,
    rejection_reason: str,
) -> tuple[Literal["sent", "skipped", "failed"], str, str]:
    registration = enrollment.registration
    if registration is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Enrollment is missing registration data.")

    recipient_email = registration.email.strip().lower()
    if not settings.smtp_host or not settings.smtp_from_email:
        return (
            "skipped",
            (
                "Enrollment rejected. Rejection email was not sent because SMTP is not configured. "
                "The rejection record was still saved."
            ),
            recipient_email,
        )

    try:
        send_student_rejection_email(
            to_email=recipient_email,
            student_name=registration_display_name(registration),
            rejection_reason=rejection_reason,
        )
    except RuntimeError:
        return (
            "failed",
            (
                f"Enrollment rejected, but the rejection email could not be sent to {recipient_email}. "
                "The rejection record was still saved."
            ),
            recipient_email,
        )

    return (
        "sent",
        f"Enrollment rejected and the reason was emailed to {recipient_email}.",
        recipient_email,
    )


def _rejection_reason_summary(
    reason_code: Literal["incorrect_amount_paid", "incorrect_information"],
    reason_detail: str | None,
) -> str:
    if reason_code == "incorrect_amount_paid":
        base_reason = "The amount paid did not match the required payment amount."
    else:
        base_reason = "Some of the submitted information could not be validated because it was incorrect or incomplete."

    normalized_detail = reason_detail.strip() if reason_detail and reason_detail.strip() else None
    if not normalized_detail:
        return base_reason
    return f"{base_reason}\n\nAdditional details:\n{normalized_detail}"


def _activity_attempt_out(attempt: ActivityAttempt) -> TeacherActivityAttemptOut:
    return TeacherActivityAttemptOut(
        id=attempt.id,
        student_id=attempt.user_id,
        student_name=_full_name(attempt.user),
        module_id=attempt.module_id,
        module_title=attempt.module.title,
        module_kind=attempt.module.module_kind,
        module_owner_teacher=_student_summary(attempt.module_owner_teacher),
        handled_by_teacher=_student_summary(attempt.handled_by_teacher),
        handling_session_id=attempt.handling_session_id,
        handling_started_at=attempt.handling_session.started_at if attempt.handling_session else None,
        activity_id=attempt.module_activity_id,
        activity_key=attempt.activity_key,
        activity_title=attempt.activity_title,
        activity_type=attempt.activity_type,
        right_count=attempt.right_count,
        wrong_count=attempt.wrong_count,
        total_items=attempt.total_items,
        score_percent=attempt.score_percent,
        improvement_areas=list(attempt.improvement_areas or []),
        ai_metadata=dict(attempt.ai_metadata or {}),
        submitted_at=attempt.submitted_at,
        items=[
            TeacherActivityAttemptItemOut(
                id=item.id,
                item_key=item.item_key,
                prompt=item.prompt,
                expected_answer=item.expected_answer,
                student_answer=item.student_answer,
                is_correct=item.is_correct,
                confidence=item.confidence,
                ai_metadata=dict(item.ai_metadata or {}),
            )
            for item in attempt.items
        ],
    )


def _get_enrollment_or_404(db: Session, enrollment_id: int) -> Enrollment:
    enrollment = (
        db.query(Enrollment)
        .options(
            joinedload(Enrollment.registration),
            joinedload(Enrollment.user),
            joinedload(Enrollment.batch).joinedload(Batch.primary_teacher),
        )
        .filter(Enrollment.id == enrollment_id)
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found.")
    return enrollment


def _get_batch_or_404(db: Session, batch_id: int) -> Batch:
    batch = (
        db.query(Batch)
        .options(
            joinedload(Batch.primary_teacher),
            selectinload(Batch.enrollments).joinedload(Enrollment.user),
        )
        .filter(Batch.id == batch_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")
    return batch


def _latest_approved_enrollments_for_students(
    db: Session,
    student_ids: list[int],
) -> dict[int, Enrollment]:
    if not student_ids:
        return {}

    enrollments = (
        db.query(Enrollment)
        .options(joinedload(Enrollment.batch).joinedload(Batch.primary_teacher))
        .filter(
            Enrollment.user_id.in_(student_ids),
            Enrollment.status == "approved",
        )
        .order_by(Enrollment.user_id.asc(), Enrollment.approved_at.desc(), Enrollment.id.desc())
        .all()
    )

    latest_by_student: dict[int, Enrollment] = {}
    for enrollment in enrollments:
        if enrollment.user_id is None or enrollment.user_id in latest_by_student:
            continue
        latest_by_student[enrollment.user_id] = enrollment
    return latest_by_student


def _resolve_payment_proof_path(registration: Registration) -> Path:
    if not registration.reference_image_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment proof not found.")

    raw_path = Path(registration.reference_image_path)
    if raw_path.is_absolute():
        candidate = raw_path.resolve()
    else:
        normalized = registration.reference_image_path.replace("uploads/registrations/", "registrations/")
        candidate = (REGISTRATION_UPLOADS_DIR.parent / normalized).resolve()
    if REGISTRATION_UPLOADS_DIR not in candidate.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment proof path is invalid.")
    if not candidate.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment proof file not found.")
    return candidate


def _student_attempts_query(db: Session, student_id: int):
    return (
        db.query(ActivityAttempt)
        .options(
            joinedload(ActivityAttempt.user),
            joinedload(ActivityAttempt.module),
            joinedload(ActivityAttempt.module_owner_teacher),
            joinedload(ActivityAttempt.handled_by_teacher),
            joinedload(ActivityAttempt.handling_session),
            selectinload(ActivityAttempt.items),
        )
        .filter(ActivityAttempt.user_id == student_id)
        .order_by(ActivityAttempt.submitted_at.desc(), ActivityAttempt.id.desc())
    )


def _get_activity_attempt_or_404(db: Session, attempt_id: int) -> ActivityAttempt:
    attempt = (
        db.query(ActivityAttempt)
        .options(
            joinedload(ActivityAttempt.user),
            joinedload(ActivityAttempt.module),
            joinedload(ActivityAttempt.module_owner_teacher),
            joinedload(ActivityAttempt.handled_by_teacher),
            joinedload(ActivityAttempt.handling_session),
            selectinload(ActivityAttempt.items),
        )
        .filter(ActivityAttempt.id == attempt_id)
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity attempt not found.")
    return attempt


def _certificate_history_out(
    record: StudentCertificate,
    *,
    enrollment: Enrollment | None,
) -> TeacherCertificateHistoryItemOut:
    batch = enrollment.batch if enrollment is not None else None
    student = _student_summary(record.student)
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    return TeacherCertificateHistoryItemOut(
        id=record.id,
        student=student,
        batch=_batch_out(batch, student_count=0) if batch is not None else None,
        status=record.status,
        certificate_reference=record.certificate_reference,
        decision_note=record.decision_note,
        decided_at=record.decided_at,
        decided_by_name=_full_name(record.decided_by) if record.decided_by is not None else "Unknown Teacher",
        issued_at=record.issued_at,
    )


@router.get("/enrollments", response_model=list[TeacherEnrollmentOut])
def list_teacher_enrollments(
    status_filter: str | None = Query(default=None, alias="status"),
    batch_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> list[TeacherEnrollmentOut]:
    if batch_id is not None:
        batch = _get_batch_or_404(db, batch_id)
        ensure_teacher_can_access_batch(current_teacher=current_teacher, batch=batch)

    query = (
        db.query(Enrollment)
        .options(
            joinedload(Enrollment.registration),
            joinedload(Enrollment.user),
            joinedload(Enrollment.batch).joinedload(Batch.primary_teacher),
        )
        .order_by(Enrollment.created_at.desc(), Enrollment.id.desc())
    )
    if status_filter:
        query = query.filter(Enrollment.status == status_filter)
    if batch_id is not None:
        query = query.filter(Enrollment.batch_id == batch_id)
    enrollments = [
        enrollment
        for enrollment in query.all()
        if teacher_can_access_enrollment(current_teacher, enrollment)
    ]
    return [_enrollment_out(enrollment) for enrollment in enrollments]


@router.get("/enrollments/{enrollment_id}", response_model=TeacherEnrollmentOut)
def get_teacher_enrollment(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherEnrollmentOut:
    enrollment = _get_enrollment_or_404(db, enrollment_id)
    ensure_teacher_can_access_enrollment(current_teacher=current_teacher, enrollment=enrollment)
    return _enrollment_out(enrollment)


@router.get("/enrollments/{enrollment_id}/payment-proof")
def get_enrollment_payment_proof(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
):
    enrollment = _get_enrollment_or_404(db, enrollment_id)
    ensure_teacher_can_access_enrollment(current_teacher=current_teacher, enrollment=enrollment)
    proof_path = _resolve_payment_proof_path(enrollment.registration)
    return FileResponse(path=proof_path)


@router.post("/enrollments/{enrollment_id}/approve", response_model=TeacherEnrollmentApprovalResultOut)
def approve_teacher_enrollment(
    enrollment_id: int,
    payload: TeacherEnrollmentApproveRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherEnrollmentApprovalResultOut:
    enrollment = _get_enrollment_or_404(db, enrollment_id)
    ensure_teacher_can_access_enrollment(current_teacher=current_teacher, enrollment=enrollment)
    batch = get_or_create_batch(
        db,
        current_teacher=current_teacher,
        batch_id=payload.batch_id,
        batch_code=payload.batch_code,
        batch_name=payload.batch_name,
    )
    try:
        result = approve_enrollment(
            db,
            enrollment=enrollment,
            current_teacher=current_teacher,
            batch=batch,
            issued_username=payload.issued_username,
            temporary_password=payload.temporary_password,
            notes=payload.notes,
            send_email=payload.send_email,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(enrollment)
    return _approval_result_out(result)


@router.post("/enrollments/{enrollment_id}/reject", response_model=TeacherEnrollmentRejectionResultOut)
def reject_teacher_enrollment(
    enrollment_id: int,
    payload: TeacherEnrollmentRejectRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherEnrollmentRejectionResultOut:
    enrollment = _get_enrollment_or_404(db, enrollment_id)
    ensure_teacher_can_access_enrollment(current_teacher=current_teacher, enrollment=enrollment)
    from app.services.enrollment_service import reject_enrollment

    rejection_reason = _rejection_reason_summary(
        payload.rejection_reason_code,
        payload.rejection_reason_detail,
    )
    try:
        reject_enrollment(
            db,
            enrollment=enrollment,
            current_teacher=current_teacher,
            internal_note=payload.internal_note,
            rejection_reason_code=payload.rejection_reason_code,
            rejection_reason_detail=payload.rejection_reason_detail,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(enrollment)
    delivery_status, delivery_message, recipient_email = _send_rejection_notice(
        enrollment=enrollment,
        rejection_reason=rejection_reason,
    )
    return _rejection_result_out(
        enrollment,
        delivery_status=delivery_status,
        delivery_message=delivery_message,
        recipient_email=recipient_email,
    )


@router.get("/batches", response_model=list[TeacherBatchOut])
def list_teacher_batches(
    status_filter: Literal["active", "archived", "all"] = Query(default="active", alias="status"),
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> list[TeacherBatchOut]:
    query = (
        db.query(Batch)
        .options(
            joinedload(Batch.primary_teacher),
            selectinload(Batch.enrollments).joinedload(Enrollment.user),
        )
        .order_by(Batch.name.asc(), Batch.id.asc())
    )
    if status_filter != "all":
        query = query.filter(Batch.status == status_filter)
    batches = query.all()
    if not teacher_has_global_access(current_teacher):
        batches = [batch for batch in batches if batch.primary_teacher_id == current_teacher.id]
    return [
        _batch_out(
            batch,
            student_count=_batch_student_count(batch),
        )
        for batch in batches
    ]


@router.post("/batches", response_model=TeacherBatchOut, status_code=status.HTTP_201_CREATED)
def create_teacher_batch(
    payload: TeacherBatchCreateRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherBatchOut:
    existing = (
        db.query(Batch)
        .filter((Batch.code == normalize_batch_code(payload.code)) | (Batch.name == payload.name.strip()))
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Batch already exists.")

    batch = Batch(
        code=normalize_batch_code(payload.code),
        name=payload.name.strip(),
        status=payload.status.strip() or "active",
        start_date=payload.start_date,
        end_date=payload.end_date,
        capacity=payload.capacity,
        notes=payload.notes.strip() if payload.notes else None,
        created_by_user_id=current_teacher.id,
        primary_teacher_id=current_teacher.id,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    return _batch_out(batch, student_count=0)


@router.post("/batches/{batch_id}/archive", response_model=TeacherBatchOut)
def archive_teacher_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherBatchOut:
    batch = _get_batch_or_404(db, batch_id)
    ensure_teacher_can_access_batch(current_teacher=current_teacher, batch=batch)
    if batch.status != "archived":
        batch.status = "archived"
        db.add(batch)
        db.commit()
        db.refresh(batch)
    return _batch_out(batch, student_count=_batch_student_count(batch))


@router.post("/batches/{batch_id}/restore", response_model=TeacherBatchOut)
def restore_teacher_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherBatchOut:
    batch = _get_batch_or_404(db, batch_id)
    ensure_teacher_can_access_batch(current_teacher=current_teacher, batch=batch)
    if batch.status != "active":
        batch.status = "active"
        db.add(batch)
        db.commit()
        db.refresh(batch)
    return _batch_out(batch, student_count=_batch_student_count(batch))


@router.get("/batches/{batch_id}/students", response_model=list[TeacherUserSummary])
def list_batch_students(
    batch_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> list[TeacherUserSummary]:
    batch = _get_batch_or_404(db, batch_id)
    ensure_teacher_can_access_batch(current_teacher=current_teacher, batch=batch)

    students = [
        enrollment.user
        for enrollment in batch.enrollments
        if enrollment.status == "approved"
        and enrollment.user is not None
        and enrollment.user.archived_at is None
    ]
    students.sort(key=lambda item: (_full_name(item), item.username))
    return [_student_summary(student) for student in students if student is not None]


@router.get("/students/{student_id}", response_model=TeacherStudentOut)
def get_teacher_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherStudentOut:
    student = _get_student_or_404(db, student_id)
    access_scope = resolve_teacher_student_scope(db, current_teacher=current_teacher, student=student)
    ensure_teacher_can_view_student(current_teacher=current_teacher, scope=access_scope)
    teacher_context = resolve_teacher_context_for_student(db, student)
    active_enrollment = teacher_context.enrollment
    progress_rows = (
        db.query(UserModuleProgress)
        .filter(UserModuleProgress.user_id == student.id)
        .order_by(UserModuleProgress.module_id.asc())
        .all()
    )
    module_progress = []
    for row in progress_rows:
        module_title = row.module.title if getattr(row, "module", None) else f"Module {row.module_id}"
        module_progress.append(
            TeacherStudentModuleProgressOut(
                module_id=row.module_id,
                module_title=module_title,
                module_kind=row.module.module_kind if getattr(row, "module", None) else "system",
                owner_teacher=_student_summary(
                    row.module.owner_teacher if getattr(row, "module", None) else None
                ),
                status=row.status,
                progress_percent=row.progress_percent,
                assessment_score=row.assessment_score,
                updated_at=row.updated_at,
            )
        )

    return TeacherStudentOut(
        id=student.id,
        username=student.username,
        full_name=_full_name(student),
        email=student.email,
        phone_number=student.phone_number,
        address=student.address,
        birth_date=student.birth_date,
        role=student.role,
        enrollment_status=active_enrollment.status if active_enrollment else None,
        batch=_batch_out(active_enrollment.batch, student_count=0) if active_enrollment else None,
        resolved_teacher=_student_summary(teacher_context.teacher),
        active_handling_session=_session_out_for_student_detail(teacher_context.session),
        module_progress=module_progress,
    )


def _session_out_for_student_detail(session) -> TeacherHandlingSessionOut | None:
    if session is None:
        return None
    return TeacherHandlingSessionOut(
        id=session.id,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
        teacher=_student_summary(session.teacher),
        batch=_batch_out(session.batch, student_count=0) if session.batch is not None else None,
        student=_student_summary(session.student),
    )


@router.get("/students/{student_id}/activity-attempts", response_model=list[TeacherActivityAttemptOut])
def list_teacher_student_activity_attempts(
    student_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> list[TeacherActivityAttemptOut]:
    student = _get_student_or_404(db, student_id)
    access_scope = resolve_teacher_student_scope(db, current_teacher=current_teacher, student=student)
    ensure_teacher_can_view_student(current_teacher=current_teacher, scope=access_scope)
    return [_activity_attempt_out(attempt) for attempt in _student_attempts_query(db, student_id).all()]


@router.get("/certificates", response_model=list[TeacherCertificateHistoryItemOut])
def list_teacher_certificate_history(
    status_filter: Literal["issued", "all"] = Query(default="issued", alias="status"),
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> list[TeacherCertificateHistoryItemOut]:
    records = (
        db.query(StudentCertificate)
        .options(
            joinedload(StudentCertificate.student),
            joinedload(StudentCertificate.decided_by),
        )
        .order_by(
            StudentCertificate.issued_at.is_(None).asc(),
            StudentCertificate.issued_at.desc(),
            StudentCertificate.decided_at.desc(),
            StudentCertificate.id.desc(),
        )
        .all()
    )

    enrollment_map = _latest_approved_enrollments_for_students(
        db,
        [record.student_id for record in records],
    )

    history: list[TeacherCertificateHistoryItemOut] = []
    for record in records:
        if status_filter == "issued" and record.issued_at is None:
            continue

        enrollment = enrollment_map.get(record.student_id)
        batch = enrollment.batch if enrollment is not None else None
        owns_current_batch = batch is not None and batch.primary_teacher_id == current_teacher.id
        if (
            not teacher_has_global_access(current_teacher)
            and record.decided_by_user_id != current_teacher.id
            and not owns_current_batch
        ):
            continue

        history.append(_certificate_history_out(record, enrollment=enrollment))

    return history


@router.get("/students/{student_id}/certificate", response_model=TeacherStudentCertificateOut)
def get_teacher_student_certificate(
    student_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherStudentCertificateOut:
    student = _get_student_or_404(db, student_id)
    access_scope = resolve_teacher_student_scope(db, current_teacher=current_teacher, student=student)
    ensure_teacher_can_view_student(current_teacher=current_teacher, scope=access_scope)
    return build_student_certificate_status(
        db,
        student=student,
        preview_teacher=current_teacher,
        allow_preview_template=True,
    )


@router.post("/students/{student_id}/certificate/decision", response_model=TeacherStudentCertificateOut)
def decide_teacher_student_certificate(
    student_id: int,
    payload: TeacherStudentCertificateDecisionRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherStudentCertificateOut:
    student = _get_student_or_404(db, student_id)
    access_scope = resolve_teacher_student_scope(db, current_teacher=current_teacher, student=student)
    ensure_teacher_can_decide_certificate(current_teacher=current_teacher, scope=access_scope)
    certificate = build_student_certificate_status(
        db,
        student=student,
        preview_teacher=current_teacher,
        allow_preview_template=True,
    )
    if not certificate.summary.eligible:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Student does not currently meet the certificate criteria.",
        )

    record = (
        db.query(StudentCertificate)
        .filter(StudentCertificate.student_id == student.id)
        .first()
    )
    if record is None:
        record = StudentCertificate(
            student_id=student.id,
            certificate_reference=certificate_reference(student.id),
        )

    now = utc_now()
    normalized_note = payload.note.strip() if payload.note and payload.note.strip() else None
    record.status = "approved" if payload.decision == "approve" else "rejected"
    record.decision_note = normalized_note
    record.decided_by_user_id = current_teacher.id
    record.decided_at = now
    record.issued_at = now if payload.decision == "approve" else None
    record.snapshot_target_required_modules = certificate.summary.target_required_modules
    record.snapshot_effective_required_modules = certificate.summary.effective_required_modules
    record.snapshot_completed_required_modules = certificate.summary.completed_required_modules
    record.snapshot_average_best_score = certificate.summary.average_best_score
    record.snapshot_module_details = [item.model_dump() for item in certificate.modules]

    db.add(record)
    db.commit()

    return build_student_certificate_status(
        db,
        student=student,
        preview_teacher=current_teacher,
        allow_preview_template=True,
    )


@router.get("/activity-attempts/{attempt_id}", response_model=TeacherActivityAttemptOut)
def get_teacher_activity_attempt(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherActivityAttemptOut:
    attempt = _get_activity_attempt_or_404(db, attempt_id)
    enrollment = approved_enrollment_for_student(db, attempt.user_id)
    if not teacher_can_access_performance_record(
        current_teacher=current_teacher,
        enrollment=enrollment,
        handled_by_teacher_id=attempt.handled_by_teacher_id,
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity attempt not found.")
    return _activity_attempt_out(attempt)

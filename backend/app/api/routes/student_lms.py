import logging
from datetime import datetime
from html import escape
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_student
from app.core.datetime_utils import utc_now
from app.db.session import get_db
from app.models.lms_progress import SectionModuleItemProgress
from app.models.section import SectionStudentAssignment
from app.models.section_module import SectionModule, SectionModuleItem
from app.models.user import User
from app.schemas.lms import (
    CertificateStudentDownloadOut,
    StudentAssessmentSubmissionRequest,
    StudentCourseOut,
    StudentProgressUpdateOut,
    StudentReadableCompletionRequest,
)
from app.services.lms_service import (
    SELF_PACED_CONTENT_ITEM_TYPES,
    auto_archive_due_students,
    evaluate_item_submission,
    refresh_student_completion_schedule,
    section_completion_ready,
    serialize_course_for_student,
    sync_module_progress,
)
from app.services.audit_log_service import log_user_activity


router = APIRouter(prefix="/student", tags=["student-lms"])
logger = logging.getLogger(__name__)


def _parse_required_count(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str):
        trimmed = value.strip()
        if trimmed.isdigit():
            parsed = int(trimmed)
            return parsed if parsed > 0 else None
    return None


def _parse_bool_flag(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered == "true":
            return True
        if lowered == "false":
            return False
    return None


def _format_certificate_date(value: datetime | None) -> str:
    resolved = value or utc_now()
    return f"{resolved.strftime('%B')} {resolved.day}, {resolved.year}"


def _enforce_signing_multi_entry_requirement(
    item: SectionModuleItem, payload: StudentAssessmentSubmissionRequest
) -> None:
    if item.item_type != "signing_lab_assessment":
        return
    config = dict(item.config or {})
    raw_questions = config.get("questions")
    if not isinstance(raw_questions, list) or len(raw_questions) <= 1:
        return

    question_keys: list[str] = []
    for index, entry in enumerate(raw_questions, start=1):
        if not isinstance(entry, dict):
            continue
        question = str(entry.get("question") or "").strip()
        expected = str(entry.get("correct_answer") or "").strip()
        question_key = str(entry.get("question_key") or f"q{index}").strip() or f"q{index}"
        if not question or not expected:
            continue
        question_keys.append(question_key)
    if len(question_keys) <= 1:
        return

    answers_payload = payload.extra_payload.get("question_answers") if isinstance(payload.extra_payload, dict) else None
    submitted_answers: dict[str, str] = {}
    if isinstance(answers_payload, dict):
        submitted_answers = {
            str(key).strip(): str(value).strip()
            for key, value in answers_payload.items()
            if str(key).strip() and str(value).strip()
        }

    total_questions = len(question_keys)
    require_all = _parse_bool_flag(config.get("require_all"))
    required_count = _parse_required_count(config.get("required_count"))
    if require_all is not False:
        resolved_required_count = total_questions
    else:
        resolved_required_count = max(1, min(required_count or total_questions, total_questions))

    answered_count = sum(1 for key in question_keys if submitted_answers.get(key, "").strip())
    if answered_count < resolved_required_count:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Answer at least {resolved_required_count} camera entries before submitting.",
        )


def _safe_log_user_activity(
    db: Session,
    *,
    actor: User,
    action_type: str,
    target_type: str,
    target_id: int | None = None,
    details: dict | None = None,
) -> None:
    try:
        with db.begin_nested():
            log_user_activity(
                db,
                actor=actor,
                action_type=action_type,
                target_type=target_type,
                target_id=target_id,
                details=details,
            )
            db.flush()
    except Exception:
        logger.exception("Unable to persist activity log for action %s", action_type)


def _find_student_item(
    db: Session, current_student: User, item_id: int
) -> tuple[SectionModuleItem, SectionModule, StudentCourseOut]:
    item = (
        db.query(SectionModuleItem)
        .options(joinedload(SectionModuleItem.module).joinedload(SectionModule.items))
        .filter(SectionModuleItem.id == item_id)
        .first()
    )
    if not item or not item.module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learning item not found.")
    course = serialize_course_for_student(db, current_student)
    target_module = next((module for module in course.modules if module.id == item.module.id), None)
    if target_module is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Item is not available to this student.")
    target_item = next((entry for entry in target_module.items if entry.id == item.id), None)
    if target_item is None or target_item.is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Complete the previous lesson or activity first.",
        )
    return item, item.module, course


@router.get("/dashboard", response_model=StudentCourseOut)
def get_student_dashboard(
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> StudentCourseOut:
    auto_archive_due_students(db)
    refresh_student_completion_schedule(db, student_id=current_student.id)
    db.commit()
    return serialize_course_for_student(db, current_student)


@router.get("/course", response_model=StudentCourseOut)
def get_student_course(
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> StudentCourseOut:
    auto_archive_due_students(db)
    refresh_student_completion_schedule(db, student_id=current_student.id)
    db.commit()
    return serialize_course_for_student(db, current_student)


@router.post("/module-items/{item_id}/complete", response_model=StudentProgressUpdateOut)
def complete_readable_item(
    item_id: int,
    payload: StudentReadableCompletionRequest,
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> StudentProgressUpdateOut:
    try:
        item, module, _ = _find_student_item(db, current_student, item_id)
        if item.item_type not in SELF_PACED_CONTENT_ITEM_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Only content items can be marked as completed.",
            )

        progress = (
            db.query(SectionModuleItemProgress)
            .filter(
                SectionModuleItemProgress.student_id == current_student.id,
                SectionModuleItemProgress.section_module_item_id == item.id,
            )
            .first()
        )
        if progress is None:
            progress = SectionModuleItemProgress(
                student_id=current_student.id,
                section_module_id=module.id,
                section_module_item_id=item.id,
                submitted_payload={},
            )
        progress.status = "completed"
        progress.is_correct = True
        progress.score_percent = 100
        progress.attempt_count = max(progress.attempt_count or 0, 1)
        progress.duration_seconds = max(progress.duration_seconds or 0, payload.duration_seconds)
        progress.completed_at = utc_now()
        db.add(progress)
        _safe_log_user_activity(
            db,
            actor=current_student,
            action_type="student_item_completed",
            target_type="section_module_item",
            target_id=item.id,
            details={
                "module_id": module.id,
                "item_type": item.item_type,
                "duration_seconds": payload.duration_seconds,
            },
        )
        module_progress = sync_module_progress(db, student_id=current_student.id, module=module)
        refresh_student_completion_schedule(db, student_id=current_student.id)
        auto_archive_due_students(db)
        db.commit()
        return StudentProgressUpdateOut(
            module_id=module.id,
            item_id=item.id,
            module_status=module_progress.status,
            module_progress_percent=module_progress.progress_percent,
            item_status=progress.status,
            is_correct=progress.is_correct,
            score_percent=progress.score_percent,
        )
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("complete_readable_item failed for item_id=%s student_id=%s", item_id, current_student.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to complete this item right now.",
        ) from exc


@router.post("/module-items/{item_id}/submit", response_model=StudentProgressUpdateOut)
def submit_learning_item(
    item_id: int,
    payload: StudentAssessmentSubmissionRequest,
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> StudentProgressUpdateOut:
    item, module, _ = _find_student_item(db, current_student, item_id)
    _enforce_signing_multi_entry_requirement(item, payload)
    is_correct, resolved_score = evaluate_item_submission(
        item,
        payload.response_text,
        payload.score_percent,
        payload.extra_payload,
    )
    progress = (
        db.query(SectionModuleItemProgress)
        .filter(
            SectionModuleItemProgress.student_id == current_student.id,
            SectionModuleItemProgress.section_module_item_id == item.id,
        )
        .first()
    )
    if progress is None:
        progress = SectionModuleItemProgress(
            student_id=current_student.id,
            section_module_id=module.id,
            section_module_item_id=item.id,
            submitted_payload={},
        )

    progress.status = "completed"
    progress.response_text = payload.response_text.strip()
    progress.is_correct = is_correct
    progress.score_percent = resolved_score
    progress.attempt_count += 1
    progress.duration_seconds += payload.duration_seconds
    progress.submitted_payload = dict(payload.extra_payload or {})
    progress.completed_at = utc_now()
    db.add(progress)
    _safe_log_user_activity(
        db,
        actor=current_student,
        action_type="student_item_submitted",
        target_type="section_module_item",
        target_id=item.id,
        details={
            "module_id": module.id,
            "item_type": item.item_type,
            "attempt_count": progress.attempt_count,
            "is_correct": progress.is_correct,
            "score_percent": progress.score_percent,
            "duration_seconds": payload.duration_seconds,
        },
    )
    module_progress = sync_module_progress(db, student_id=current_student.id, module=module)
    refresh_student_completion_schedule(db, student_id=current_student.id)
    auto_archive_due_students(db)
    db.commit()
    return StudentProgressUpdateOut(
        module_id=module.id,
        item_id=item.id,
        module_status=module_progress.status,
        module_progress_percent=module_progress.progress_percent,
        item_status=progress.status,
        is_correct=progress.is_correct,
        score_percent=progress.score_percent,
    )


@router.get("/certificate", response_model=CertificateStudentDownloadOut)
def get_student_certificate_status(
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> CertificateStudentDownloadOut:
    auto_archive_due_students(db)
    assignment = (
        db.query(SectionStudentAssignment)
        .options(joinedload(SectionStudentAssignment.section))
        .filter(SectionStudentAssignment.student_id == current_student.id)
        .first()
    )
    if not assignment or not assignment.section:
        return CertificateStudentDownloadOut(
            eligible=False,
            message="You are not assigned to a section yet.",
        )
    refresh_student_completion_schedule(db, student_id=current_student.id)
    is_ready = section_completion_ready(db, current_student.id, assignment.section_id)
    completion_date = assignment.course_completed_at
    if not is_ready:
        db.commit()
        return CertificateStudentDownloadOut(
            eligible=False,
            section_name=assignment.section.name,
            message="Finish all published modules first before downloading your certificate.",
            completion_date=_format_certificate_date(completion_date) if completion_date else None,
        )
    auto_archive_due_students(db)
    db.commit()
    return CertificateStudentDownloadOut(
        eligible=True,
        section_name=assignment.section.name,
        message="Certificate is ready to download.",
        completion_date=_format_certificate_date(completion_date),
    )


@router.get("/certificate/download")
def download_student_certificate(
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> Response:
    auto_archive_due_students(db)
    assignment = (
        db.query(SectionStudentAssignment)
        .options(joinedload(SectionStudentAssignment.section))
        .filter(SectionStudentAssignment.student_id == current_student.id)
        .first()
    )
    if not assignment or not assignment.section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")

    refresh_student_completion_schedule(db, student_id=current_student.id)
    if not section_completion_ready(db, current_student.id, assignment.section_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Finish all published modules first before downloading your certificate.",
        )
    _safe_log_user_activity(
        db,
        actor=current_student,
        action_type="student_certificate_downloaded",
        target_type="section",
        target_id=assignment.section_id,
        details={"section_id": assignment.section_id, "section_name": assignment.section.name},
    )
    auto_archive_due_students(db)
    db.commit()

    display_name = " ".join(
        part for part in [current_student.first_name, current_student.last_name] if part
    ).strip() or current_student.username
    completion_date = _format_certificate_date(assignment.course_completed_at)
    safe_display_name = escape(display_name)
    safe_completion_date = escape(completion_date)
    html = f"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>UGNAY Certificate</title>
    <style>
      body {{ font-family: Georgia, serif; padding: 40px; background: #f5f4f1; color: #1c1c2e; }}
      .card {{ max-width: 900px; margin: 0 auto; padding: 56px; border: 8px solid #2e44a8; background: white; }}
      h1 {{ font-size: 42px; margin-bottom: 16px; }}
      .accent {{ color: #2a8c3f; font-weight: bold; }}
      .meta {{ margin-top: 32px; font-size: 14px; color: #555; }}
    </style>
  </head>
  <body>
    <div class="card">
      <p>UGNAY Learning Hub</p>
      <h1>Certificate of Completion</h1>
      <p>This certificate is awarded to</p>
      <p class="accent">{safe_display_name}</p>
      <p>for successfully completing</p>
      <p class="accent">FSL Basic Coarse</p>
      <p>offered by Hand and Heart</p>
      <p class="meta">Date completed: {safe_completion_date}</p>
    </div>
  </body>
</html>
""".strip()
    headers = {
        "Content-Disposition": f'attachment; filename="ugnay-certificate-{current_student.id}.html"'
    }
    return Response(content=html, media_type="text/html", headers=headers)

import logging
from datetime import datetime, timedelta
from html import escape
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
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
from app.services.admin_certificate_template_service import (
    build_template_data_uri,
    get_admin_certificate_template,
)


router = APIRouter(prefix="/student", tags=["student-lms"])
logger = logging.getLogger(__name__)
STUDENT_SUBMISSIONS_DIR = (
    Path(__file__).resolve().parents[3] / "uploads" / "student-submissions"
).resolve()
STUDENT_SUBMISSIONS_DIR.mkdir(parents=True, exist_ok=True)


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


def _resource_kind_for_file(
    extension: str,
    content_type: str | None,
) -> str:
    normalized_content_type = (content_type or "").strip().lower()
    if normalized_content_type.startswith("image/"):
        return "image"
    if normalized_content_type.startswith("video/"):
        return "video"
    if extension in {".zip", ".rar", ".7z", ".scorm"} or normalized_content_type in {
        "application/zip",
        "application/x-zip-compressed",
    }:
        return "interactive"
    return "document"


def _save_submission_file(
    *,
    student_id: int,
    item_id: int,
    upload_file: UploadFile,
) -> dict[str, Any]:
    extension = Path(upload_file.filename or "").suffix.lower() or ".bin"
    saved_name = f"student-{student_id}-item-{item_id}-{uuid4().hex}{extension}"
    saved_path = STUDENT_SUBMISSIONS_DIR / saved_name
    with saved_path.open("wb") as file_handle:
        file_handle.write(upload_file.file.read())
    relative_file_path = f"uploads/student-submissions/{saved_name}"
    return {
        "resource_kind": _resource_kind_for_file(extension, upload_file.content_type),
        "resource_file_name": upload_file.filename or saved_name,
        "resource_file_path": relative_file_path,
        "resource_mime_type": upload_file.content_type,
        "resource_url": f"/{relative_file_path}",
    }


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


def _assessment_total_units(item: SectionModuleItem) -> int:
    config = dict(item.config or {})
    raw_questions = config.get("questions")
    if isinstance(raw_questions, list):
        valid_questions = [entry for entry in raw_questions if isinstance(entry, dict)]
        if valid_questions:
            return max(1, len(valid_questions))
    if item.item_type.endswith("_assessment"):
        return 1
    return 0


def _safe_payload_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


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
    try:
        item, module, _ = _find_student_item(db, current_student, item_id)
        if item.item_type == "upload_assessment":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Use file upload submission for this assessment.",
            )
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
        attempt_number = (progress.attempt_count or 0) + 1
        progress.attempt_count = attempt_number
        progress.duration_seconds = max(0, progress.duration_seconds or 0) + max(0, payload.duration_seconds)
        completed_at = utc_now()
        progress.completed_at = completed_at
        total_units = _assessment_total_units(item)
        if total_units > 0 and resolved_score is not None:
            resolved_correct = int(round((resolved_score / 100) * total_units))
            correct_count = max(0, min(total_units, resolved_correct))
            wrong_count = max(0, total_units - correct_count)
        elif total_units > 0 and is_correct is True:
            correct_count = total_units
            wrong_count = 0
        elif total_units > 0 and is_correct is False:
            correct_count = 0
            wrong_count = total_units
        else:
            correct_count = 0
            wrong_count = 0
        previous_payload = _safe_payload_dict(progress.submitted_payload)
        previous_history = previous_payload.get("history")
        history_entries = previous_history if isinstance(previous_history, list) else []
        attempt_entry = {
            "attempt": attempt_number,
            "status": "completed",
            "score_percent": resolved_score,
            "is_correct": is_correct,
            "correct_count": correct_count,
            "wrong_count": wrong_count,
            "duration_seconds": max(0, payload.duration_seconds),
            "completed_at": completed_at.isoformat(),
        }
        normalized_payload = _safe_payload_dict(payload.extra_payload)
        normalized_payload["history"] = [*history_entries, attempt_entry][-50:]
        progress.submitted_payload = normalized_payload
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
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("submit_learning_item failed for item_id=%s student_id=%s", item_id, current_student.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to submit this assessment right now.",
        ) from exc


@router.post("/module-items/{item_id}/upload-submission", response_model=StudentProgressUpdateOut)
def upload_submission_item(
    item_id: int,
    files: list[UploadFile] = File(...),
    note: str | None = Form(default=None),
    duration_seconds: int = Form(default=0),
    db: Session = Depends(get_db),
    current_student: User = Depends(get_current_student),
) -> StudentProgressUpdateOut:
    item, module, _ = _find_student_item(db, current_student, item_id)
    if item.item_type != "upload_assessment":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This item does not accept file submissions.",
        )
    uploaded_files = [entry for entry in files if entry.filename]
    if not uploaded_files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Upload at least one file before submitting.",
        )
    serialized_files = [
        _save_submission_file(student_id=current_student.id, item_id=item.id, upload_file=file_entry)
        for file_entry in uploaded_files
    ]
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
    existing_payload = _safe_payload_dict(progress.submitted_payload)
    history = existing_payload.get("history")
    history_entries: list[dict[str, Any]] = history if isinstance(history, list) else []
    attempt_number = (progress.attempt_count or 0) + 1
    submitted_at = utc_now()
    history_entries.append(
        {
            "attempt": attempt_number,
            "status": "completed",
            "score_percent": None,
            "correct_count": 0,
            "wrong_count": 0,
            "duration_seconds": max(0, duration_seconds),
            "completed_at": submitted_at.isoformat(),
            "submitted_at": submitted_at.isoformat(),
            "note": (note or "").strip() or None,
            "files": serialized_files,
        }
    )
    normalized_payload = {
        "note": (note or "").strip() or None,
        "files": serialized_files,
        "history": history_entries[-20:],
    }
    progress.status = "completed"
    progress.response_text = (note or "").strip() or f"Uploaded {len(serialized_files)} file(s)."
    progress.is_correct = None
    progress.score_percent = None
    progress.attempt_count = attempt_number
    progress.duration_seconds = max(0, progress.duration_seconds or 0) + max(0, duration_seconds)
    progress.submitted_payload = normalized_payload
    progress.completed_at = utc_now()
    db.add(progress)
    _safe_log_user_activity(
        db,
        actor=current_student,
        action_type="student_upload_assessment_submitted",
        target_type="section_module_item",
        target_id=item.id,
        details={
            "module_id": module.id,
            "item_type": item.item_type,
            "attempt_count": progress.attempt_count,
            "file_count": len(serialized_files),
            "duration_seconds": duration_seconds,
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
            message="Finish the first 12 published modules before downloading your certificate.",
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
            detail="Finish the first 12 published modules before downloading your certificate.",
        )
    assignment.auto_archive_due_at = utc_now() + timedelta(hours=24)
    db.add(assignment)
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
    template_config = get_admin_certificate_template() or {}
    template_background = build_template_data_uri(
        str(template_config.get("template_file_path")).strip()
        if template_config.get("template_file_path")
        else None
    )
    signatory_name = (
        str(template_config.get("signatory_name")).strip()
        if template_config.get("signatory_name")
        else "Admin Name"
    )
    safe_signatory_name = escape(signatory_name)
    if template_background:
        html = f"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>FSL Basic Course Certificate</title>
    <style>
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        padding: 24px;
        background: #e9e9e9;
        font-family: "Segoe UI", Tahoma, sans-serif;
      }}
      .certificate {{
        position: relative;
        width: 1123px;
        max-width: 100%;
        aspect-ratio: 1123 / 794;
        margin: 0 auto;
        overflow: hidden;
        background: #f5f5f5 url("{template_background}") center / 100% 100% no-repeat;
      }}
      .name {{
        position: absolute;
        left: 50%;
        top: 36.7%;
        transform: translateX(-50%);
        width: 72%;
        text-align: center;
        font-size: clamp(34px, 5vw, 78px);
        line-height: 1.08;
        letter-spacing: 0.02em;
        font-weight: 800;
        color: #2f3137;
        background: rgba(247, 247, 247, 0.93);
        padding: 5px 14px;
        border-radius: 8px;
      }}
      .date {{
        position: absolute;
        left: 16.55%;
        bottom: 8.2%;
        transform: translateX(-50%);
        min-width: 240px;
        text-align: center;
        font-size: clamp(16px, 2vw, 32px);
        font-weight: 700;
        letter-spacing: 0.02em;
        color: #355389;
        background: rgba(247, 247, 247, 0.9);
        padding: 2px 10px;
        border-radius: 6px;
      }}
      .signature-block {{
        position: absolute;
        right: 11.7%;
        bottom: 7.9%;
        width: 280px;
        text-align: center;
      }}
      .signature-name {{
        font-size: clamp(15px, 1.8vw, 28px);
        font-weight: 800;
        color: #2f3137;
        line-height: 1.15;
      }}
      .signature-title {{
        font-size: clamp(12px, 1.2vw, 20px);
        color: #4b5563;
        margin-top: 2px;
      }}
      .signature-org {{
        font-size: clamp(12px, 1.1vw, 18px);
        color: #4b5563;
        margin-top: 1px;
      }}
    </style>
  </head>
  <body>
    <div class="certificate">
      <div class="name">{safe_display_name}</div>
      <div class="date">{safe_completion_date}</div>
      <div class="signature-block">
        <div class="signature-name">{safe_signatory_name}</div>
        <div class="signature-title">Head Instructor</div>
        <div class="signature-org">Hand and Heart</div>
      </div>
    </div>
  </body>
</html>
""".strip()
    else:
        html = f"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>FSL Basic Course Certificate</title>
    <style>
      body {{
        font-family: "Segoe UI", Tahoma, sans-serif;
        padding: 40px;
        background: #f5f4f1;
        color: #1c1c2e;
      }}
      .card {{
        max-width: 960px;
        margin: 0 auto;
        padding: 64px 56px;
        border: 8px solid #2e44a8;
        background: white;
      }}
      .line {{
        text-align: center;
        color: #355389;
      }}
      .line-award {{
        font-size: 44px;
        margin: 24px 0 10px;
        font-weight: 300;
      }}
      .line-name {{
        font-size: 64px;
        font-weight: 800;
        color: #2f3137;
        margin: 0 0 16px;
      }}
      .line-complete {{
        font-size: 34px;
        margin: 12px 0 6px;
        font-weight: 300;
      }}
      .line-course {{
        font-size: 72px;
        margin: 0;
        font-weight: 800;
      }}
      .line-offered {{
        font-size: 34px;
        margin: 6px 0 26px;
        font-weight: 300;
      }}
      .date {{
        text-align: left;
        color: #355389;
        margin-top: 18px;
        font-weight: 700;
      }}
      .signature {{
        margin-top: 10px;
        text-align: right;
        color: #2f3137;
      }}
      .signature .name {{
        font-size: 26px;
        font-weight: 800;
      }}
      .signature .title,
      .signature .org {{
        font-size: 16px;
        color: #4b5563;
      }}
    </style>
  </head>
  <body>
    <div class="card">
      <p class="line line-award">This certificate awarded to</p>
      <p class="line line-name">{safe_display_name}</p>
      <p class="line line-complete">for successfully completing</p>
      <p class="line line-course">FSL Basic Course</p>
      <p class="line line-offered">offered by Hand and Heart</p>
      <p class="date">{safe_completion_date}</p>
      <div class="signature">
        <div class="name">{safe_signatory_name}</div>
        <div class="title">Head Instructor</div>
        <div class="org">Hand and Heart</div>
      </div>
    </div>
  </body>
</html>
""".strip()
    headers = {
        "Content-Disposition": f'attachment; filename="ugnay-certificate-{current_student.id}.html"'
    }
    return Response(content=html, media_type="text/html", headers=headers)

from __future__ import annotations

import secrets
import string
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.datetime_utils import utc_now
from app.models.certificate import CertificateTemplate, IssuedCertificate
from app.models.lms_progress import SectionModuleItemProgress, SectionModuleProgress
from app.models.session import UserSession
from app.models.section import Section, SectionStudentAssignment, SectionTeacherAssignment
from app.models.section_module import SectionModule, SectionModuleItem
from app.models.user import User
from app.services.word_localization import canonicalize_word_label
from app.schemas.lms import (
    SectionMemberOut,
    SectionModuleItemOut,
    SectionOut,
    StudentCourseModuleOut,
    StudentCourseOut,
    StudentModuleItemOut,
    UserSummaryOut,
)

SELF_PACED_CONTENT_ITEM_TYPES = {
    "readable",
    "video_resource",
    "document_resource",
    "interactive_resource",
    "external_link_resource",
}

RESOURCE_ITEM_TYPES = {
    "video_resource",
    "document_resource",
    "interactive_resource",
    "external_link_resource",
}

CERTIFICATE_REQUIRED_MODULE_COUNT = 12


def build_unique_username(db: Session, email: str, role: str) -> str:
    local_part = email.split("@", maxsplit=1)[0].strip().lower()
    base = "".join(char if char.isalnum() else "." for char in local_part).strip(".") or role
    candidate = base[:110]
    suffix = 1
    while db.query(User).filter(User.username == candidate).first():
        candidate = f"{base[:100]}.{suffix}"
        suffix += 1
    return candidate


def generate_temporary_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        value = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(char.isupper() for char in value)
            and any(char.isdigit() for char in value)
            and any(not char.isalnum() for char in value)
        ):
            return value


def user_summary(user: User) -> UserSummaryOut:
    return UserSummaryOut(
        id=user.id,
        username=user.username,
        role=user.role,
        first_name=user.first_name,
        last_name=user.last_name,
        company_name=user.company_name,
        email=user.email,
    )


def user_display_name(user: User | None) -> str:
    if user is None:
        return "Unknown Instructor"
    full_name = " ".join(
        part.strip()
        for part in [user.first_name or "", user.last_name or ""]
        if part and part.strip()
    ).strip()
    return full_name or user.username


def _parse_iso_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    raw_value = value.strip()
    if not raw_value:
        return None
    try:
        return datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def section_out(section: Section) -> SectionOut:
    teacher_members = [
        SectionMemberOut(
            **user_summary(assignment.teacher).model_dump(),
            assigned_at=assignment.assigned_at,
        )
        for assignment in sorted(section.teachers, key=lambda item: item.assigned_at)
        if assignment.teacher
    ]
    student_members = [
        SectionMemberOut(
            **user_summary(assignment.student).model_dump(),
            assigned_at=assignment.assigned_at,
            course_completed_at=assignment.course_completed_at,
            auto_archive_due_at=assignment.auto_archive_due_at,
        )
        for assignment in sorted(section.students, key=lambda item: item.assigned_at)
        if assignment.student
    ]
    return SectionOut(
        id=section.id,
        code=section.code,
        name=section.name,
        description=section.description,
        status=section.status,
        teacher_count=len(teacher_members),
        student_count=len(student_members),
        teachers=teacher_members,
        students=student_members,
    )


def get_teacher_section_ids(db: Session, teacher_id: int) -> set[int]:
    teacher = db.query(User).filter(User.id == teacher_id, User.archived_at.is_(None)).first()
    if teacher and teacher.role in {"teacher", "admin"}:
        return {row.id for row in db.query(Section.id).all()}
    return {
        row.section_id
        for row in db.query(SectionTeacherAssignment.section_id)
        .filter(SectionTeacherAssignment.teacher_id == teacher_id)
        .all()
    }


def get_student_section_assignment(db: Session, student_id: int) -> SectionStudentAssignment | None:
    return (
        db.query(SectionStudentAssignment)
        .options(joinedload(SectionStudentAssignment.section))
        .filter(SectionStudentAssignment.student_id == student_id)
        .first()
    )


def ensure_teacher_assigned_to_section(db: Session, teacher_id: int, section_id: int) -> None:
    assignment = (
        db.query(SectionTeacherAssignment)
        .filter(
            SectionTeacherAssignment.teacher_id == teacher_id,
            SectionTeacherAssignment.section_id == section_id,
        )
        .first()
    )
    if assignment is None:
        db.add(SectionTeacherAssignment(teacher_id=teacher_id, section_id=section_id))


def assign_student_to_section(db: Session, student_id: int, section_id: int) -> None:
    current = (
        db.query(SectionStudentAssignment)
        .filter(SectionStudentAssignment.student_id == student_id)
        .first()
    )
    if current:
        current.section_id = section_id
        current.course_completed_at = None
        current.auto_archive_due_at = None
        db.add(current)
        return
    db.add(SectionStudentAssignment(student_id=student_id, section_id=section_id))


def sync_module_progress(
    db: Session,
    *,
    student_id: int,
    module: SectionModule,
) -> SectionModuleProgress:
    published_items = [item for item in module.items if item.is_published]
    total_required = sum(1 for item in published_items if item.is_required)
    progress = (
        db.query(SectionModuleProgress)
        .filter(
            SectionModuleProgress.student_id == student_id,
            SectionModuleProgress.section_module_id == module.id,
        )
        .first()
    )
    if progress is None:
        progress = SectionModuleProgress(
            student_id=student_id,
            section_module_id=module.id,
            status="not_started",
            progress_percent=0,
            completed_items=0,
            total_items=total_required,
            last_completed_item_order=0,
        )

    item_progress_entries = {
        entry.section_module_item_id: entry
        for entry in db.query(SectionModuleItemProgress).filter(
            SectionModuleItemProgress.student_id == student_id,
            SectionModuleItemProgress.section_module_id == module.id,
        )
    }
    completed_items = 0
    last_completed_order = 0
    for item in published_items:
        entry = item_progress_entries.get(item.id)
        is_complete = bool(entry and entry.status == "completed")
        if item.is_required and is_complete:
            completed_items += 1
        if is_complete:
            last_completed_order = max(last_completed_order, item.order_index)

    progress.total_items = total_required
    progress.completed_items = completed_items
    progress.last_completed_item_order = last_completed_order
    progress.progress_percent = int((completed_items / total_required) * 100) if total_required else 100
    if total_required == 0:
        progress.status = "completed"
    elif completed_items == 0:
        progress.status = "not_started"
    elif completed_items >= total_required:
        progress.status = "completed"
        progress.progress_percent = 100
    else:
        progress.status = "in_progress"

    db.add(progress)
    db.flush()
    return progress


def evaluate_item_submission(
    item: SectionModuleItem,
    response_text: str,
    score_percent: float | None = None,
    extra_payload: dict[str, Any] | None = None,
) -> tuple[bool | None, float | None]:
    config = dict(item.config or {})
    normalized = response_text.strip()
    if item.item_type in SELF_PACED_CONTENT_ITEM_TYPES:
        return True, 100.0

    if item.item_type == "multiple_choice_assessment":
        raw_questions = config.get("questions")
        if isinstance(raw_questions, list) and raw_questions:
            question_rows: list[dict[str, str]] = []
            for index, entry in enumerate(raw_questions, start=1):
                if not isinstance(entry, dict):
                    continue
                question = str(entry.get("question") or "").strip()
                correct_answer = str(entry.get("correct_answer") or "").strip()
                question_key = str(entry.get("question_key") or f"q{index}").strip() or f"q{index}"
                if not question or not correct_answer:
                    continue
                question_rows.append(
                    {
                        "question_key": question_key,
                        "correct_answer": correct_answer,
                    }
                )
            if question_rows:
                submitted_answers: dict[str, str] = {}
                if isinstance(extra_payload, dict):
                    raw_answers = extra_payload.get("question_answers")
                    if isinstance(raw_answers, dict):
                        submitted_answers = {
                            str(key).strip(): str(value).strip()
                            for key, value in raw_answers.items()
                            if str(key).strip() and str(value).strip()
                        }
                if not submitted_answers and len(question_rows) == 1 and normalized:
                    submitted_answers[question_rows[0]["question_key"]] = normalized

                total_questions = len(question_rows)
                correct_count = 0
                for question in question_rows:
                    selected = submitted_answers.get(question["question_key"], "")
                    if canonicalize_word_label(selected) == canonicalize_word_label(
                        question["correct_answer"]
                    ):
                        correct_count += 1
                computed_score = (correct_count / total_questions) * 100 if total_questions else 0.0
                is_correct = total_questions > 0 and correct_count == total_questions
                return is_correct, round(computed_score, 2)

        expected = str(config.get("correct_answer") or "").strip()
        is_correct = canonicalize_word_label(normalized) == canonicalize_word_label(expected)
        return is_correct, 100.0 if is_correct else 0.0

    if item.item_type == "identification_assessment":
        raw_questions = config.get("questions")
        if isinstance(raw_questions, list) and raw_questions:
            question_rows: list[dict[str, Any]] = []
            for index, entry in enumerate(raw_questions, start=1):
                if not isinstance(entry, dict):
                    continue
                question = str(entry.get("question") or "").strip()
                correct_answer = str(entry.get("correct_answer") or "").strip()
                question_key = str(entry.get("question_key") or f"q{index}").strip() or f"q{index}"
                raw_accepted_answers = entry.get("accepted_answers")
                accepted_answers = {
                    canonicalize_word_label(str(value))
                    for value in (raw_accepted_answers if isinstance(raw_accepted_answers, list) else [])
                    if str(value).strip()
                }
                canonical_correct_answer = canonicalize_word_label(correct_answer)
                if canonical_correct_answer:
                    accepted_answers.add(canonical_correct_answer)
                if not question or not accepted_answers:
                    continue
                question_rows.append(
                    {
                        "question_key": question_key,
                        "accepted_answers": accepted_answers,
                    }
                )
            if question_rows:
                submitted_answers: dict[str, str] = {}
                if isinstance(extra_payload, dict):
                    raw_answers = extra_payload.get("question_answers")
                    if isinstance(raw_answers, dict):
                        submitted_answers = {
                            str(key).strip(): str(value).strip()
                            for key, value in raw_answers.items()
                            if str(key).strip() and str(value).strip()
                        }
                if not submitted_answers and len(question_rows) == 1 and normalized:
                    submitted_answers[question_rows[0]["question_key"]] = normalized

                total_questions = len(question_rows)
                correct_count = 0
                for question_row in question_rows:
                    selected = canonicalize_word_label(
                        submitted_answers.get(question_row["question_key"], "")
                    )
                    if selected and selected in question_row["accepted_answers"]:
                        correct_count += 1
                computed_score = (correct_count / total_questions) * 100 if total_questions else 0.0
                is_correct = total_questions > 0 and correct_count == total_questions
                return is_correct, round(computed_score, 2)

        accepted = {
            canonicalize_word_label(str(value))
            for value in (config.get("accepted_answers") or [])
            if str(value).strip()
        }
        expected = canonicalize_word_label(str(config.get("correct_answer") or "").strip())
        if expected:
            accepted.add(expected)
        is_correct = canonicalize_word_label(normalized) in accepted
        return is_correct, 100.0 if is_correct else 0.0

    if item.item_type == "signing_lab_assessment":
        raw_questions = config.get("questions")
        if isinstance(raw_questions, list) and raw_questions:
            question_rows: list[dict[str, str]] = []
            for index, entry in enumerate(raw_questions, start=1):
                if not isinstance(entry, dict):
                    continue
                question = str(entry.get("question") or "").strip()
                correct_answer = str(entry.get("correct_answer") or "").strip()
                question_key = str(entry.get("question_key") or f"q{index}").strip() or f"q{index}"
                if not question or not correct_answer:
                    continue
                question_rows.append(
                    {
                        "question_key": question_key,
                        "correct_answer": correct_answer,
                    }
                )
            if question_rows:
                submitted_answers: dict[str, str] = {}
                if isinstance(extra_payload, dict):
                    raw_answers = extra_payload.get("question_answers")
                    if isinstance(raw_answers, dict):
                        submitted_answers = {
                            str(key).strip(): str(value).strip()
                            for key, value in raw_answers.items()
                            if str(key).strip() and str(value).strip()
                        }
                if not submitted_answers and len(question_rows) == 1 and normalized:
                    submitted_answers[question_rows[0]["question_key"]] = normalized

                total_questions = len(question_rows)
                raw_required_count = config.get("required_count")
                if isinstance(raw_required_count, str):
                    raw_required_count = int(raw_required_count) if raw_required_count.isdigit() else None
                required_count = (
                    int(raw_required_count)
                    if isinstance(raw_required_count, int) and raw_required_count > 0
                    else total_questions
                )
                required_count = max(1, min(required_count, total_questions))
                require_all_value = config.get("require_all")
                require_all = (
                    require_all_value if isinstance(require_all_value, bool) else str(require_all_value).lower() == "true"
                )
                if require_all:
                    required_count = total_questions

                answered_count = 0
                correct_count = 0
                for question in question_rows:
                    selected = submitted_answers.get(question["question_key"], "").strip()
                    if not selected:
                        continue
                    answered_count += 1
                    if canonicalize_word_label(selected) == canonicalize_word_label(
                        question["correct_answer"]
                    ):
                        correct_count += 1

                meets_requirement = answered_count >= required_count
                computed_score = (correct_count / total_questions) * 100 if total_questions else 0.0
                is_correct = meets_requirement and correct_count >= required_count
                return is_correct, round(computed_score, 2)

        expected = str(config.get("expected_answer") or "").strip()
        if not expected:
            return None, score_percent
        is_correct = canonicalize_word_label(normalized) == canonicalize_word_label(expected)
        return is_correct, score_percent if score_percent is not None else (100.0 if is_correct else 0.0)

    return None, score_percent


def serialize_course_for_student(db: Session, student: User, *, include_unpublished: bool = False) -> StudentCourseOut:
    assignment = get_student_section_assignment(db, student.id)
    if assignment is None or assignment.section is None:
        return StudentCourseOut(section=None, modules=[])

    section = (
        db.query(Section)
        .options(
            joinedload(Section.modules).joinedload(SectionModule.items),
            joinedload(Section.modules).joinedload(SectionModule.created_by_teacher),
            joinedload(Section.teachers).joinedload(SectionTeacherAssignment.teacher),
            joinedload(Section.students).joinedload(SectionStudentAssignment.student),
        )
        .filter(Section.id == assignment.section_id)
        .first()
    )
    if section is None:
        return StudentCourseOut(section=None, modules=[])

    all_item_progress = {
        row.section_module_item_id: row
        for row in db.query(SectionModuleItemProgress).filter(
            SectionModuleItemProgress.student_id == student.id
        )
    }
    modules_out: list[StudentCourseModuleOut] = []
    previous_module_complete = True

    for module in sorted(section.modules, key=lambda item: item.order_index):
        if not include_unpublished and not module.is_published:
            continue
        module_progress = sync_module_progress(db, student_id=student.id, module=module)
        module_locked = not previous_module_complete
        next_item_unlocked = not module_locked
        item_out: list[StudentModuleItemOut] = []
        for item in sorted(module.items, key=lambda entry: entry.order_index):
            if not include_unpublished and not item.is_published:
                continue
            progress_entry = all_item_progress.get(item.id)
            progress_payload = dict(progress_entry.submitted_payload or {}) if progress_entry else {}
            feedback_raw = progress_payload.get("teacher_feedback")
            teacher_feedback = (
                feedback_raw.strip()
                if isinstance(feedback_raw, str) and feedback_raw.strip()
                else None
            )
            teacher_returned_at = _parse_iso_datetime(progress_payload.get("teacher_scored_at"))
            rubric_score_percent = _parse_float(progress_payload.get("teacher_rubric_score_percent"))
            teacher_score_percent = None
            if item.item_type == "upload_assessment" and progress_entry:
                teacher_score_percent = (
                    round(max(0.0, min(float(rubric_score_percent), 100.0)), 2)
                    if rubric_score_percent is not None
                    else progress_entry.score_percent
                )
            item_status = progress_entry.status if progress_entry else "not_started"
            item_locked = not next_item_unlocked
            is_complete = item_status == "completed"
            item_out.append(
                StudentModuleItemOut(
                    id=item.id,
                    title=item.title,
                    item_type=item.item_type,
                    order_index=item.order_index,
                    instructions=item.instructions,
                    content_text=item.content_text,
                    config=dict(item.config or {}),
                    is_locked=item_locked,
                    status=item_status,
                    attempt_count=progress_entry.attempt_count if progress_entry else 0,
                    response_text=progress_entry.response_text if progress_entry else None,
                    score_percent=progress_entry.score_percent if progress_entry else None,
                    is_correct=progress_entry.is_correct if progress_entry else None,
                    teacher_score_percent=teacher_score_percent,
                    teacher_feedback=teacher_feedback,
                    teacher_returned_at=teacher_returned_at,
                )
            )
            if item.is_required and not is_complete:
                next_item_unlocked = False
        modules_out.append(
            StudentCourseModuleOut(
                id=module.id,
                title=module.title,
                description=module.description,
                order_index=module.order_index,
                created_by_teacher_id=module.created_by_teacher_id,
                instructor_name=user_display_name(module.created_by_teacher),
                is_locked=module_locked,
                status=module_progress.status,
                progress_percent=module_progress.progress_percent,
                items=item_out,
            )
        )
        previous_module_complete = module_progress.status == "completed"

    return StudentCourseOut(section=section_out(section), modules=modules_out)


def section_completion_ready(db: Session, student_id: int, section_id: int) -> bool:
    assignment = (
        db.query(SectionStudentAssignment)
        .filter(
            SectionStudentAssignment.student_id == student_id,
            SectionStudentAssignment.section_id == section_id,
        )
        .first()
    )
    # Keep certificate unlocked once the student has already completed the required track.
    if assignment and assignment.course_completed_at is not None:
        return True

    modules = (
        db.query(SectionModule)
        .filter(SectionModule.section_id == section_id, SectionModule.is_published.is_(True))
        .order_by(SectionModule.order_index.asc())
        .all()
    )
    if len(modules) < CERTIFICATE_REQUIRED_MODULE_COUNT:
        return False
    for module in modules[:CERTIFICATE_REQUIRED_MODULE_COUNT]:
        progress = sync_module_progress(db, student_id=student_id, module=module)
        if progress.status != "completed":
            return False
    return True


def refresh_student_completion_schedule(
    db: Session, *, student_id: int
) -> SectionStudentAssignment | None:
    assignment = (
        db.query(SectionStudentAssignment)
        .filter(SectionStudentAssignment.student_id == student_id)
        .first()
    )
    if assignment is None:
        return None

    if assignment.course_completed_at is not None:
        if assignment.auto_archive_due_at is None:
            assignment.auto_archive_due_at = assignment.course_completed_at + timedelta(days=30)
            db.add(assignment)
        return assignment

    completed = section_completion_ready(db, student_id, assignment.section_id)
    if completed:
        completed_at = utc_now()
        assignment.course_completed_at = completed_at
        assignment.auto_archive_due_at = completed_at + timedelta(days=30)
        db.add(assignment)
    return assignment


def auto_archive_due_students(db: Session) -> int:
    now = utc_now()
    due_assignments = (
        db.query(SectionStudentAssignment)
        .options(joinedload(SectionStudentAssignment.student))
        .filter(SectionStudentAssignment.auto_archive_due_at.is_not(None))
        .filter(SectionStudentAssignment.auto_archive_due_at <= now)
        .all()
    )
    archived_count = 0
    for assignment in due_assignments:
        student = assignment.student
        if not student or student.archived_at is not None:
            continue
        student.archived_at = now
        db.add(student)
        db.query(UserSession).filter(UserSession.user_id == student.id).delete(
            synchronize_session=False
        )
        archived_count += 1
    return archived_count


def ensure_issued_certificate(
    db: Session, *, template: CertificateTemplate, student_id: int, section_id: int
) -> IssuedCertificate:
    issued = (
        db.query(IssuedCertificate)
        .filter(
            IssuedCertificate.template_id == template.id,
            IssuedCertificate.student_id == student_id,
        )
        .first()
    )
    if issued:
        return issued
    issued = IssuedCertificate(template_id=template.id, student_id=student_id, section_id=section_id)
    db.add(issued)
    db.flush()
    return issued


def latest_approved_template(db: Session, section_id: int) -> CertificateTemplate | None:
    return (
        db.query(CertificateTemplate)
        .filter(
            CertificateTemplate.section_id == section_id,
            CertificateTemplate.status == "approved",
        )
        .order_by(CertificateTemplate.created_at.desc(), CertificateTemplate.id.desc())
        .first()
    )


def count_users_by_role(db: Session, role: str) -> int:
    return (
        db.query(func.count(User.id))
        .filter(User.role == role, User.archived_at.is_(None))
        .scalar()
        or 0
    )

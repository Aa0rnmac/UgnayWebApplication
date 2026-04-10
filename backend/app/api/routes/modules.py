from collections import OrderedDict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_learning_user, get_current_student, has_teacher_access
from app.db.session import get_db
from app.models.activity_attempt import ActivityAttempt, ActivityAttemptItem
from app.models.assessment_report import AssessmentReport
from app.models.module import Module
from app.models.module_activity import ModuleActivity
from app.models.progress import UserModuleProgress
from app.models.user import User
from app.schemas.module import (
    ActivityAttemptCreate,
    ActivityAttemptOut,
    ModuleActivityOut,
    ModuleOut,
    ModuleTeacherSummaryOut,
)
from app.schemas.progress import ProgressUpdateRequest
from app.schemas.teacher import TeacherStudentCertificateOut
from app.services.student_certificate import build_student_certificate_status
from app.services.teacher_context import resolve_teacher_context_for_student

router = APIRouter(prefix="/modules", tags=["modules"])

MODULE_ACTIVITY_TOTALS_BY_SLUG: dict[str, int] = {
    "fsl-alphabets": 3,
    "numbers": 5,
    "common-words": 2,
    "family-members": 2,
    "people-description": 2,
    "days": 2,
    "colors-descriptions": 3,
    "basic-conversations": 2,
}


def _module_total_activities(module: Module) -> int:
    return max(1, MODULE_ACTIVITY_TOTALS_BY_SLUG.get(module.slug, len(module.assessments)))


def _visible_modules_query(db: Session, current_user: User):
    query = (
        db.query(Module)
        .options(selectinload(Module.activities), joinedload(Module.owner_teacher))
        .filter(Module.archived_at.is_(None))
    )
    if has_teacher_access(current_user):
        return query.order_by(Module.order_index.asc(), Module.id.asc())

    teacher_context = resolve_teacher_context_for_student(db, current_user)
    visible_filters = [
        and_(Module.module_kind == "system", Module.is_published.is_(True)),
    ]
    if teacher_context.teacher is not None:
        visible_filters.append(
            and_(
                Module.module_kind == "teacher_custom",
                Module.owner_teacher_id == teacher_context.teacher.id,
                Module.is_published.is_(True),
                Module.is_shared_pool.is_(False),
            )
        )
    return query.filter(or_(*visible_filters)).order_by(Module.order_index.asc(), Module.id.asc())


def _published_activities(module: Module, current_user: User | None = None) -> list[ModuleActivity]:
    if current_user and has_teacher_access(current_user):
        return sorted(list(module.activities or []), key=lambda item: item.order_index)
    return [
        item
        for item in sorted(list(module.activities or []), key=lambda activity: activity.order_index)
        if item.is_published
    ]


def _module_total_activities(module: Module, current_user: User | None = None) -> int:
    activities = _published_activities(module, current_user=current_user)
    if activities:
        return len(activities)
    return max(1, len(module.assessments))


def _module_payload(
    module: Module,
    progress: UserModuleProgress | None,
    *,
    current_user: User | None = None,
) -> ModuleOut:
    status_value = "in_progress"
    progress_percent = 0
    assessment_score = None

    if progress:
        assessment_score = progress.assessment_score
        if progress.status == "completed":
            status_value = "completed"
            progress_percent = 100
        else:
            status_value = progress.status or "in_progress"
            progress_percent = progress.progress_percent

    return ModuleOut(
        id=module.id,
        slug=module.slug,
        title=module.title,
        description=module.description,
        order_index=module.order_index,
        module_kind=module.module_kind,
        owner_teacher=_module_teacher_summary(module.owner_teacher),
        is_shared_pool=module.is_shared_pool,
        source_module_id=module.source_module_id,
        cover_image_url=module.cover_image_path,
        lessons=module.lessons,
        assessments=module.assessments,
        activities=[
            ModuleActivityOut.model_validate(activity)
            for activity in _published_activities(module, current_user=current_user)
        ],
        is_locked=False,
        is_published=module.is_published,
        status=status_value,
        progress_percent=progress_percent,
        assessment_score=assessment_score,
    )


def _module_teacher_summary(user: User | None) -> ModuleTeacherSummaryOut | None:
    if user is None:
        return None
    full_name = " ".join(
        part.strip()
        for part in [user.first_name or "", user.middle_name or "", user.last_name or ""]
        if part and part.strip()
    ).strip()
    return ModuleTeacherSummaryOut(
        id=user.id,
        username=user.username,
        full_name=full_name or user.username,
        email=user.email,
    )


def _build_modules_for_user(db: Session, current_user: User) -> list[ModuleOut]:
    modules = _visible_modules_query(db, current_user).all()
    progress_entries = (
        db.query(UserModuleProgress).filter(UserModuleProgress.user_id == current_user.id).all()
    )
    progress_by_module = {item.module_id: item for item in progress_entries}

    return [
        _module_payload(module, progress_by_module.get(module.id), current_user=current_user)
        for module in modules
    ]


def _get_module_and_progress(
    db: Session, current_user: User, module_id: int
) -> tuple[Module, UserModuleProgress | None]:
    query = _visible_modules_query(db, current_user).filter(Module.id == module_id)
    module = query.first()
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")

    progress = (
        db.query(UserModuleProgress)
        .filter(UserModuleProgress.user_id == current_user.id, UserModuleProgress.module_id == module_id)
        .first()
    )
    return module, progress


def _ensure_progress(
    db: Session,
    current_user: User,
    module_id: int,
    progress: UserModuleProgress | None,
) -> UserModuleProgress:
    if progress:
        return progress

    progress = UserModuleProgress(
        user_id=current_user.id,
        module_id=module_id,
        status="in_progress",
        progress_percent=0,
        completed_lessons=[],
        completed_assessments=[],
    )
    db.add(progress)
    db.flush()
    return progress


def _update_completed_lessons(progress: UserModuleProgress, completed_lesson_id: str | None) -> None:
    completed_lessons = list(progress.completed_lessons or [])
    if completed_lesson_id and completed_lesson_id not in completed_lessons:
        completed_lessons.append(completed_lesson_id)
    progress.completed_lessons = completed_lessons


def _queue_assessment_report_from_attempt(
    db: Session,
    current_user: User,
    module: Module,
    attempt: ActivityAttempt,
) -> None:
    report = AssessmentReport(
        user_id=current_user.id,
        module_id=module.id,
        module_owner_teacher_id=attempt.module_owner_teacher_id,
        handled_by_teacher_id=attempt.handled_by_teacher_id,
        handling_session_id=attempt.handling_session_id,
        module_title=module.title,
        assessment_id=attempt.activity_key,
        assessment_title=attempt.activity_title,
        right_count=attempt.right_count,
        wrong_count=attempt.wrong_count,
        total_items=attempt.total_items,
        score_percent=attempt.score_percent,
        improvement_areas=list(attempt.improvement_areas or []),
        status="queued",
    )
    db.add(report)


def _sync_module_progress_from_attempts(
    db: Session,
    current_user: User,
    module: Module,
    progress: UserModuleProgress,
    *,
    mark_completed: bool = False,
) -> None:
    attempts = (
        db.query(ActivityAttempt)
        .filter(ActivityAttempt.user_id == current_user.id, ActivityAttempt.module_id == module.id)
        .order_by(ActivityAttempt.submitted_at.desc(), ActivityAttempt.id.desc())
        .all()
    )

    completed_assessments = list(
        OrderedDict.fromkeys(attempt.activity_key for attempt in attempts if attempt.activity_key)
    )
    progress.completed_assessments = completed_assessments

    total_activities = _module_total_activities(module, current_user=current_user)
    completed_count = min(len(completed_assessments), total_activities)
    progress.progress_percent = int((completed_count / total_activities) * 100) if total_activities else 0

    latest_attempt = attempts[0] if attempts else None
    if latest_attempt:
        progress.assessment_score = latest_attempt.score_percent
        progress.assessment_right_count = latest_attempt.right_count
        progress.assessment_wrong_count = latest_attempt.wrong_count
        progress.assessment_total_items = latest_attempt.total_items
        progress.assessment_label = latest_attempt.activity_title
        progress.improvement_areas = list(latest_attempt.improvement_areas or [])

    if mark_completed or progress.progress_percent >= 100:
        progress.status = "completed"
        progress.progress_percent = 100
    else:
        progress.status = "in_progress"

    db.add(progress)


def _get_activity_or_404(db: Session, module_id: int, activity_identifier: str) -> ModuleActivity:
    query = db.query(ModuleActivity).filter(ModuleActivity.module_id == module_id)
    activity = query.filter(ModuleActivity.activity_key == activity_identifier).first()
    if activity is None and activity_identifier.isdigit():
        activity = query.filter(ModuleActivity.id == int(activity_identifier)).first()
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found.")
    return activity


def _ensure_legacy_activity(
    db: Session,
    module: Module,
    *,
    activity_key: str,
    activity_title: str,
) -> ModuleActivity:
    activity = (
        db.query(ModuleActivity)
        .filter(ModuleActivity.module_id == module.id, ModuleActivity.activity_key == activity_key)
        .first()
    )
    if activity:
        return activity

    next_order = len(module.activities or []) + 1
    activity = ModuleActivity(
        module_id=module.id,
        activity_key=activity_key,
        title=activity_title,
        activity_type="multiple_choice",
        order_index=next_order,
        instructions="Legacy compatibility activity generated from /modules/{module_id}/progress.",
        definition={"items": []},
        is_published=module.is_published,
    )
    db.add(activity)
    db.flush()
    return activity


@router.get("", response_model=list[ModuleOut])
def list_modules(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_learning_user)
) -> list[ModuleOut]:
    return _build_modules_for_user(db, current_user)


@router.get("/certificate-status", response_model=TeacherStudentCertificateOut)
def get_student_certificate_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_student),
) -> TeacherStudentCertificateOut:
    return build_student_certificate_status(db, student=current_user)


@router.get("/{module_id}", response_model=ModuleOut)
def get_module(
    module_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_learning_user),
) -> ModuleOut:
    module, progress = _get_module_and_progress(db, current_user, module_id)
    return _module_payload(module, progress, current_user=current_user)


@router.post("/{module_id}/activities/{activity_key}/attempts", response_model=ActivityAttemptOut)
def submit_activity_attempt(
    module_id: int,
    activity_key: str,
    payload: ActivityAttemptCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_learning_user),
) -> ActivityAttemptOut:
    module, progress = _get_module_and_progress(db, current_user, module_id)
    activity = _get_activity_or_404(db, module.id, activity_key)
    if not activity.is_published and not has_teacher_access(current_user):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found.")

    progress = _ensure_progress(db, current_user, module.id, progress)
    _update_completed_lessons(progress, payload.completed_lesson_id)

    teacher_context = None
    if not has_teacher_access(current_user):
        teacher_context = resolve_teacher_context_for_student(db, current_user)

    attempt = ActivityAttempt(
        user_id=current_user.id,
        module_id=module.id,
        module_activity_id=activity.id,
        module_owner_teacher_id=module.owner_teacher_id,
        handled_by_teacher_id=teacher_context.session.teacher_id if teacher_context and teacher_context.session else None,
        handling_session_id=teacher_context.session.id if teacher_context and teacher_context.session else None,
        activity_key=activity.activity_key,
        activity_title=activity.title,
        activity_type=activity.activity_type,
        right_count=payload.right_count,
        wrong_count=payload.wrong_count,
        total_items=payload.total_items,
        score_percent=payload.score_percent,
        improvement_areas=[area.strip() for area in payload.improvement_areas if area and area.strip()],
        ai_metadata=payload.ai_metadata,
        source=payload.source.strip() or "api",
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(attempt)
    db.flush()

    for item in payload.items:
        db.add(
            ActivityAttemptItem(
                attempt_id=attempt.id,
                item_key=item.item_key,
                prompt=item.prompt,
                expected_answer=item.expected_answer,
                student_answer=item.student_answer,
                is_correct=item.is_correct,
                confidence=item.confidence,
                ai_metadata=item.ai_metadata,
            )
        )

    _queue_assessment_report_from_attempt(db, current_user, module, attempt)
    _sync_module_progress_from_attempts(
        db,
        current_user,
        module,
        progress,
        mark_completed=payload.mark_module_completed,
    )

    db.commit()
    db.refresh(progress)
    db.refresh(attempt)

    return ActivityAttemptOut(
        id=attempt.id,
        module_id=module.id,
        module_activity_id=activity.id,
        activity_key=attempt.activity_key,
        activity_title=attempt.activity_title,
        activity_type=attempt.activity_type,
        right_count=attempt.right_count,
        wrong_count=attempt.wrong_count,
        total_items=attempt.total_items,
        score_percent=attempt.score_percent,
        improvement_areas=list(attempt.improvement_areas or []),
        ai_metadata=dict(attempt.ai_metadata or {}),
        source=attempt.source,
        items=[
            {
                "id": item.id,
                "item_key": item.item_key,
                "prompt": item.prompt,
                "expected_answer": item.expected_answer,
                "student_answer": item.student_answer,
                "is_correct": item.is_correct,
                "confidence": item.confidence,
                "ai_metadata": item.ai_metadata or {},
            }
            for item in attempt.items
        ],
        progress=_module_payload(module, progress, current_user=current_user),
    )


@router.post("/{module_id}/progress", response_model=ModuleOut)
def update_module_progress(
    module_id: int,
    payload: ProgressUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_learning_user),
) -> ModuleOut:
    module, progress = _get_module_and_progress(db, current_user, module_id)
    progress = _ensure_progress(db, current_user, module_id, progress)
    _update_completed_lessons(progress, payload.completed_lesson_id)

    has_assessment_summary = (
        payload.assessment_total is not None
        and payload.assessment_right is not None
        and payload.assessment_wrong is not None
        and payload.assessment_title is not None
    )
    if has_assessment_summary:
        activity_key = (payload.assessment_id or payload.assessment_title.lower().replace(" ", "-")).strip()
        activity = _ensure_legacy_activity(
            db,
            module,
            activity_key=activity_key,
            activity_title=payload.assessment_title.strip() or "Assessment",
        )
        attempt = ActivityAttempt(
            user_id=current_user.id,
            module_id=module.id,
            module_activity_id=activity.id,
            activity_key=activity.activity_key,
            activity_title=activity.title,
            activity_type=activity.activity_type,
            right_count=payload.assessment_right,
            wrong_count=payload.assessment_wrong,
            total_items=payload.assessment_total,
            score_percent=payload.assessment_score or 0,
            improvement_areas=[
                area.strip() for area in (payload.improvement_areas or []) if area and area.strip()
            ],
            ai_metadata={},
            source="legacy_progress",
        )
        db.add(attempt)
        db.flush()
        _queue_assessment_report_from_attempt(db, current_user, module, attempt)

    _sync_module_progress_from_attempts(
        db,
        current_user,
        module,
        progress,
        mark_completed=payload.mark_completed,
    )

    db.commit()
    db.refresh(progress)
    return _module_payload(module, progress, current_user=current_user)

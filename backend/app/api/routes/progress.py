from math import ceil

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_student_user, get_current_teacher
from app.db.session import get_db
from app.models.module import Module
from app.models.progress import UserModuleProgress
from app.models.user import User
from app.schemas.progress import (
    ProgressSummaryOut,
    TeacherProgressLearnerStatOut,
    TeacherProgressModuleStatOut,
    TeacherProgressOverviewOut,
    TeacherProgressPaginationOut,
)

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/summary", response_model=ProgressSummaryOut)
def progress_summary(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_student_user)
) -> ProgressSummaryOut:
    total_modules = db.query(Module).filter(Module.is_published.is_(True)).count()
    progress_entries = (
        db.query(UserModuleProgress)
        .filter(UserModuleProgress.user_id == current_user.id)
        .all()
    )
    completed_modules = len([item for item in progress_entries if item.status == "completed"])

    if total_modules == 0:
        overall = 0.0
    else:
        summed_progress = sum(item.progress_percent for item in progress_entries)
        overall = round(summed_progress / total_modules, 2)

    return ProgressSummaryOut(
        completed_modules=completed_modules,
        total_modules=total_modules,
        overall_progress_percent=overall,
    )


@router.get("/teacher/overview", response_model=TeacherProgressOverviewOut)
def teacher_progress_overview(
    include_module_breakdown: bool = False,
    include_learner_breakdown: bool = False,
    learner_search: str | None = None,
    active_only: bool = False,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> TeacherProgressOverviewOut:
    total_modules = db.query(Module).filter(Module.is_published.is_(True)).count()
    learners_query = db.query(User).filter(User.role == "student")
    if learner_search:
        learners_query = learners_query.filter(User.username.ilike(f"%{learner_search.strip()}%"))
    learners = learners_query.order_by(User.username.asc()).all()

    learner_ids = [learner.id for learner in learners]
    progress_entries: list[UserModuleProgress] = []
    if learner_ids:
        progress_entries = (
            db.query(UserModuleProgress).filter(UserModuleProgress.user_id.in_(learner_ids)).all()
        )

    progress_by_user: dict[int, list[UserModuleProgress]] = {}
    for item in progress_entries:
        progress_by_user.setdefault(item.user_id, []).append(item)

    learner_stats: list[TeacherProgressLearnerStatOut] = []
    for learner in learners:
        user_entries = progress_by_user.get(learner.id, [])
        completed_modules = len([item for item in user_entries if item.status == "completed"])
        summed_progress = sum(item.progress_percent for item in user_entries)
        overall_progress = round(summed_progress / total_modules, 2) if total_modules else 0.0
        completion_percent = round((completed_modules / total_modules) * 100, 2) if total_modules else 0.0
        is_active = any(item.progress_percent > 0 or item.status != "locked" for item in user_entries)
        learner_stats.append(
            TeacherProgressLearnerStatOut(
                learner_id=learner.id,
                learner_username=learner.username,
                completed_modules=completed_modules,
                total_modules=total_modules,
                completion_percent=completion_percent,
                overall_progress_percent=overall_progress,
                is_active=is_active,
            )
        )

    if active_only:
        learner_stats = [item for item in learner_stats if item.is_active]

    total_learners = len(learner_stats)
    active_learners = len([item for item in learner_stats if item.is_active])
    average_progress_percent = (
        round(sum(item.overall_progress_percent for item in learner_stats) / total_learners, 2)
        if total_learners
        else 0.0
    )
    completed_modules_percent = (
        round(sum(item.completion_percent for item in learner_stats) / total_learners, 2)
        if total_learners
        else 0.0
    )

    modules_payload: list[TeacherProgressModuleStatOut] | None = None
    if include_module_breakdown:
        modules_payload = []
        modules = (
            db.query(Module)
            .filter(Module.is_published.is_(True))
            .order_by(Module.order_index.asc())
            .all()
        )
        progress_by_module: dict[int, list[UserModuleProgress]] = {}
        for item in progress_entries:
            progress_by_module.setdefault(item.module_id, []).append(item)

        for module in modules:
            module_entries = progress_by_module.get(module.id, [])
            learners_started = len([item for item in module_entries if item.progress_percent > 0])
            learners_completed = len([item for item in module_entries if item.status == "completed"])
            completion_percent = (
                round((learners_completed / total_learners) * 100, 2) if total_learners else 0.0
            )
            average_module_progress = (
                round(sum(item.progress_percent for item in module_entries) / total_learners, 2)
                if total_learners
                else 0.0
            )
            modules_payload.append(
                TeacherProgressModuleStatOut(
                    module_id=module.id,
                    module_slug=module.slug,
                    module_title=module.title,
                    learners_started=learners_started,
                    learners_completed=learners_completed,
                    completion_percent=completion_percent,
                    average_progress_percent=average_module_progress,
                )
            )

    learners_payload: list[TeacherProgressLearnerStatOut] | None = None
    learners_pagination_payload: TeacherProgressPaginationOut | None = None
    if include_learner_breakdown:
        total_items = len(learner_stats)
        total_pages = ceil(total_items / page_size) if total_items else 0
        start = (page - 1) * page_size
        end = start + page_size
        learners_payload = learner_stats[start:end]
        learners_pagination_payload = TeacherProgressPaginationOut(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        )

    return TeacherProgressOverviewOut(
        completed_modules_percent=completed_modules_percent,
        average_progress_percent=average_progress_percent,
        active_learners=active_learners,
        total_learners=total_learners,
        modules=modules_payload,
        learners=learners_payload,
        learners_pagination=learners_pagination_payload,
    )

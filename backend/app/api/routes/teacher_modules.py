from __future__ import annotations

from statistics import mean

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_teacher
from app.db.session import get_db
from app.models.module import Module
from app.models.progress import UserModuleProgress
from app.models.user import User
from app.schemas.teacher import (
    TeacherAssessmentDistributionBucket,
    TeacherAssessmentMetrics,
    TeacherModuleCatalogItem,
    TeacherModuleRosterSummary,
    TeacherStudentModuleProgress,
    TeacherStudentProgressList,
)

router = APIRouter(prefix="/teacher/modules", tags=["teacher-modules"])
PLACEHOLDER_MODULE_RANGE = range(9, 13)


def _get_published_module_or_404(db: Session, module_id: int) -> Module:
    module = db.query(Module).filter(Module.id == module_id, Module.is_published.is_(True)).first()
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    return module


def _to_teacher_module_payload(module: Module) -> TeacherModuleCatalogItem:
    return TeacherModuleCatalogItem(
        id=module.id,
        slug=module.slug,
        title=module.title,
        description=module.description,
        order_index=module.order_index,
        lessons=module.lessons,
        is_placeholder=False,
    )


def _build_placeholder_module(order_index: int) -> TeacherModuleCatalogItem:
    return TeacherModuleCatalogItem(
        id=order_index,
        slug=f"module-{order_index}-coming-soon",
        title=f"Module {order_index}",
        description=(
            "Coming Soon. This teacher lesson view will unlock after the module content is "
            "published."
        ),
        order_index=order_index,
        lessons=[],
        is_placeholder=True,
    )


def _student_progress_rows(db: Session, module_id: int) -> list[tuple[UserModuleProgress, User]]:
    return (
        db.query(UserModuleProgress, User)
        .join(User, User.id == UserModuleProgress.user_id)
        .filter(
            UserModuleProgress.module_id == module_id,
            User.role == "student",
        )
        .order_by(User.username.asc())
        .all()
    )


@router.get("/catalog", response_model=list[TeacherModuleCatalogItem])
def get_teacher_module_catalog(
    db: Session = Depends(get_db), _: User = Depends(get_current_teacher)
) -> list[TeacherModuleCatalogItem]:
    modules = (
        db.query(Module).filter(Module.is_published.is_(True)).order_by(Module.order_index.asc()).all()
    )
    payload = [_to_teacher_module_payload(module) for module in modules if module.order_index <= 12]

    existing_order_indices = {item.order_index for item in payload}
    for order_index in PLACEHOLDER_MODULE_RANGE:
        if order_index in existing_order_indices:
            continue
        payload.append(_build_placeholder_module(order_index))

    return sorted(payload, key=lambda item: item.order_index)


@router.get("/{module_id}", response_model=TeacherModuleCatalogItem)
def get_teacher_module_detail(
    module_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> TeacherModuleCatalogItem:
    module = db.query(Module).filter(Module.id == module_id, Module.is_published.is_(True)).first()
    if module:
        return _to_teacher_module_payload(module)

    if module_id in PLACEHOLDER_MODULE_RANGE:
        return _build_placeholder_module(module_id)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")


@router.get("/roster-summary", response_model=list[TeacherModuleRosterSummary])
def get_module_roster_summary(
    db: Session = Depends(get_db), _: User = Depends(get_current_teacher)
) -> list[TeacherModuleRosterSummary]:
    modules = (
        db.query(Module).filter(Module.is_published.is_(True)).order_by(Module.order_index.asc()).all()
    )

    summaries: list[TeacherModuleRosterSummary] = []
    for module in modules:
        rows = _student_progress_rows(db, module.id)
        progresses = [row[0] for row in rows]
        total_students = len(progresses)
        completed_students = sum(1 for item in progresses if item.status == "completed")
        in_progress_students = sum(1 for item in progresses if item.status != "completed")
        avg_progress = mean([item.progress_percent for item in progresses]) if progresses else 0.0
        scored = [item.assessment_score for item in progresses if item.assessment_score is not None]
        avg_assessment = mean(scored) if scored else None

        summaries.append(
            TeacherModuleRosterSummary(
                module_id=module.id,
                module_slug=module.slug,
                module_title=module.title,
                total_students=total_students,
                in_progress_students=in_progress_students,
                completed_students=completed_students,
                completion_rate_percent=(completed_students / total_students * 100)
                if total_students
                else 0.0,
                average_progress_percent=avg_progress,
                average_assessment_score=avg_assessment,
            )
        )

    return summaries


@router.get("/{module_id}/students", response_model=TeacherStudentProgressList)
def get_module_student_progress(
    module_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> TeacherStudentProgressList:
    module = _get_published_module_or_404(db, module_id)
    rows = _student_progress_rows(db, module_id)

    students = [
        TeacherStudentModuleProgress(
            user_id=user.id,
            username=user.username,
            status=progress.status,
            progress_percent=progress.progress_percent,
            completed_lessons_count=len(progress.completed_lessons or []),
            assessment_score=progress.assessment_score,
            updated_at=progress.updated_at,
        )
        for progress, user in rows
    ]

    return TeacherStudentProgressList(
        module_id=module.id,
        module_slug=module.slug,
        module_title=module.title,
        students=students,
    )


@router.get("/{module_id}/assessment-metrics", response_model=TeacherAssessmentMetrics)
def get_module_assessment_metrics(
    module_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_teacher),
) -> TeacherAssessmentMetrics:
    module = _get_published_module_or_404(db, module_id)
    rows = _student_progress_rows(db, module_id)
    scores = [progress.assessment_score for progress, _ in rows if progress.assessment_score is not None]

    distribution_ranges = [
        ("0-49", 0, 49.9999),
        ("50-69", 50, 69.9999),
        ("70-84", 70, 84.9999),
        ("85-100", 85, 100),
    ]
    distribution: list[TeacherAssessmentDistributionBucket] = []
    for label, low, high in distribution_ranges:
        count = sum(1 for score in scores if low <= score <= high)
        distribution.append(TeacherAssessmentDistributionBucket(label=label, count=count))

    passing_score = 75.0
    passing_count = sum(1 for score in scores if score >= passing_score)

    return TeacherAssessmentMetrics(
        module_id=module.id,
        module_slug=module.slug,
        module_title=module.title,
        total_students_with_scores=len(scores),
        average_score=mean(scores) if scores else None,
        min_score=min(scores) if scores else None,
        max_score=max(scores) if scores else None,
        passing_score_threshold=passing_score,
        passing_count=passing_count,
        passing_rate_percent=(passing_count / len(scores) * 100) if scores else 0.0,
        distribution=distribution,
    )

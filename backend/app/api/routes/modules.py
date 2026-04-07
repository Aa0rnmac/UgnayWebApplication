from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_student_user
from app.db.session import get_db
from app.models.module import Module
from app.models.progress import UserModuleProgress
from app.models.user import User
from app.schemas.module import ModuleOut
from app.schemas.progress import ProgressUpdateRequest

router = APIRouter(prefix="/modules", tags=["modules"])


def _module_payload(module: Module, progress: UserModuleProgress | None) -> ModuleOut:
    status_value = "in_progress"
    progress_percent = 0
    assessment_score = None

    if progress:
        assessment_score = progress.assessment_score
        if progress.status == "completed":
            status_value = "completed"
            progress_percent = 100
        else:
            status_value = "in_progress"
            progress_percent = progress.progress_percent

    return ModuleOut(
        id=module.id,
        slug=module.slug,
        title=module.title,
        description=module.description,
        order_index=module.order_index,
        lessons=module.lessons,
        assessments=module.assessments,
        is_locked=False,
        status=status_value,
        progress_percent=progress_percent,
        assessment_score=assessment_score,
    )


def _build_modules_for_user(db: Session, user_id: int) -> list[ModuleOut]:
    modules = (
        db.query(Module).filter(Module.is_published.is_(True)).order_by(Module.order_index.asc()).all()
    )
    progress_entries = (
        db.query(UserModuleProgress).filter(UserModuleProgress.user_id == user_id).all()
    )
    progress_by_module = {item.module_id: item for item in progress_entries}

    result: list[ModuleOut] = []
    for module in modules:
        progress = progress_by_module.get(module.id)
        result.append(_module_payload(module, progress))
    return result


def _get_module_and_progress(
    db: Session, user_id: int, module_id: int
) -> tuple[Module, UserModuleProgress | None]:
    module = db.query(Module).filter(Module.id == module_id, Module.is_published.is_(True)).first()
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")

    progress = (
        db.query(UserModuleProgress)
        .filter(UserModuleProgress.user_id == user_id, UserModuleProgress.module_id == module_id)
        .first()
    )
    return module, progress


@router.get("", response_model=list[ModuleOut])
def list_modules(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_student_user)
) -> list[ModuleOut]:
    return _build_modules_for_user(db, current_user.id)


@router.get("/{module_id}", response_model=ModuleOut)
def get_module(
    module_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_student_user),
) -> ModuleOut:
    module, progress = _get_module_and_progress(db, current_user.id, module_id)
    return _module_payload(module, progress)


@router.post("/{module_id}/progress", response_model=ModuleOut)
def update_module_progress(
    module_id: int,
    payload: ProgressUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_student_user),
) -> ModuleOut:
    module, progress = _get_module_and_progress(db, current_user.id, module_id)

    if not progress:
        progress = UserModuleProgress(
            user_id=current_user.id,
            module_id=module_id,
            status="in_progress",
            progress_percent=0,
            completed_lessons=[],
        )
        db.add(progress)
        db.flush()

    completed_lessons = list(progress.completed_lessons or [])
    if payload.completed_lesson_id and payload.completed_lesson_id not in completed_lessons:
        completed_lessons.append(payload.completed_lesson_id)
    progress.completed_lessons = completed_lessons

    total_lessons = max(1, len(module.lessons))
    learned = min(len(completed_lessons), total_lessons)
    progress.progress_percent = int((learned / total_lessons) * 100)

    if payload.assessment_score is not None:
        progress.assessment_score = payload.assessment_score

    if payload.mark_completed or progress.progress_percent >= 100:
        progress.status = "completed"
        progress.progress_percent = 100
    else:
        progress.status = "in_progress"

    db.add(progress)
    db.commit()
    db.refresh(progress)

    return _module_payload(module, progress)

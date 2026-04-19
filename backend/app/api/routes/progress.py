from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_learning_user, has_teacher_access
from app.db.session import get_db
from app.models.module import Module
from app.models.progress import UserModuleProgress
from app.models.user import User
from app.schemas.progress import ProgressSummaryOut

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/summary", response_model=ProgressSummaryOut)
def progress_summary(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_learning_user)
) -> ProgressSummaryOut:
    module_query = db.query(Module)
    if not has_teacher_access(current_user):
        module_query = module_query.filter(Module.is_published.is_(True))
    total_modules = module_query.count()
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


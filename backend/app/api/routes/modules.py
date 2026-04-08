import base64
import binascii
import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_student_user
from app.db.session import get_db
from app.models.assessment_attempt import UserAssessmentAttempt
from app.models.module import Module
from app.models.progress import UserModuleProgress
from app.models.user import User
from app.schemas.module import ModuleOut
from app.schemas.progress import AssessmentAttemptCreateRequest, AssessmentAttemptOut, ProgressUpdateRequest

router = APIRouter(prefix="/modules", tags=["modules"])

SNAPSHOT_UPLOADS_DIR = (
    Path(__file__).resolve().parents[3] / "uploads" / "assessment_snapshots"
).resolve()
SNAPSHOT_DATA_URL_PATTERN = re.compile(
    r"^data:image/(?P<extension>png|jpeg|jpg|webp);base64,(?P<payload>.+)$",
    re.IGNORECASE,
)
MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024


def _serialize_attempt(attempt: UserAssessmentAttempt | None) -> AssessmentAttemptOut | None:
    if not attempt:
        return None

    return AssessmentAttemptOut(
        id=attempt.id,
        user_id=attempt.user_id,
        module_id=attempt.module_id,
        assessment_id=attempt.assessment_id,
        assessment_title=attempt.assessment_title,
        assessment_type=attempt.assessment_type,
        score_percent=attempt.score_percent,
        score_correct=attempt.score_correct,
        score_total=attempt.score_total,
        answers=attempt.answers or [],
        snapshots=attempt.snapshots or [],
        submitted_at=attempt.submitted_at,
    )


def _module_payload(
    module: Module,
    progress: UserModuleProgress | None,
    latest_attempt: UserAssessmentAttempt | None = None,
) -> ModuleOut:
    status_value = "in_progress"
    progress_percent = 0
    assessment_score = None
    completed_lessons: list[str] = []

    if progress:
        assessment_score = progress.assessment_score
        completed_lessons = list(progress.completed_lessons or [])
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
        completed_lessons=completed_lessons,
        assessment_score=assessment_score,
        latest_assessment_attempt=_serialize_attempt(latest_attempt),
    )


def _latest_attempt_by_module(db: Session, user_id: int) -> dict[int, UserAssessmentAttempt]:
    attempts = (
        db.query(UserAssessmentAttempt)
        .filter(UserAssessmentAttempt.user_id == user_id)
        .order_by(
            UserAssessmentAttempt.module_id.asc(),
            UserAssessmentAttempt.submitted_at.desc(),
            UserAssessmentAttempt.id.desc(),
        )
        .all()
    )

    latest: dict[int, UserAssessmentAttempt] = {}
    for attempt in attempts:
        if attempt.module_id not in latest:
            latest[attempt.module_id] = attempt
    return latest


def _get_latest_attempt_for_module(
    db: Session, user_id: int, module_id: int
) -> UserAssessmentAttempt | None:
    return (
        db.query(UserAssessmentAttempt)
        .filter(
            UserAssessmentAttempt.user_id == user_id,
            UserAssessmentAttempt.module_id == module_id,
        )
        .order_by(UserAssessmentAttempt.submitted_at.desc(), UserAssessmentAttempt.id.desc())
        .first()
    )


def _decode_snapshot_data_url(data_url: str) -> tuple[str, bytes]:
    match = SNAPSHOT_DATA_URL_PATTERN.match(data_url.strip())
    if not match:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Snapshot must be a valid PNG, JPG, JPEG, or WEBP data URL.",
        )

    extension = match.group("extension").lower()
    normalized_extension = "jpg" if extension == "jpeg" else extension
    try:
        content = base64.b64decode(match.group("payload"), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Snapshot image data could not be decoded.",
        ) from exc

    if len(content) > MAX_SNAPSHOT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Snapshot image is too large. Max size is 4MB.",
        )

    return normalized_extension, content


def _save_snapshot_image(*, user_id: int, module_id: int, data_url: str) -> str:
    extension, content = _decode_snapshot_data_url(data_url)
    SNAPSHOT_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"user-{user_id}-module-{module_id}-{uuid4().hex}.{extension}"
    destination = SNAPSHOT_UPLOADS_DIR / filename
    destination.write_bytes(content)
    return f"uploads/assessment_snapshots/{filename}"


def _build_modules_for_user(db: Session, user_id: int) -> list[ModuleOut]:
    modules = (
        db.query(Module).filter(Module.is_published.is_(True)).order_by(Module.order_index.asc()).all()
    )
    progress_entries = (
        db.query(UserModuleProgress).filter(UserModuleProgress.user_id == user_id).all()
    )
    progress_by_module = {item.module_id: item for item in progress_entries}
    latest_attempts = _latest_attempt_by_module(db, user_id)

    result: list[ModuleOut] = []
    for module in modules:
        progress = progress_by_module.get(module.id)
        latest_attempt = latest_attempts.get(module.id)
        result.append(_module_payload(module, progress, latest_attempt))
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
    latest_attempt = _get_latest_attempt_for_module(db, current_user.id, module_id)
    return _module_payload(module, progress, latest_attempt)


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

    latest_attempt = _get_latest_attempt_for_module(db, current_user.id, module_id)
    return _module_payload(module, progress, latest_attempt)


@router.post("/{module_id}/assessment-attempts", response_model=AssessmentAttemptOut)
def submit_assessment_attempt(
    module_id: int,
    payload: AssessmentAttemptCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_student_user),
) -> AssessmentAttemptOut:
    module, _ = _get_module_and_progress(db, current_user.id, module_id)

    if payload.score_correct > payload.score_total:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Correct score count cannot be greater than total score count.",
        )

    saved_snapshots = [
        {
            "assessment_item_id": snapshot.assessment_item_id,
            "label": snapshot.label,
            "image_path": _save_snapshot_image(
                user_id=current_user.id,
                module_id=module.id,
                data_url=snapshot.image_data_url,
            ),
        }
        for snapshot in payload.snapshots
    ]

    attempt = UserAssessmentAttempt(
        user_id=current_user.id,
        module_id=module.id,
        assessment_id=payload.assessment_id,
        assessment_title=payload.assessment_title,
        assessment_type=payload.assessment_type,
        score_percent=payload.score_percent,
        score_correct=payload.score_correct,
        score_total=payload.score_total,
        answers=[item.model_dump() for item in payload.answers],
        snapshots=saved_snapshots,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return _serialize_attempt(attempt)

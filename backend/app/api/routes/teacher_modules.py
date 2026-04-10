from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import re
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import get_current_teacher
from app.core.config import PROJECT_ROOT
from app.core.datetime_utils import utc_now
from app.db.session import get_db
from app.models.batch import Batch
from app.models.enrollment import Enrollment
from app.models.module import Module
from app.models.module_activity import ModuleActivity
from app.models.teacher_handling_session import TeacherHandlingSession
from app.models.teacher_presence import TeacherPresence
from app.models.user import User
from app.schemas.teacher import (
    TeacherBatchOut,
    TeacherHandlingSessionCreateRequest,
    TeacherHandlingSessionOut,
    TeacherModuleCardOut,
    TeacherModuleCreateRequest,
    TeacherModulesCatalogOut,
    TeacherModuleUpdateRequest,
    TeacherPresenceOut,
    TeacherPresenceUpdateRequest,
    TeacherUserSummary,
)
from app.services.teacher_context import approved_enrollment_for_student
from app.services.teacher_scope import teacher_has_global_access, teacher_owns_batch

router = APIRouter(prefix="/teacher", tags=["teacher-modules"])

MODULE_COVERS_DIR = (PROJECT_ROOT / "backend" / "uploads" / "module-covers").resolve()
VALID_COVER_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


def _full_name(user: User) -> str:
    full_name = " ".join(
        part.strip()
        for part in [user.first_name or "", user.middle_name or "", user.last_name or ""]
        if part and part.strip()
    ).strip()
    return full_name or user.username


def _teacher_summary(user: User | None) -> TeacherUserSummary | None:
    if user is None:
        return None
    return TeacherUserSummary(
        id=user.id,
        username=user.username,
        full_name=_full_name(user),
        email=user.email,
    )


def _batch_student_count(batch: Batch | None) -> int:
    if batch is None:
        return 0
    return sum(
        1
        for enrollment in batch.enrollments
        if enrollment.status == "approved"
        and enrollment.user is not None
        and enrollment.user.archived_at is None
    )


def _batch_out(batch: Batch | None) -> TeacherBatchOut | None:
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
        student_count=_batch_student_count(batch),
        primary_teacher=_teacher_summary(batch.primary_teacher),
        created_at=batch.created_at,
    )


def _module_card_out(module: Module) -> TeacherModuleCardOut:
    source_title = module.source_module.title if module.source_module is not None else None
    return TeacherModuleCardOut(
        id=module.id,
        slug=module.slug,
        title=module.title,
        description=module.description,
        order_index=module.order_index,
        module_kind=module.module_kind,
        is_published=module.is_published,
        is_shared_pool=module.is_shared_pool,
        source_module_id=module.source_module_id,
        source_module_title=source_title,
        cover_image_url=module.cover_image_path,
        archived_at=module.archived_at,
        owner_teacher=_teacher_summary(module.owner_teacher),
        lesson_count=len(module.lessons or []),
        activity_count=len(module.activities or []),
    )


def _managed_student_count(db: Session, *, current_teacher: User) -> int:
    rows = (
        db.query(Enrollment)
        .options(joinedload(Enrollment.batch), joinedload(Enrollment.user))
        .join(User, User.id == Enrollment.user_id)
        .filter(Enrollment.status == "approved")
        .filter(User.archived_at.is_(None))
        .order_by(Enrollment.approved_at.desc(), Enrollment.id.desc())
        .all()
    )

    seen_student_ids: set[int] = set()
    count = 0
    for enrollment in rows:
        if enrollment.user_id is None or enrollment.user is None or enrollment.user.role != "student":
            continue
        if enrollment.user_id in seen_student_ids:
            continue
        if enrollment.batch is None or enrollment.batch.status == "archived":
            continue
        if not teacher_has_global_access(current_teacher) and not teacher_owns_batch(
            current_teacher, enrollment.batch
        ):
            continue
        seen_student_ids.add(enrollment.user_id)
        count += 1
    return count


def _session_out(session: TeacherHandlingSession | None) -> TeacherHandlingSessionOut | None:
    if session is None:
        return None
    return TeacherHandlingSessionOut(
        id=session.id,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
        teacher=_teacher_summary(session.teacher),
        batch=_batch_out(session.batch),
        student=_teacher_summary(session.student),
    )


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    normalized = normalized.strip("-")
    return normalized or "module"


def _unique_module_slug(db: Session, *, base: str) -> str:
    slug = _slugify(base)
    candidate = slug
    counter = 2
    while db.query(Module).filter(Module.slug == candidate).first() is not None:
        candidate = f"{slug}-{counter}"
        counter += 1
    return candidate


def _clone_module_activities(db: Session, *, source: Module, target: Module) -> None:
    for activity in sorted(list(source.activities or []), key=lambda item: item.order_index):
        db.add(
            ModuleActivity(
                module_id=target.id,
                activity_key=activity.activity_key,
                title=activity.title,
                activity_type=activity.activity_type,
                order_index=activity.order_index,
                instructions=activity.instructions,
                definition=deepcopy(activity.definition or {}),
                is_published=activity.is_published,
            )
        )


def _next_teacher_module_order(db: Session, teacher_id: int) -> int:
    latest = (
        db.query(Module)
        .filter(Module.owner_teacher_id == teacher_id, Module.module_kind == "teacher_custom")
        .order_by(Module.order_index.desc(), Module.id.desc())
        .first()
    )
    if latest is not None:
        return latest.order_index + 1
    baseline = db.query(Module).order_by(Module.order_index.desc(), Module.id.desc()).first()
    return (baseline.order_index if baseline is not None else 0) + 1


def _get_teacher_module_or_404(
    db: Session,
    *,
    module_id: int,
    current_teacher: User,
    allow_shared_copy_source: bool = False,
) -> Module:
    module = (
        db.query(Module)
        .options(selectinload(Module.activities), joinedload(Module.owner_teacher), joinedload(Module.source_module))
        .filter(Module.id == module_id)
        .first()
    )
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")

    if module.module_kind == "system":
        return module

    if teacher_has_global_access(current_teacher):
        return module

    if module.owner_teacher_id == current_teacher.id:
        return module

    if allow_shared_copy_source and module.is_shared_pool and module.archived_at is None and module.is_published:
        return module

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")


def _get_owned_custom_module_or_404(db: Session, module_id: int, current_teacher: User) -> Module:
    module = (
        db.query(Module)
        .options(selectinload(Module.activities), joinedload(Module.owner_teacher), joinedload(Module.source_module))
        .filter(
            Module.id == module_id,
            Module.module_kind == "teacher_custom",
        )
        .first()
    )
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    if not teacher_has_global_access(current_teacher) and module.owner_teacher_id != current_teacher.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    return module


def _get_batch_or_404(db: Session, batch_id: int) -> Batch:
    batch = (
        db.query(Batch)
        .options(joinedload(Batch.primary_teacher), selectinload(Batch.enrollments))
        .filter(Batch.id == batch_id)
        .first()
    )
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")
    return batch


def _get_teacher_presence(db: Session, current_teacher: User) -> TeacherPresence:
    presence = (
        db.query(TeacherPresence)
        .options(joinedload(TeacherPresence.teacher))
        .filter(TeacherPresence.teacher_id == current_teacher.id)
        .first()
    )
    if presence is None:
        presence = TeacherPresence(teacher_id=current_teacher.id, status="offline")
        db.add(presence)
        db.commit()
        db.refresh(presence)
    return presence


def _active_teacher_session(db: Session, teacher_id: int) -> TeacherHandlingSession | None:
    return (
        db.query(TeacherHandlingSession)
        .options(
            joinedload(TeacherHandlingSession.teacher),
            joinedload(TeacherHandlingSession.batch).joinedload(Batch.primary_teacher),
            joinedload(TeacherHandlingSession.student),
        )
        .filter(
            TeacherHandlingSession.teacher_id == teacher_id,
            TeacherHandlingSession.status == "active",
            TeacherHandlingSession.ended_at.is_(None),
        )
        .order_by(TeacherHandlingSession.started_at.desc(), TeacherHandlingSession.id.desc())
        .first()
    )


@router.get("/modules", response_model=TeacherModulesCatalogOut)
def get_teacher_modules_catalog(
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherModulesCatalogOut:
    managed_student_count = _managed_student_count(db, current_teacher=current_teacher)
    module_query = (
        db.query(Module)
        .options(selectinload(Module.activities), joinedload(Module.owner_teacher), joinedload(Module.source_module))
        .order_by(Module.order_index.asc(), Module.id.asc())
    )
    if not teacher_has_global_access(current_teacher):
        module_query = module_query.filter(
            Module.archived_at.is_(None) | (Module.owner_teacher_id == current_teacher.id)
        )
    modules = module_query.all()

    if teacher_has_global_access(current_teacher):
        my_modules = [
            _module_card_out(module)
            for module in modules
            if module.module_kind == "teacher_custom"
        ]
    else:
        my_modules = [
            _module_card_out(module)
            for module in modules
            if module.module_kind == "teacher_custom" and module.owner_teacher_id == current_teacher.id
        ]
    shared_pool = [
        _module_card_out(module)
        for module in modules
        if module.module_kind == "teacher_custom"
        and module.owner_teacher_id != current_teacher.id
        and module.archived_at is None
        and module.is_shared_pool
        and module.is_published
    ]
    system_templates = [
        _module_card_out(module)
        for module in modules
        if module.module_kind == "system" and module.archived_at is None
    ]

    return TeacherModulesCatalogOut(
        managed_student_count=managed_student_count,
        my_modules=my_modules,
        shared_pool=shared_pool,
        system_templates=system_templates,
    )


@router.post("/modules", response_model=TeacherModuleCardOut, status_code=status.HTTP_201_CREATED)
def create_teacher_module(
    payload: TeacherModuleCreateRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherModuleCardOut:
    module = Module(
        slug=_unique_module_slug(db, base=f"{payload.title}-{current_teacher.username}"),
        title=payload.title.strip(),
        description=payload.description.strip(),
        order_index=_next_teacher_module_order(db, current_teacher.id),
        lessons=[],
        assessments=[],
        module_kind="teacher_custom",
        owner_teacher_id=current_teacher.id,
        source_module_id=None,
        is_shared_pool=False,
        is_published=False,
        archived_at=None,
    )
    db.add(module)
    db.commit()
    db.refresh(module)
    return _module_card_out(module)


@router.patch("/modules/{module_id}", response_model=TeacherModuleCardOut)
def update_teacher_module(
    module_id: int,
    payload: TeacherModuleUpdateRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherModuleCardOut:
    module = _get_owned_custom_module_or_404(db, module_id, current_teacher)
    if payload.title is not None:
        module.title = payload.title.strip()
    if payload.description is not None:
        module.description = payload.description.strip()
    if payload.is_published is not None:
        module.is_published = payload.is_published
        if not module.is_published:
            module.is_shared_pool = False
    if payload.is_shared_pool is not None:
        module.is_shared_pool = payload.is_shared_pool and module.is_published
        if payload.is_shared_pool and not module.is_published:
            module.is_published = True
            module.is_shared_pool = True
    db.add(module)
    db.commit()
    db.refresh(module)
    return _module_card_out(module)


@router.post("/modules/{module_id}/copy", response_model=TeacherModuleCardOut, status_code=status.HTTP_201_CREATED)
def copy_teacher_module(
    module_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherModuleCardOut:
    source = _get_teacher_module_or_404(
        db,
        module_id=module_id,
        current_teacher=current_teacher,
        allow_shared_copy_source=True,
    )
    title = f"{source.title} (Copy)"
    copied = Module(
        slug=_unique_module_slug(db, base=f"{title}-{current_teacher.username}"),
        title=title,
        description=source.description,
        order_index=source.order_index or _next_teacher_module_order(db, current_teacher.id),
        lessons=deepcopy(source.lessons or []),
        assessments=deepcopy(source.assessments or []),
        module_kind="teacher_custom",
        owner_teacher_id=current_teacher.id,
        source_module_id=source.id,
        is_shared_pool=False,
        cover_image_path=source.cover_image_path,
        is_published=False,
        archived_at=None,
    )
    db.add(copied)
    db.flush()
    _clone_module_activities(db, source=source, target=copied)
    db.commit()
    db.refresh(copied)
    return _module_card_out(copied)


@router.post("/modules/{module_id}/archive", response_model=TeacherModuleCardOut)
def archive_teacher_module(
    module_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherModuleCardOut:
    module = _get_owned_custom_module_or_404(db, module_id, current_teacher)
    if module.archived_at is None:
        module.archived_at = utc_now()
        module.is_published = False
        module.is_shared_pool = False
        db.add(module)
        db.commit()
        db.refresh(module)
    return _module_card_out(module)


@router.post("/modules/{module_id}/restore", response_model=TeacherModuleCardOut)
def restore_teacher_module(
    module_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherModuleCardOut:
    module = _get_owned_custom_module_or_404(db, module_id, current_teacher)
    if module.archived_at is not None:
        module.archived_at = None
        module.is_published = False
        module.is_shared_pool = False
        db.add(module)
        db.commit()
        db.refresh(module)
    return _module_card_out(module)


@router.post("/modules/{module_id}/cover", response_model=TeacherModuleCardOut)
def upload_teacher_module_cover(
    module_id: int,
    cover_image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherModuleCardOut:
    module = _get_owned_custom_module_or_404(db, module_id, current_teacher)
    suffix = Path(cover_image.filename or "").suffix.lower()
    if suffix not in VALID_COVER_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cover image must be a PNG, JPG, JPEG, or WEBP file.",
        )

    MODULE_COVERS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{module.id}-{uuid4().hex}{suffix}"
    destination = MODULE_COVERS_DIR / filename
    content = cover_image.file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded cover image is empty.")
    destination.write_bytes(content)

    module.cover_image_path = f"uploads/module-covers/{filename}"
    db.add(module)
    db.commit()
    db.refresh(module)
    return _module_card_out(module)


@router.get("/presence", response_model=TeacherPresenceOut)
def get_teacher_presence(
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherPresenceOut:
    presence = _get_teacher_presence(db, current_teacher)
    return TeacherPresenceOut(
        teacher=_teacher_summary(current_teacher),
        status=presence.status,
        updated_at=presence.updated_at,
    )


@router.post("/presence", response_model=TeacherPresenceOut)
def update_teacher_presence(
    payload: TeacherPresenceUpdateRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherPresenceOut:
    presence = _get_teacher_presence(db, current_teacher)
    active_session = _active_teacher_session(db, current_teacher.id)
    if payload.status == "offline" and active_session is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="End the active handling session before switching offline.",
        )

    presence.status = payload.status
    db.add(presence)
    db.commit()
    db.refresh(presence)
    return TeacherPresenceOut(
        teacher=_teacher_summary(current_teacher),
        status=presence.status,
        updated_at=presence.updated_at,
    )


@router.get("/sessions/active", response_model=TeacherHandlingSessionOut | None)
def get_active_teacher_handling_session(
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherHandlingSessionOut | None:
    return _session_out(_active_teacher_session(db, current_teacher.id))


@router.post("/sessions", response_model=TeacherHandlingSessionOut, status_code=status.HTTP_201_CREATED)
def start_teacher_handling_session(
    payload: TeacherHandlingSessionCreateRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherHandlingSessionOut:
    if payload.batch_id is None and payload.student_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide a batch_id or student_id to start a handling session.",
        )

    presence = _get_teacher_presence(db, current_teacher)
    if presence.status != "online":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Teacher must be online before starting a handling session.",
        )

    if _active_teacher_session(db, current_teacher.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Teacher already has an active handling session.",
        )

    batch = _get_batch_or_404(db, payload.batch_id) if payload.batch_id is not None else None
    student = None
    if payload.student_id is not None:
        student = (
            db.query(User)
            .filter(User.id == payload.student_id, User.role == "student", User.archived_at.is_(None))
            .first()
        )
        if student is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")
        enrollment = approved_enrollment_for_student(db, student.id)
        if enrollment is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Student must have an approved enrollment before starting a handling session.",
            )
        if batch is None:
            batch = enrollment.batch
        elif enrollment.batch_id != batch.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Student is not assigned to the selected batch.",
            )

    session = TeacherHandlingSession(
        teacher_id=current_teacher.id,
        batch_id=batch.id if batch is not None else None,
        student_id=student.id if student is not None else None,
        status="active",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    session = _active_teacher_session(db, current_teacher.id)
    return _session_out(session)


@router.post("/sessions/{session_id}/end", response_model=TeacherHandlingSessionOut)
def end_teacher_handling_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherHandlingSessionOut:
    session = (
        db.query(TeacherHandlingSession)
        .options(
            joinedload(TeacherHandlingSession.teacher),
            joinedload(TeacherHandlingSession.batch).joinedload(Batch.primary_teacher),
            joinedload(TeacherHandlingSession.student),
        )
        .filter(
            TeacherHandlingSession.id == session_id,
            TeacherHandlingSession.teacher_id == current_teacher.id,
        )
        .first()
    )
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Handling session not found.")
    if session.status != "ended" or session.ended_at is None:
        session.status = "ended"
        session.ended_at = utc_now()
        db.add(session)
        db.commit()
        db.refresh(session)
    return _session_out(session)

from datetime import datetime
from pathlib import Path
import re
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_teacher
from app.core.datetime_utils import utc_now
from app.db.session import get_db
from app.models.certificate import CertificateTemplate
from app.models.lms_progress import SectionModuleItemProgress
from app.models.section import Section, SectionStudentAssignment, SectionTeacherAssignment
from app.models.section_module import SectionModule, SectionModuleItem
from app.models.user import User
from app.schemas.lms import (
    CertificateTemplateOut,
    ModuleItemCreateRequest,
    ModuleItemUpdateRequest,
    SectionOut,
    TeacherSectionModuleCreateRequest,
    TeacherSectionModuleOut,
    TeacherSectionModuleUpdateRequest,
    TeacherSectionSummaryOut,
    TeacherStudentAttemptDetailOut,
    TeacherModuleSubmissionOut,
    TeacherSubmissionGradeRequest,
    TeacherStudentItemReportOut,
    TeacherStudentModuleReportOut,
    TeacherStudentReportOut,
    UploadedModuleAssetOut,
)
from app.services.lms_service import (
    RESOURCE_ITEM_TYPES,
    get_teacher_section_ids,
    latest_approved_template,
    section_out,
    sync_module_progress,
    user_display_name,
    user_summary,
)
from app.services.audit_log_service import log_user_activity


router = APIRouter(prefix="/teacher", tags=["teacher-lms"])

CERTIFICATE_TEMPLATES_DIR = (
    Path(__file__).resolve().parents[3] / "uploads" / "certificate-templates"
).resolve()
CERTIFICATE_TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)

MODULE_RESOURCES_DIR = (
    Path(__file__).resolve().parents[3] / "uploads" / "module-resources"
).resolve()
MODULE_RESOURCES_DIR.mkdir(parents=True, exist_ok=True)


def _require_teacher_section(
    db: Session, current_teacher: User, section_id: int
) -> Section:
    section = (
        db.query(Section)
        .options(
            joinedload(Section.teachers).joinedload(SectionTeacherAssignment.teacher),
            joinedload(Section.students).joinedload(SectionStudentAssignment.student),
            joinedload(Section.modules).joinedload(SectionModule.items),
            joinedload(Section.modules).joinedload(SectionModule.created_by_teacher),
        )
        .filter(Section.id == section_id)
        .first()
    )
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")
    return section


def _require_module_owner(db: Session, current_teacher: User, module: SectionModule) -> None:
    if module.created_by_teacher_id is None:
        module.created_by_teacher_id = current_teacher.id
        db.add(module)
        db.flush()
        return
    if module.created_by_teacher_id != current_teacher.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the teacher who created this module can edit it.",
        )


def _module_out(module: SectionModule) -> TeacherSectionModuleOut:
    return TeacherSectionModuleOut(
        id=module.id,
        section_id=module.section_id,
        title=module.title,
        description=module.description,
        order_index=module.order_index,
        created_by_teacher_id=module.created_by_teacher_id,
        instructor_name=user_display_name(module.created_by_teacher),
        is_published=module.is_published,
        items=[
            {
                "id": item.id,
                "title": item.title,
                "item_type": item.item_type,
                "order_index": item.order_index,
                "instructions": item.instructions,
                "content_text": item.content_text,
                "config": dict(item.config or {}),
                "is_required": item.is_required,
                "is_published": item.is_published,
            }
            for item in sorted(module.items, key=lambda row: row.order_index)
        ],
    )


def _resource_kind_for_item_type(item_type: str) -> str:
    if item_type == "video_resource":
        return "video"
    if item_type == "document_resource":
        return "document"
    if item_type == "interactive_resource":
        return "interactive"
    return "external_link"


def _parse_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if number >= 0 else None
    if isinstance(value, str):
        try:
            number = float(value.strip())
        except ValueError:
            return None
        return number if number >= 0 else None
    return None


def _parse_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.lstrip("-").isdigit():
            return int(stripped)
    return None


def _parse_datetime(value: Any) -> datetime | None:
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


def _extract_attempt_details(
    progress_entry: SectionModuleItemProgress | None,
) -> list[TeacherStudentAttemptDetailOut]:
    if progress_entry is None:
        return []

    payload = dict(progress_entry.submitted_payload or {})
    raw_history = payload.get("history")
    parsed_details: list[TeacherStudentAttemptDetailOut] = []

    if isinstance(raw_history, list):
        for index, entry in enumerate(raw_history, start=1):
            if not isinstance(entry, dict):
                continue
            attempt_number = _parse_int(entry.get("attempt")) or index
            raw_status = entry.get("status")
            default_status = "completed" if entry.get("submitted_at") else progress_entry.status
            status_value = (
                str(raw_status).strip()
                if isinstance(raw_status, str) and str(raw_status).strip()
                else default_status
            )
            score = _parse_float(entry.get("score_percent"))
            correct_count = _parse_int(entry.get("correct_count")) or 0
            wrong_count = _parse_int(entry.get("wrong_count")) or 0
            duration_seconds = max(0, _parse_int(entry.get("duration_seconds")) or 0)
            completed_at = _parse_datetime(entry.get("completed_at")) or _parse_datetime(
                entry.get("submitted_at")
            )
            parsed_details.append(
                TeacherStudentAttemptDetailOut(
                    attempt_number=max(1, attempt_number),
                    status=status_value or "completed",
                    score_percent=score,
                    correct_count=max(0, correct_count),
                    wrong_count=max(0, wrong_count),
                    duration_seconds=duration_seconds,
                    completed_at=completed_at,
                )
            )

    if parsed_details:
        parsed_details.sort(key=lambda entry: entry.attempt_number)
        return parsed_details

    fallback_attempt_number = max(progress_entry.attempt_count or 0, 1)
    fallback_correct = 1 if progress_entry.is_correct is True else 0
    fallback_wrong = 1 if progress_entry.is_correct is False else 0
    fallback_status = progress_entry.status or "completed"
    return [
        TeacherStudentAttemptDetailOut(
            attempt_number=fallback_attempt_number,
            status=fallback_status,
            score_percent=progress_entry.score_percent,
            correct_count=fallback_correct,
            wrong_count=fallback_wrong,
            duration_seconds=max(0, progress_entry.duration_seconds or 0),
            completed_at=progress_entry.completed_at,
        )
    ]


def _module_max_points(module_item: SectionModuleItem) -> float:
    config = dict(module_item.config or {})
    value = _parse_float(config.get("max_points"))
    if value is None or value <= 0:
        return 100.0
    return min(value, 1000.0)


def _normalize_rubric_id(value: Any, fallback: str) -> str:
    if isinstance(value, str):
        trimmed = value.strip().lower()
        if trimmed:
            normalized = "".join(char for char in trimmed if char.isalnum() or char in {"-", "_"})
            if normalized:
                return normalized[:120]
    return fallback


def _parse_rubric_items(module_item: SectionModuleItem) -> list[dict[str, Any]]:
    config = dict(module_item.config or {})
    raw_rubric_items = config.get("rubric_items")
    parsed_items: list[dict[str, Any]] = []
    if isinstance(raw_rubric_items, list):
        for index, entry in enumerate(raw_rubric_items, start=1):
            if not isinstance(entry, dict):
                continue
            criterion_raw = entry.get("criterion")
            criterion = criterion_raw.strip() if isinstance(criterion_raw, str) else ""
            if not criterion:
                continue
            weight_value = _parse_float(entry.get("weight_percent"))
            if weight_value is None:
                weight_value = _parse_float(entry.get("weightPercent"))
            weight_percent = max(0.0, min(float(weight_value or 0.0), 100.0))
            fallback_id = f"rubric-{index}"
            rubric_id = _normalize_rubric_id(entry.get("id"), fallback_id)
            parsed_items.append(
                {
                    "id": rubric_id,
                    "criterion": criterion,
                    "weight_percent": round(weight_percent, 2),
                }
            )
    if parsed_items:
        return parsed_items

    rubric_text_raw = config.get("rubric_text")
    rubric_text = rubric_text_raw.strip() if isinstance(rubric_text_raw, str) else ""
    if not rubric_text:
        return []
    lines = [line.strip() for line in rubric_text.splitlines() if line.strip()]
    if not lines:
        return []

    weighted_lines: list[tuple[str, float | None]] = []
    for line in lines:
        match = re.match(r"^(?P<criterion>.+?)\s*\((?P<weight>\d+(?:\.\d+)?)%\)\s*$", line)
        if match:
            criterion = match.group("criterion").strip()
            weight = float(match.group("weight"))
            weighted_lines.append((criterion, weight))
        else:
            weighted_lines.append((line, None))

    fallback_weight = round(100 / len(weighted_lines), 2)
    for index, (criterion, weight) in enumerate(weighted_lines, start=1):
        parsed_items.append(
            {
                "id": f"rubric-{index}",
                "criterion": criterion,
                "weight_percent": round(max(0.0, min(float(weight or fallback_weight), 100.0)), 2),
            }
        )
    return parsed_items


def _student_display_name(student: User) -> str:
    full_name = " ".join(
        part.strip()
        for part in [student.first_name or "", student.last_name or ""]
        if part and part.strip()
    ).strip()
    return full_name or student.username


def _normalize_asset_entry(entry: Any) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    kind = entry.get("resource_kind")
    file_name = entry.get("resource_file_name")
    file_path = entry.get("resource_file_path")
    if kind not in {"video", "image", "document", "interactive"}:
        return None
    if not isinstance(file_name, str) or not isinstance(file_path, str):
        return None
    resource_url = entry.get("resource_url")
    if isinstance(resource_url, str) and resource_url.strip():
        normalized_url = resource_url.strip()
    else:
        normalized_url = f"/{file_path.lstrip('/')}"
    return {
        "resource_kind": kind,
        "resource_file_name": file_name,
        "resource_file_path": file_path,
        "resource_mime_type": entry.get("resource_mime_type"),
        "resource_url": normalized_url,
        "label": entry.get("label"),
    }


def _build_submission_out(
    *,
    module: SectionModule,
    item: SectionModuleItem,
    student: User,
    progress: SectionModuleItemProgress | None,
) -> TeacherModuleSubmissionOut:
    payload = dict(progress.submitted_payload or {}) if progress else {}
    raw_files = payload.get("files")
    files = []
    if isinstance(raw_files, list):
        files = [
            normalized
            for normalized in (_normalize_asset_entry(entry) for entry in raw_files)
            if normalized is not None
        ]
    max_points = _module_max_points(item)
    score_points = _parse_float(payload.get("teacher_score_points"))
    feedback_raw = payload.get("teacher_feedback")
    feedback = feedback_raw.strip() if isinstance(feedback_raw, str) and feedback_raw.strip() else None
    rubric_raw = (item.config or {}).get("rubric_text")
    rubric_text = rubric_raw.strip() if isinstance(rubric_raw, str) and rubric_raw.strip() else None
    rubric_items = _parse_rubric_items(item)
    raw_rubric_scores = payload.get("teacher_rubric_scores")
    rubric_scores: list[dict[str, Any]] = []
    if isinstance(raw_rubric_scores, list):
        rubric_lookup = {
            str(entry["id"]).strip().lower(): entry
            for entry in rubric_items
            if isinstance(entry.get("id"), str) and str(entry["id"]).strip()
        }
        for index, entry in enumerate(raw_rubric_scores, start=1):
            if not isinstance(entry, dict):
                continue
            fallback_id = f"rubric-{index}"
            rubric_id = _normalize_rubric_id(entry.get("rubric_id"), fallback_id)
            matched_rubric = rubric_lookup.get(rubric_id.lower())
            criterion_raw = entry.get("criterion")
            criterion = criterion_raw.strip() if isinstance(criterion_raw, str) else ""
            if not criterion and matched_rubric:
                criterion = str(matched_rubric.get("criterion") or "").strip()
            if not criterion:
                continue
            weight_percent = _parse_float(entry.get("weight_percent"))
            if weight_percent is None and matched_rubric:
                weight_percent = _parse_float(matched_rubric.get("weight_percent"))
            achieved_percent = _parse_float(entry.get("achieved_percent"))
            if achieved_percent is None:
                achieved_percent = 0.0
            achieved_percent = max(0.0, min(float(achieved_percent), 100.0))
            contributed_percent = _parse_float(entry.get("contributed_percent"))
            if contributed_percent is None:
                contributed_percent = (float(weight_percent or 0.0) * achieved_percent) / 100.0
            rubric_scores.append(
                {
                    "rubric_id": rubric_id,
                    "criterion": criterion,
                    "weight_percent": round(max(0.0, min(float(weight_percent or 0.0), 100.0)), 2),
                    "achieved_percent": round(achieved_percent, 2),
                    "contributed_percent": round(max(0.0, float(contributed_percent)), 2),
                }
            )
    rubric_score_percent = _parse_float(payload.get("teacher_rubric_score_percent"))
    if rubric_score_percent is None and rubric_scores:
        rubric_score_percent = sum(float(entry.get("contributed_percent") or 0.0) for entry in rubric_scores)
    if rubric_score_percent is not None:
        rubric_score_percent = round(max(0.0, min(float(rubric_score_percent), 100.0)), 2)

    return TeacherModuleSubmissionOut(
        progress_id=progress.id if progress else None,
        module_id=module.id,
        module_title=module.title,
        item_id=item.id,
        item_title=item.title,
        item_order_index=item.order_index,
        student_id=student.id,
        student_name=_student_display_name(student),
        student_email=student.email,
        status=progress.status if progress else "not_submitted",
        submitted_at=progress.completed_at if progress else None,
        attempt_count=progress.attempt_count if progress else 0,
        duration_seconds=progress.duration_seconds if progress else 0,
        score_percent=progress.score_percent if progress else None,
        max_points=max_points,
        score_points=score_points,
        feedback=feedback,
        rubric_text=rubric_text,
        rubric_items=rubric_items,
        rubric_scores=rubric_scores,
        rubric_score_percent=rubric_score_percent,
        files=files,
    )


def _resource_kind_for_file(
    extension: str,
    content_type: str | None,
) -> Literal["video", "image", "document", "interactive"]:
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


def _save_module_asset(module_id: int, resource_file: UploadFile) -> UploadedModuleAssetOut:
    extension = Path(resource_file.filename or "").suffix.lower() or ".bin"
    saved_name = f"module-{module_id}-{uuid4().hex}{extension}"
    saved_path = MODULE_RESOURCES_DIR / saved_name
    with saved_path.open("wb") as file_handle:
        file_handle.write(resource_file.file.read())
    relative_file_path = f"uploads/module-resources/{saved_name}"
    return UploadedModuleAssetOut(
        resource_kind=_resource_kind_for_file(extension, resource_file.content_type),
        resource_file_name=resource_file.filename or saved_name,
        resource_file_path=relative_file_path,
        resource_mime_type=resource_file.content_type,
        resource_url=f"/{relative_file_path}",
    )


@router.get("/dashboard", response_model=list[TeacherSectionSummaryOut])
def get_teacher_dashboard(
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> list[TeacherSectionSummaryOut]:
    section_ids = get_teacher_section_ids(db, current_teacher.id)
    sections = (
        db.query(Section)
        .options(
            joinedload(Section.teachers).joinedload(SectionTeacherAssignment.teacher),
            joinedload(Section.students).joinedload(SectionStudentAssignment.student),
            joinedload(Section.modules),
        )
        .filter(Section.id.in_(section_ids) if section_ids else False)
        .order_by(Section.name.asc())
        .all()
    )
    results: list[TeacherSectionSummaryOut] = []
    for section in sections:
        latest_template = (
            db.query(CertificateTemplate)
            .filter(CertificateTemplate.section_id == section.id)
            .order_by(CertificateTemplate.created_at.desc(), CertificateTemplate.id.desc())
            .first()
        )
        results.append(
            TeacherSectionSummaryOut(
                section=section_out(section),
                draft_module_count=sum(1 for module in section.modules if not module.is_published),
                published_module_count=sum(1 for module in section.modules if module.is_published),
                pending_certificate_status=latest_template.status if latest_template else None,
            )
        )
    return results


@router.get("/sections", response_model=list[TeacherSectionSummaryOut])
def list_teacher_sections(
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> list[TeacherSectionSummaryOut]:
    return get_teacher_dashboard(db, current_teacher)


@router.get("/sections/{section_id}", response_model=SectionOut)
def get_teacher_section(
    section_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> SectionOut:
    return section_out(_require_teacher_section(db, current_teacher, section_id))


@router.get("/sections/{section_id}/modules", response_model=list[TeacherSectionModuleOut])
def list_teacher_section_modules(
    section_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> list[TeacherSectionModuleOut]:
    section = _require_teacher_section(db, current_teacher, section_id)
    return [_module_out(module) for module in sorted(section.modules, key=lambda row: row.order_index)]


@router.post("/sections/{section_id}/modules", response_model=TeacherSectionModuleOut)
def create_teacher_section_module(
    section_id: int,
    payload: TeacherSectionModuleCreateRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherSectionModuleOut:
    section = _require_teacher_section(db, current_teacher, section_id)
    existing_count = len(section.modules)
    if existing_count >= 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A section can only have up to 12 modules.",
        )

    module = SectionModule(
        section_id=section_id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        order_index=existing_count + 1,
        created_by_teacher_id=current_teacher.id,
        is_published=False,
    )
    db.add(module)
    db.flush()
    log_user_activity(
        db,
        actor=current_teacher,
        action_type="teacher_module_created",
        target_type="section_module",
        target_id=module.id,
        details={"section_id": section_id, "title": module.title},
    )
    db.commit()
    db.refresh(module)
    return _module_out(module)


@router.patch("/modules/{module_id}", response_model=TeacherSectionModuleOut)
def update_teacher_module(
    module_id: int,
    payload: TeacherSectionModuleUpdateRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherSectionModuleOut:
    module = (
        db.query(SectionModule)
        .options(
            joinedload(SectionModule.items),
            joinedload(SectionModule.created_by_teacher),
        )
        .filter(SectionModule.id == module_id)
        .first()
    )
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    _require_teacher_section(db, current_teacher, module.section_id)
    _require_module_owner(db, current_teacher, module)

    if payload.title is not None:
        module.title = payload.title.strip()
    if payload.description is not None:
        module.description = payload.description
    if payload.is_published is not None:
        module.is_published = payload.is_published
    if payload.order_index is not None:
        if payload.order_index < 1 or payload.order_index > 12:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid module order.")
        sibling_modules = (
            db.query(SectionModule)
            .filter(SectionModule.section_id == module.section_id)
            .order_by(SectionModule.order_index.asc())
            .all()
        )
        sibling_modules = [item for item in sibling_modules if item.id != module.id]
        sibling_modules.insert(payload.order_index - 1, module)
        for index, item in enumerate(sibling_modules, start=1):
            item.order_index = index
            db.add(item)

    db.add(module)
    log_user_activity(
        db,
        actor=current_teacher,
        action_type="teacher_module_updated",
        target_type="section_module",
        target_id=module.id,
        details={
            "section_id": module.section_id,
            "title": module.title,
            "is_published": module.is_published,
            "order_index": module.order_index,
        },
    )
    db.commit()
    db.refresh(module)
    return _module_out(module)


@router.post("/modules/{module_id}/items", response_model=TeacherSectionModuleOut)
def create_teacher_module_item(
    module_id: int,
    payload: ModuleItemCreateRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherSectionModuleOut:
    module = (
        db.query(SectionModule)
        .options(
            joinedload(SectionModule.items),
            joinedload(SectionModule.created_by_teacher),
        )
        .filter(SectionModule.id == module_id)
        .first()
    )
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    _require_teacher_section(db, current_teacher, module.section_id)
    _require_module_owner(db, current_teacher, module)

    item = SectionModuleItem(
        section_module_id=module.id,
        title=payload.title.strip(),
        item_type=payload.item_type,
        order_index=len(module.items) + 1,
        instructions=payload.instructions,
        content_text=payload.content_text,
        config=payload.config.model_dump(),
        is_required=payload.is_required,
        is_published=payload.is_published,
    )
    db.add(item)
    db.flush()
    log_user_activity(
        db,
        actor=current_teacher,
        action_type="teacher_module_item_created",
        target_type="section_module_item",
        target_id=item.id,
        details={
            "section_id": module.section_id,
            "module_id": module.id,
            "item_type": item.item_type,
            "title": item.title,
        },
    )
    db.commit()
    db.refresh(module)
    return _module_out(module)


@router.post("/modules/{module_id}/items/upload", response_model=TeacherSectionModuleOut)
def upload_teacher_module_item_resource(
    module_id: int,
    title: str = Form(...),
    item_type: str = Form(...),
    instructions: str | None = Form(default=None),
    content_text: str | None = Form(default=None),
    is_required: bool = Form(default=True),
    is_published: bool = Form(default=True),
    resource_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherSectionModuleOut:
    module = (
        db.query(SectionModule)
        .options(
            joinedload(SectionModule.items),
            joinedload(SectionModule.created_by_teacher),
        )
        .filter(SectionModule.id == module_id)
        .first()
    )
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    _require_teacher_section(db, current_teacher, module.section_id)
    _require_module_owner(db, current_teacher, module)
    if item_type not in RESOURCE_ITEM_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid resource item type.",
        )

    uploaded_asset = _save_module_asset(module.id, resource_file)
    config = {
        "resource_kind": _resource_kind_for_item_type(item_type),
        "resource_file_name": uploaded_asset.resource_file_name,
        "resource_file_path": uploaded_asset.resource_file_path,
        "resource_mime_type": uploaded_asset.resource_mime_type,
        "resource_url": uploaded_asset.resource_url,
    }
    item = SectionModuleItem(
        section_module_id=module.id,
        title=title.strip(),
        item_type=item_type,
        order_index=len(module.items) + 1,
        instructions=instructions,
        content_text=content_text,
        config=config,
        is_required=is_required,
        is_published=is_published,
    )
    db.add(item)
    db.flush()
    log_user_activity(
        db,
        actor=current_teacher,
        action_type="teacher_module_resource_uploaded",
        target_type="section_module_item",
        target_id=item.id,
        details={
            "section_id": module.section_id,
            "module_id": module.id,
            "item_type": item.item_type,
            "title": item.title,
            "resource_file_name": uploaded_asset.resource_file_name,
        },
    )
    db.commit()
    db.refresh(module)
    return _module_out(module)


@router.post("/module-items/{item_id}/assets/upload", response_model=TeacherSectionModuleOut)
def upload_teacher_module_item_asset(
    item_id: int,
    usage: Literal["attachment", "prompt"] = Form(default="attachment"),
    label: str | None = Form(default=None),
    resource_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherSectionModuleOut:
    item = (
        db.query(SectionModuleItem)
        .options(
            joinedload(SectionModuleItem.module).joinedload(SectionModule.items),
            joinedload(SectionModuleItem.module).joinedload(SectionModule.created_by_teacher),
        )
        .filter(SectionModuleItem.id == item_id)
        .first()
    )
    if not item or not item.module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module item not found.")
    _require_teacher_section(db, current_teacher, item.module.section_id)
    _require_module_owner(db, current_teacher, item.module)

    allowed_item_types = {"readable", "identification_assessment", "multiple_choice_assessment"}
    if item.item_type not in allowed_item_types:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assets can only be uploaded for readable, identification, and multiple-choice items.",
        )
    if usage == "prompt" and item.item_type not in {"identification_assessment", "multiple_choice_assessment"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Prompt media is only available for identification and multiple-choice items.",
        )

    uploaded_asset = _save_module_asset(item.module.id, resource_file)
    config = dict(item.config or {})
    normalized_label = (label or "").strip()
    serialized_asset = uploaded_asset.model_dump()
    serialized_asset["label"] = normalized_label or None

    if usage == "prompt":
        config["prompt_media"] = serialized_asset
    else:
        existing_attachments = config.get("attachments") or []
        attachments = [entry for entry in existing_attachments if isinstance(entry, dict)]
        attachments.append(serialized_asset)
        config["attachments"] = attachments

    item.config = config
    db.add(item)
    log_user_activity(
        db,
        actor=current_teacher,
        action_type="teacher_module_item_asset_uploaded",
        target_type="section_module_item",
        target_id=item.id,
        details={
            "section_id": item.module.section_id,
            "module_id": item.module.id,
            "item_id": item.id,
            "item_type": item.item_type,
            "usage": usage,
            "resource_file_name": uploaded_asset.resource_file_name,
            "resource_kind": uploaded_asset.resource_kind,
        },
    )
    db.commit()
    db.refresh(item.module)
    return _module_out(item.module)


@router.patch("/module-items/{item_id}", response_model=TeacherSectionModuleOut)
def update_teacher_module_item(
    item_id: int,
    payload: ModuleItemUpdateRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherSectionModuleOut:
    item = (
        db.query(SectionModuleItem)
        .options(
            joinedload(SectionModuleItem.module).joinedload(SectionModule.items),
            joinedload(SectionModuleItem.module).joinedload(SectionModule.created_by_teacher),
        )
        .filter(SectionModuleItem.id == item_id)
        .first()
    )
    if not item or not item.module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module item not found.")
    _require_teacher_section(db, current_teacher, item.module.section_id)
    _require_module_owner(db, current_teacher, item.module)

    if payload.title is not None:
        item.title = payload.title.strip()
    if payload.instructions is not None:
        item.instructions = payload.instructions
    if payload.content_text is not None:
        item.content_text = payload.content_text
    if payload.config is not None:
        item.config = payload.config.model_dump()
    if payload.is_required is not None:
        item.is_required = payload.is_required
    if payload.is_published is not None:
        item.is_published = payload.is_published
    db.add(item)
    log_user_activity(
        db,
        actor=current_teacher,
        action_type="teacher_module_item_updated",
        target_type="section_module_item",
        target_id=item.id,
        details={
            "section_id": item.module.section_id,
            "module_id": item.module.id,
            "item_type": item.item_type,
            "title": item.title,
            "is_published": item.is_published,
        },
    )
    db.commit()
    db.refresh(item.module)
    return _module_out(item.module)


@router.delete("/module-items/{item_id}", response_model=TeacherSectionModuleOut)
def delete_teacher_module_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherSectionModuleOut:
    item = (
        db.query(SectionModuleItem)
        .options(
            joinedload(SectionModuleItem.module).joinedload(SectionModule.items),
            joinedload(SectionModuleItem.module).joinedload(SectionModule.created_by_teacher),
        )
        .filter(SectionModuleItem.id == item_id)
        .first()
    )
    if not item or not item.module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module item not found.")
    module = item.module
    _require_teacher_section(db, current_teacher, module.section_id)
    _require_module_owner(db, current_teacher, module)
    db.delete(item)
    db.flush()
    remaining_items = (
        db.query(SectionModuleItem)
        .filter(SectionModuleItem.section_module_id == module.id)
        .order_by(SectionModuleItem.order_index.asc())
        .all()
    )
    for index, row in enumerate(remaining_items, start=1):
        row.order_index = index
        db.add(row)
    log_user_activity(
        db,
        actor=current_teacher,
        action_type="teacher_module_item_deleted",
        target_type="section_module_item",
        target_id=item_id,
        details={
            "section_id": module.section_id,
            "module_id": module.id,
            "title": item.title,
            "item_type": item.item_type,
        },
    )
    db.commit()
    db.refresh(module)
    return _module_out(module)


@router.get("/modules/{module_id}/submissions", response_model=list[TeacherModuleSubmissionOut])
def list_module_upload_submissions(
    module_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> list[TeacherModuleSubmissionOut]:
    module = (
        db.query(SectionModule)
        .options(
            joinedload(SectionModule.items),
            joinedload(SectionModule.section).joinedload(Section.students).joinedload(SectionStudentAssignment.student),
        )
        .filter(SectionModule.id == module_id)
        .first()
    )
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    _require_teacher_section(db, current_teacher, module.section_id)

    upload_items = [
        item
        for item in sorted(module.items, key=lambda row: row.order_index)
        if item.item_type == "upload_assessment"
    ]
    if not upload_items:
        return []

    item_ids = [item.id for item in upload_items]
    student_assignments = sorted(
        [assignment for assignment in module.section.students if assignment.student is not None],
        key=lambda entry: (
            _student_display_name(entry.student).lower(),
            entry.student.id,
        ),
    )
    if not student_assignments:
        return []
    student_ids = [assignment.student_id for assignment in student_assignments]
    progress_rows = (
        db.query(SectionModuleItemProgress)
        .filter(
            SectionModuleItemProgress.section_module_id == module.id,
            SectionModuleItemProgress.section_module_item_id.in_(item_ids),
            SectionModuleItemProgress.student_id.in_(student_ids),
        )
        .all()
    )
    progress_by_key = {
        (row.section_module_item_id, row.student_id): row for row in progress_rows
    }
    submissions: list[TeacherModuleSubmissionOut] = []
    for item in upload_items:
        for assignment in student_assignments:
            student = assignment.student
            if not student:
                continue
            progress = progress_by_key.get((item.id, student.id))
            submissions.append(
                _build_submission_out(
                    module=module,
                    item=item,
                    student=student,
                    progress=progress,
                )
            )
    return submissions


@router.patch(
    "/submission-progress/{progress_id}/grade",
    response_model=TeacherModuleSubmissionOut,
)
def grade_module_upload_submission(
    progress_id: int,
    payload: TeacherSubmissionGradeRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherModuleSubmissionOut:
    progress = (
        db.query(SectionModuleItemProgress)
        .options(
            joinedload(SectionModuleItemProgress.student),
            joinedload(SectionModuleItemProgress.module_item).joinedload(SectionModuleItem.module),
        )
        .filter(SectionModuleItemProgress.id == progress_id)
        .first()
    )
    if not progress or not progress.module_item or not progress.module_item.module or not progress.student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found.")
    item = progress.module_item
    module = item.module
    student = progress.student
    _require_teacher_section(db, current_teacher, module.section_id)
    if item.item_type != "upload_assessment":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only upload assessments can be graded manually.",
        )
    max_points = _module_max_points(item)
    rubric_items = _parse_rubric_items(item)
    score_points: float
    score_percent: float
    current_payload = dict(progress.submitted_payload or {})
    if payload.rubric_scores:
        if not rubric_items:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No rubric criteria configured for this upload assessment.",
            )
        input_by_rubric_id = {
            _normalize_rubric_id(entry.rubric_id, f"rubric-{index + 1}"): entry
            for index, entry in enumerate(payload.rubric_scores)
        }
        computed_rubric_scores: list[dict[str, Any]] = []
        total_percent = 0.0
        for index, rubric_item in enumerate(rubric_items, start=1):
            rubric_id = _normalize_rubric_id(rubric_item.get("id"), f"rubric-{index}")
            criterion = str(rubric_item.get("criterion") or "").strip()
            weight_percent = max(0.0, min(float(_parse_float(rubric_item.get("weight_percent")) or 0.0), 100.0))
            matched_input = input_by_rubric_id.get(rubric_id)
            achieved_percent = (
                max(0.0, min(float(matched_input.achieved_percent), 100.0))
                if matched_input is not None
                else 0.0
            )
            contributed_percent = round((weight_percent * achieved_percent) / 100.0, 2)
            total_percent += contributed_percent
            computed_rubric_scores.append(
                {
                    "rubric_id": rubric_id,
                    "criterion": criterion,
                    "weight_percent": round(weight_percent, 2),
                    "achieved_percent": round(achieved_percent, 2),
                    "contributed_percent": contributed_percent,
                }
            )

        score_percent = round(max(0.0, min(total_percent, 100.0)), 2)
        score_points = round((score_percent / 100.0) * max_points, 2) if max_points > 0 else 0.0
        current_payload["teacher_rubric_scores"] = computed_rubric_scores
        current_payload["teacher_rubric_score_percent"] = score_percent
    else:
        if payload.score_points is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Provide a score or use the rubric scorer before saving.",
            )
        score_points = max(0.0, min(float(payload.score_points), max_points))
        score_percent = round((score_points / max_points) * 100, 2) if max_points > 0 else 0.0
        current_payload.pop("teacher_rubric_scores", None)
        current_payload.pop("teacher_rubric_score_percent", None)

    current_payload["teacher_score_points"] = score_points
    current_payload["teacher_feedback"] = (payload.feedback or "").strip() or None
    current_payload["teacher_scored_by_teacher_id"] = current_teacher.id
    current_payload["teacher_scored_at"] = utc_now().isoformat()
    progress.status = "completed"
    progress.score_percent = score_percent
    progress.submitted_payload = current_payload
    db.add(progress)
    log_user_activity(
        db,
        actor=current_teacher,
        action_type="teacher_upload_submission_graded",
        target_type="section_module_item_progress",
        target_id=progress.id,
        details={
            "module_id": module.id,
            "module_title": module.title,
            "item_id": item.id,
            "item_title": item.title,
            "student_id": student.id,
            "score_points": score_points,
            "max_points": max_points,
            "score_percent": score_percent,
        },
    )
    db.commit()
    db.refresh(progress)
    return _build_submission_out(module=module, item=item, student=student, progress=progress)


@router.post("/sections/{section_id}/certificate-template", response_model=CertificateTemplateOut)
def upload_certificate_template(
    section_id: int,
    certificate_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> CertificateTemplateOut:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Teacher certificate uploads have been disabled.",
    )


@router.get("/certificates", response_model=list[CertificateTemplateOut])
def list_teacher_certificate_templates(
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> list[CertificateTemplateOut]:
    return []


@router.get("/students/{student_id}/report", response_model=TeacherStudentReportOut)
def get_teacher_student_report(
    student_id: int,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherStudentReportOut:
    student_assignment = (
        db.query(SectionStudentAssignment)
        .options(joinedload(SectionStudentAssignment.section).joinedload(Section.modules).joinedload(SectionModule.items))
        .options(joinedload(SectionStudentAssignment.student))
        .filter(SectionStudentAssignment.student_id == student_id)
        .first()
    )
    if not student_assignment or not student_assignment.section or not student_assignment.student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student report not found.")
    _require_teacher_section(db, current_teacher, student_assignment.section_id)

    module_reports: list[TeacherStudentModuleReportOut] = []
    current_finished_module: str | None = None
    focus_areas: list[str] = []
    assessment_types = {
        "multiple_choice_assessment",
        "identification_assessment",
        "signing_lab_assessment",
        "upload_assessment",
    }

    for module in sorted(student_assignment.section.modules, key=lambda row: row.order_index):
        progress = sync_module_progress(db, student_id=student_id, module=module)
        item_progress_entries = (
            db.query(SectionModuleItemProgress)
            .filter(
                SectionModuleItemProgress.student_id == student_id,
                SectionModuleItemProgress.section_module_id == module.id,
            )
            .all()
        )
        item_progress_by_item_id = {
            entry.section_module_item_id: entry for entry in item_progress_entries
        }
        published_items = [
            item for item in sorted(module.items, key=lambda row: row.order_index) if item.is_published
        ]
        item_reports = [
            TeacherStudentItemReportOut(
                item_id=item.id,
                item_title=item.title,
                item_type=item.item_type,
                order_index=item.order_index,
                status=(progress_entry.status if progress_entry else "not_started"),
                is_correct=(progress_entry.is_correct if progress_entry else None),
                score_percent=(progress_entry.score_percent if progress_entry else None),
                attempt_count=(progress_entry.attempt_count if progress_entry else 0),
                duration_seconds=(progress_entry.duration_seconds if progress_entry else 0),
                completed_at=(progress_entry.completed_at if progress_entry else None),
                attempt_details=_extract_attempt_details(progress_entry),
            )
            for item in published_items
            for progress_entry in [item_progress_by_item_id.get(item.id)]
        ]
        assessment_reports = [
            entry for entry in item_reports if entry.item_type in assessment_types
        ]
        correct_count = sum(1 for entry in assessment_reports if entry.is_correct is True)
        wrong_count = sum(1 for entry in assessment_reports if entry.is_correct is False)
        total_attempts = sum(entry.attempt_count for entry in assessment_reports)
        total_module_duration = sum(entry.duration_seconds for entry in item_reports)
        module_duration_for_summary = (
            total_module_duration if progress.status == "completed" else 0
        )
        module_reports.append(
            TeacherStudentModuleReportOut(
                module_id=module.id,
                module_title=module.title,
                status=progress.status,
                progress_percent=progress.progress_percent,
                correct_count=correct_count,
                wrong_count=wrong_count,
                attempt_count=total_attempts,
                total_duration_seconds=module_duration_for_summary,
                item_reports=item_reports,
            )
        )
        if progress.status == "completed":
            current_finished_module = module.title
        if wrong_count > correct_count:
            focus_areas.append(module.title)

    verdict = (
        f"Focus on {', '.join(focus_areas[:3])} and review incorrect answers with the student."
        if focus_areas
        else "Student is progressing well. Continue guided practice and signing review."
    )
    return TeacherStudentReportOut(
        student=user_summary(student_assignment.student),
        section=section_out(student_assignment.section),
        current_finished_module=current_finished_module,
        verdict=verdict,
        module_reports=module_reports,
    )

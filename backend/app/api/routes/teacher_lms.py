from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_teacher
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
    TeacherStudentModuleReportOut,
    TeacherStudentReportOut,
)
from app.services.lms_service import (
    RESOURCE_ITEM_TYPES,
    get_teacher_section_ids,
    latest_approved_template,
    section_out,
    sync_module_progress,
    user_summary,
)


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
        )
        .filter(Section.id == section_id)
        .first()
    )
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found.")

    teacher_section_ids = get_teacher_section_ids(db, current_teacher.id)
    if current_teacher.role != "admin" and section.id not in teacher_section_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this section.",
        )
    return section


def _module_out(module: SectionModule) -> TeacherSectionModuleOut:
    return TeacherSectionModuleOut(
        id=module.id,
        section_id=module.section_id,
        title=module.title,
        description=module.description,
        order_index=module.order_index,
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
        .options(joinedload(SectionModule.items))
        .filter(SectionModule.id == module_id)
        .first()
    )
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    _require_teacher_section(db, current_teacher, module.section_id)

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
        .options(joinedload(SectionModule.items))
        .filter(SectionModule.id == module_id)
        .first()
    )
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    _require_teacher_section(db, current_teacher, module.section_id)

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
        .options(joinedload(SectionModule.items))
        .filter(SectionModule.id == module_id)
        .first()
    )
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found.")
    _require_teacher_section(db, current_teacher, module.section_id)
    if item_type not in RESOURCE_ITEM_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid resource item type.",
        )

    extension = Path(resource_file.filename or "").suffix.lower() or ".bin"
    saved_name = f"module-{module.id}-{uuid4().hex}{extension}"
    saved_path = MODULE_RESOURCES_DIR / saved_name
    with saved_path.open("wb") as file_handle:
        file_handle.write(resource_file.file.read())

    relative_file_path = f"uploads/module-resources/{saved_name}"
    config = {
        "resource_kind": _resource_kind_for_item_type(item_type),
        "resource_file_name": resource_file.filename or saved_name,
        "resource_file_path": relative_file_path,
        "resource_mime_type": resource_file.content_type,
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
    db.commit()
    db.refresh(module)
    return _module_out(module)


@router.patch("/module-items/{item_id}", response_model=TeacherSectionModuleOut)
def update_teacher_module_item(
    item_id: int,
    payload: ModuleItemUpdateRequest,
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> TeacherSectionModuleOut:
    item = (
        db.query(SectionModuleItem)
        .options(joinedload(SectionModuleItem.module).joinedload(SectionModule.items))
        .filter(SectionModuleItem.id == item_id)
        .first()
    )
    if not item or not item.module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module item not found.")
    _require_teacher_section(db, current_teacher, item.module.section_id)

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
        .options(joinedload(SectionModuleItem.module).joinedload(SectionModule.items))
        .filter(SectionModuleItem.id == item_id)
        .first()
    )
    if not item or not item.module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module item not found.")
    module = item.module
    _require_teacher_section(db, current_teacher, module.section_id)
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
    db.commit()
    db.refresh(module)
    return _module_out(module)


@router.post("/sections/{section_id}/certificate-template", response_model=CertificateTemplateOut)
def upload_certificate_template(
    section_id: int,
    certificate_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> CertificateTemplateOut:
    section = _require_teacher_section(db, current_teacher, section_id)
    extension = Path(certificate_file.filename or "").suffix.lower() or ".bin"
    saved_name = f"{section.code.lower()}-{uuid4().hex}{extension}"
    saved_path = CERTIFICATE_TEMPLATES_DIR / saved_name
    with saved_path.open("wb") as file_handle:
        file_handle.write(certificate_file.file.read())

    template = CertificateTemplate(
        section_id=section_id,
        uploaded_by_teacher_id=current_teacher.id,
        original_file_name=certificate_file.filename or saved_name,
        file_path=str(saved_path),
        status="pending",
    )
    db.add(template)
    db.commit()
    return CertificateTemplateOut(
        id=template.id,
        section_id=section_id,
        section_name=section.name,
        original_file_name=template.original_file_name,
        status=template.status,
        review_remarks=template.review_remarks,
        created_at=template.created_at,
    )


@router.get("/certificates", response_model=list[CertificateTemplateOut])
def list_teacher_certificate_templates(
    db: Session = Depends(get_db),
    current_teacher: User = Depends(get_current_teacher),
) -> list[CertificateTemplateOut]:
    templates = (
        db.query(CertificateTemplate)
        .options(joinedload(CertificateTemplate.section))
        .filter(CertificateTemplate.uploaded_by_teacher_id == current_teacher.id)
        .order_by(CertificateTemplate.created_at.desc())
        .all()
    )
    return [
        CertificateTemplateOut(
            id=item.id,
            section_id=item.section_id,
            section_name=item.section.name if item.section else "Unknown section",
            original_file_name=item.original_file_name,
            status=item.status,
            review_remarks=item.review_remarks,
            created_at=item.created_at,
        )
        for item in templates
    ]


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
        correct_count = sum(1 for entry in item_progress_entries if entry.is_correct is True)
        wrong_count = sum(1 for entry in item_progress_entries if entry.is_correct is False)
        total_attempts = sum(entry.attempt_count for entry in item_progress_entries)
        total_duration = sum(entry.duration_seconds for entry in item_progress_entries)
        module_reports.append(
            TeacherStudentModuleReportOut(
                module_id=module.id,
                module_title=module.title,
                status=progress.status,
                progress_percent=progress.progress_percent,
                correct_count=correct_count,
                wrong_count=wrong_count,
                attempt_count=total_attempts,
                total_duration_seconds=total_duration,
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

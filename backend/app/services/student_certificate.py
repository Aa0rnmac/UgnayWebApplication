from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from app.core.datetime_utils import utc_now
from app.models.assessment_report import AssessmentReport
from app.models.module import Module
from app.models.progress import UserModuleProgress
from app.models.student_certificate import StudentCertificate
from app.models.user import User
from app.schemas.teacher import (
    TeacherStudentCertificateModuleOut,
    TeacherStudentCertificateOut,
    TeacherStudentCertificateRecordOut,
    TeacherStudentCertificateSummaryOut,
    TeacherStudentCertificateTemplateOut,
)

CERTIFICATE_TARGET_REQUIRED_MODULES = 12
CERTIFICATE_PASSING_PERCENT = 65.0


def full_name_for_certificate(user: User | None) -> str:
    if user is None:
        return "Teacher"
    full_name = " ".join(
        part.strip()
        for part in [user.first_name or "", user.middle_name or "", user.last_name or ""]
        if part and part.strip()
    ).strip()
    return full_name or user.username


def certificate_reference(student_id: int) -> str:
    return f"CERT-{student_id:04d}-{utc_now().strftime('%Y%m%d%H%M%S')}"


def _certificate_record_out(
    record: StudentCertificate | None,
) -> TeacherStudentCertificateRecordOut | None:
    if record is None:
        return None
    return TeacherStudentCertificateRecordOut(
        status=record.status,
        decision_note=record.decision_note,
        decided_at=record.decided_at,
        decided_by_name=full_name_for_certificate(record.decided_by),
        issued_at=record.issued_at,
        certificate_reference=record.certificate_reference,
    )


def _certificate_template_out(
    *,
    student_id: int,
    student_name: str,
    summary: TeacherStudentCertificateSummaryOut,
    record: StudentCertificate | None,
    preview_teacher: User | None,
) -> TeacherStudentCertificateTemplateOut:
    approving_teacher_name = (
        full_name_for_certificate(record.decided_by)
        if record is not None and record.decided_by is not None
        else full_name_for_certificate(preview_teacher)
    )
    issue_date = (
        record.issued_at
        if record is not None and record.issued_at is not None
        else record.decided_at
        if record is not None
        else utc_now()
    )
    resolved_reference = (
        record.certificate_reference if record is not None else f"PREVIEW-{student_id:04d}"
    )

    return TeacherStudentCertificateTemplateOut(
        student_name=student_name,
        certificate_title="Certificate of Completion",
        completion_statement=(
            f"This certifies that {student_name} completed "
            f"{summary.completed_required_modules} of {summary.target_required_modules} "
            "weekly FSL Learning Hub sessions and achieved a passing average best module score of "
            f"{summary.average_best_score:.2f}%."
        ),
        issue_date=issue_date,
        approving_teacher_name=approving_teacher_name,
        certificate_reference=resolved_reference,
        effective_required_modules=summary.effective_required_modules,
        completed_required_modules=summary.completed_required_modules,
        average_best_score=summary.average_best_score,
    )


def build_student_certificate_status(
    db: Session,
    *,
    student: User,
    preview_teacher: User | None = None,
    allow_preview_template: bool = False,
) -> TeacherStudentCertificateOut:
    required_modules = (
        db.query(Module)
        .filter(
            Module.module_kind == "system",
            Module.archived_at.is_(None),
            Module.is_published.is_(True),
        )
        .order_by(Module.order_index.asc(), Module.id.asc())
        .limit(CERTIFICATE_TARGET_REQUIRED_MODULES)
        .all()
    )
    required_module_ids = [module.id for module in required_modules]

    progress_rows = (
        db.query(UserModuleProgress)
        .filter(UserModuleProgress.user_id == student.id)
        .order_by(UserModuleProgress.module_id.asc())
        .all()
    )
    progress_by_module = {row.module_id: row for row in progress_rows}

    report_query = db.query(AssessmentReport).filter(AssessmentReport.user_id == student.id)
    if required_module_ids:
        report_query = report_query.filter(AssessmentReport.module_id.in_(required_module_ids))
    else:
        report_query = report_query.filter(AssessmentReport.id == -1)
    report_rows = report_query.order_by(AssessmentReport.created_at.asc(), AssessmentReport.id.asc()).all()

    best_score_by_module: dict[int, float] = {}
    for row in report_rows:
        score = float(row.score_percent or 0)
        previous = best_score_by_module.get(row.module_id)
        if previous is None or score > previous:
            best_score_by_module[row.module_id] = score

    certificate_modules: list[TeacherStudentCertificateModuleOut] = []
    for module in required_modules:
        progress = progress_by_module.get(module.id)
        completed = progress is not None and (
            progress.status == "completed" or progress.progress_percent >= 100
        )
        latest_score = (
            float(progress.assessment_score)
            if progress is not None and progress.assessment_score is not None
            else None
        )
        best_score = best_score_by_module.get(module.id)
        certificate_modules.append(
            TeacherStudentCertificateModuleOut(
                module_id=module.id,
                module_title=module.title,
                order_index=module.order_index,
                completed=completed,
                latest_score=latest_score,
                best_score=best_score,
                certificate_score_used=best_score,
                passed=completed and best_score is not None and best_score >= CERTIFICATE_PASSING_PERCENT,
            )
        )

    effective_required_modules = len(certificate_modules)
    completed_required_modules = sum(1 for item in certificate_modules if item.completed)
    average_best_score = (
        round(
            sum((item.certificate_score_used or 0) for item in certificate_modules)
            / effective_required_modules,
            2,
        )
        if effective_required_modules
        else 0.0
    )

    record = (
        db.query(StudentCertificate)
        .options(joinedload(StudentCertificate.decided_by))
        .filter(StudentCertificate.student_id == student.id)
        .first()
    )

    if effective_required_modules == 0:
        eligible = False
        reason = "No live weekly sessions are available yet for certificate tracking."
    elif effective_required_modules < CERTIFICATE_TARGET_REQUIRED_MODULES:
        eligible = False
        reason = (
            f"{effective_required_modules} of {CERTIFICATE_TARGET_REQUIRED_MODULES} weekly sessions "
            "are currently live. Certificate review starts only after the full 12-session program is released, completed, and passed."
        )
    elif completed_required_modules < CERTIFICATE_TARGET_REQUIRED_MODULES:
        eligible = False
        reason = (
            f"Complete all {CERTIFICATE_TARGET_REQUIRED_MODULES} weekly sessions before certificate review. "
            f"You have finished {completed_required_modules} so far."
        )
    elif any(item.certificate_score_used is None for item in certificate_modules):
        eligible = False
        reason = "One or more required weekly sessions do not yet have a saved assessment score."
    elif average_best_score < CERTIFICATE_PASSING_PERCENT:
        eligible = False
        reason = (
            "The average best score across the 12 required sessions is still below the 65% passing mark."
        )
    elif record is not None and record.status == "approved" and record.issued_at is not None:
        eligible = True
        reason = "The certificate was approved and issued by the teacher."
    elif record is not None and record.status == "rejected":
        eligible = True
        reason = "The completion and score rules are met, but the latest teacher review did not issue the certificate yet."
    else:
        eligible = True
        reason = "The 12-session program is completed and passed. Teacher approval and certificate issuance can now proceed."

    summary = TeacherStudentCertificateSummaryOut(
        target_required_modules=CERTIFICATE_TARGET_REQUIRED_MODULES,
        effective_required_modules=effective_required_modules,
        completed_required_modules=completed_required_modules,
        average_best_score=average_best_score,
        eligible=eligible,
        reason=reason,
    )

    template = None
    if record is not None and record.status == "approved":
        template = _certificate_template_out(
            student_id=student.id,
            student_name=full_name_for_certificate(student),
            summary=summary,
            record=record,
            preview_teacher=preview_teacher,
        )
    elif allow_preview_template and summary.eligible:
        template = _certificate_template_out(
            student_id=student.id,
            student_name=full_name_for_certificate(student),
            summary=summary,
            record=record,
            preview_teacher=preview_teacher,
        )

    return TeacherStudentCertificateOut(
        student_id=student.id,
        student_name=full_name_for_certificate(student),
        modules=certificate_modules,
        summary=summary,
        record=_certificate_record_out(record),
        template=template,
    )

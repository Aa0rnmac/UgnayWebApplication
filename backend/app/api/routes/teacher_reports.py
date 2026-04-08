from collections import Counter
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.assessment_report import AssessmentReport
from app.models.user import User
from app.schemas.teacher_report import (
    TeacherAssessmentReportOut,
    TeacherAssessmentReportsResponse,
    TeacherGeneratedStudentReport,
    TeacherImprovementAreaItem,
    TeacherModuleSummary,
    TeacherStudentReportRow,
    TeacherStudentReportTableResponse,
)

router = APIRouter(prefix="/teacher/reports", tags=["teacher-reports"])


def _ensure_teacher(current_user: User) -> None:
    if current_user.role != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teacher accounts can access assessment reports.",
        )


def _display_name(user: User) -> str:
    full_name = " ".join(
        part.strip() for part in [user.first_name or "", user.last_name or ""] if part and part.strip()
    ).strip()
    return full_name or user.username


@router.get("", response_model=TeacherAssessmentReportsResponse)
def list_teacher_reports(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> TeacherAssessmentReportsResponse:
    _ensure_teacher(current_user)

    rows = (
        db.query(AssessmentReport)
        .order_by(AssessmentReport.created_at.desc(), AssessmentReport.id.desc())
        .all()
    )
    reports = [
        TeacherAssessmentReportOut(
            id=row.id,
            student_id=row.user_id,
            module_id=row.module_id,
            module_title=row.module_title,
            assessment_id=row.assessment_id,
            assessment_title=row.assessment_title,
            right_count=row.right_count,
            wrong_count=row.wrong_count,
            total_items=row.total_items,
            score_percent=row.score_percent,
            improvement_areas=list(row.improvement_areas or []),
            status=row.status,
            created_at=row.created_at,
        )
        for row in rows
    ]
    return TeacherAssessmentReportsResponse(reports=reports)


@router.get("/students", response_model=TeacherStudentReportTableResponse)
def list_teacher_student_report_rows(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> TeacherStudentReportTableResponse:
    _ensure_teacher(current_user)

    rows = (
        db.query(AssessmentReport, User)
        .join(User, User.id == AssessmentReport.user_id)
        .order_by(AssessmentReport.created_at.desc(), AssessmentReport.id.desc())
        .all()
    )

    by_student: dict[int, TeacherStudentReportRow] = {}
    score_totals: dict[int, tuple[float, int]] = {}

    for report, student in rows:
        if student.id not in by_student:
            by_student[student.id] = TeacherStudentReportRow(
                student_id=student.id,
                student_name=_display_name(student),
                student_email=student.email,
                total_assessments=0,
                pending_reports=0,
                generated_reports=0,
                average_score_percent=0,
                latest_activity_at=report.created_at,
            )
            score_totals[student.id] = (0.0, 0)

        row = by_student[student.id]
        row.total_assessments += 1
        if report.status == "queued":
            row.pending_reports += 1
        else:
            row.generated_reports += 1

        current_score_sum, current_score_count = score_totals[student.id]
        score_totals[student.id] = (current_score_sum + float(report.score_percent), current_score_count + 1)

        if row.latest_activity_at is None or report.created_at > row.latest_activity_at:
            row.latest_activity_at = report.created_at

    students: list[TeacherStudentReportRow] = []
    for student_id, row in by_student.items():
        score_sum, score_count = score_totals[student_id]
        row.average_score_percent = round(score_sum / score_count, 2) if score_count else 0.0
        students.append(row)

    students.sort(
        key=lambda item: item.latest_activity_at or datetime.min,
        reverse=True,
    )
    return TeacherStudentReportTableResponse(students=students)


@router.post("/students/{student_id}/generate", response_model=TeacherGeneratedStudentReport)
def generate_teacher_student_report(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeacherGeneratedStudentReport:
    _ensure_teacher(current_user)

    student = db.query(User).filter(User.id == student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    report_rows = (
        db.query(AssessmentReport)
        .filter(AssessmentReport.user_id == student_id)
        .order_by(AssessmentReport.created_at.asc(), AssessmentReport.id.asc())
        .all()
    )

    if not report_rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No assessment records found for this student.",
        )

    pending_before = sum(1 for row in report_rows if row.status == "queued")

    module_aggregates: dict[tuple[int, str], dict[str, int]] = {}
    improvement_counter: Counter[str] = Counter()

    total_right = 0
    total_wrong = 0
    total_items = 0

    for row in report_rows:
        total_right += int(row.right_count or 0)
        total_wrong += int(row.wrong_count or 0)
        total_items += int(row.total_items or 0)

        key = (row.module_id, row.module_title)
        if key not in module_aggregates:
            module_aggregates[key] = {
                "assessments_taken": 0,
                "right_count": 0,
                "wrong_count": 0,
                "total_items": 0,
            }

        agg = module_aggregates[key]
        agg["assessments_taken"] += 1
        agg["right_count"] += int(row.right_count or 0)
        agg["wrong_count"] += int(row.wrong_count or 0)
        agg["total_items"] += int(row.total_items or 0)

        for area in list(row.improvement_areas or []):
            normalized = area.strip()
            if normalized:
                improvement_counter[normalized] += 1

        if row.status == "queued":
            row.status = "generated"
            db.add(row)

    module_summaries: list[TeacherModuleSummary] = []
    for (module_id, module_title), values in module_aggregates.items():
        items = values["total_items"]
        score_percent = round((values["right_count"] / items) * 100, 2) if items > 0 else 0.0
        module_summaries.append(
            TeacherModuleSummary(
                module_id=module_id,
                module_title=module_title,
                assessments_taken=values["assessments_taken"],
                right_count=values["right_count"],
                wrong_count=values["wrong_count"],
                total_items=items,
                score_percent=score_percent,
            )
        )
    module_summaries.sort(key=lambda item: item.module_id)

    top_improvement_areas = [
        TeacherImprovementAreaItem(area=area, count=count)
        for area, count in improvement_counter.most_common(12)
    ]

    db.commit()

    overall_score_percent = round((total_right / total_items) * 100, 2) if total_items > 0 else 0.0

    return TeacherGeneratedStudentReport(
        student_id=student.id,
        student_name=_display_name(student),
        student_email=student.email,
        generated_at=datetime.utcnow(),
        total_assessments=len(report_rows),
        pending_reports_before_generate=pending_before,
        total_right=total_right,
        total_wrong=total_wrong,
        total_items=total_items,
        overall_score_percent=overall_score_percent,
        modules=module_summaries,
        top_improvement_areas=top_improvement_areas,
    )

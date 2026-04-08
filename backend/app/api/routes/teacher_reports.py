from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.assessment_report import AssessmentReport
from app.models.user import User
from app.schemas.teacher_report import TeacherAssessmentReportOut, TeacherAssessmentReportsResponse

router = APIRouter(prefix="/teacher/reports", tags=["teacher-reports"])


@router.get("", response_model=TeacherAssessmentReportsResponse)
def list_teacher_reports(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> TeacherAssessmentReportsResponse:
    if current_user.role != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teacher accounts can access assessment reports.",
        )

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

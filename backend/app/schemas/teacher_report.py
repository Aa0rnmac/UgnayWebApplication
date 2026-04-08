from datetime import datetime

from pydantic import BaseModel


class TeacherAssessmentReportOut(BaseModel):
    id: int
    student_id: int
    module_id: int
    module_title: str
    assessment_id: str
    assessment_title: str
    right_count: int
    wrong_count: int
    total_items: int
    score_percent: float
    improvement_areas: list[str]
    status: str
    created_at: datetime


class TeacherAssessmentReportsResponse(BaseModel):
    reports: list[TeacherAssessmentReportOut]

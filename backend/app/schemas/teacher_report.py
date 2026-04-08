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


class TeacherStudentReportRow(BaseModel):
    student_id: int
    student_name: str
    student_email: str | None = None
    total_assessments: int
    pending_reports: int
    generated_reports: int
    average_score_percent: float
    latest_activity_at: datetime | None = None


class TeacherStudentReportTableResponse(BaseModel):
    students: list[TeacherStudentReportRow]


class TeacherModuleSummary(BaseModel):
    module_id: int
    module_title: str
    assessments_taken: int
    right_count: int
    wrong_count: int
    total_items: int
    score_percent: float


class TeacherImprovementAreaItem(BaseModel):
    area: str
    count: int


class TeacherGeneratedStudentReport(BaseModel):
    student_id: int
    student_name: str
    student_email: str | None = None
    generated_at: datetime
    total_assessments: int
    pending_reports_before_generate: int
    total_right: int
    total_wrong: int
    total_items: int
    overall_score_percent: float
    modules: list[TeacherModuleSummary]
    top_improvement_areas: list[TeacherImprovementAreaItem]

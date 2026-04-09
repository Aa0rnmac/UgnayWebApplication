from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


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


class TeacherActivityAttemptItemOut(BaseModel):
    id: int
    item_key: str
    prompt: str | None = None
    expected_answer: str | None = None
    student_answer: str | None = None
    is_correct: bool | None = None
    confidence: float | None = None
    ai_metadata: dict = Field(default_factory=dict)


class TeacherActivityAttemptOut(BaseModel):
    id: int
    student_id: int
    student_name: str
    module_id: int
    module_title: str
    activity_id: int
    activity_key: str
    activity_title: str
    activity_type: str
    right_count: int
    wrong_count: int
    total_items: int
    score_percent: float
    improvement_areas: list[str] = Field(default_factory=list)
    ai_metadata: dict = Field(default_factory=dict)
    submitted_at: datetime
    items: list[TeacherActivityAttemptItemOut] = Field(default_factory=list)


class TeacherWeakItemOut(BaseModel):
    module_id: int
    module_title: str
    activity_key: str
    activity_title: str
    item_key: str
    prompt: str | None = None
    expected_answer: str | None = None
    wrong_count: int
    attempt_count: int
    wrong_rate_percent: float


class TeacherAttentionStudentOut(BaseModel):
    student_id: int
    student_name: str
    student_email: str | None = None
    batch_id: int | None = None
    batch_name: str | None = None
    attempt_count: int
    average_score_percent: float
    low_score_count: int
    latest_attempt_at: datetime


class TeacherConcernAttemptOut(BaseModel):
    attempt_id: int
    student_id: int
    student_name: str
    batch_id: int | None = None
    batch_name: str | None = None
    module_id: int
    module_title: str
    activity_key: str
    activity_title: str
    score_percent: float
    low_confidence_item_count: int
    submitted_at: datetime


class TeacherReportSummaryOut(BaseModel):
    batch_id: int | None = None
    module_id: int | None = None
    registered_student_count: int
    total_students: int
    total_attempts: int
    average_score_percent: float
    weak_items: list[TeacherWeakItemOut] = Field(default_factory=list)
    students_needing_attention: list[TeacherAttentionStudentOut] = Field(default_factory=list)
    recent_concern_attempts: list[TeacherConcernAttemptOut] = Field(default_factory=list)


class TeacherBreakdownModuleMetricOut(BaseModel):
    module_id: int
    module_title: str
    count: int


class TeacherBatchBreakdownRowOut(BaseModel):
    student_id: int
    student_name: str
    average_score_percent: float
    highest_correct_module: TeacherBreakdownModuleMetricOut | None = None
    highest_incorrect_module: TeacherBreakdownModuleMetricOut | None = None


class TeacherModuleBreakdownRowOut(BaseModel):
    batch_id: int | None = None
    batch_name: str
    average_score_percent: float
    correct_answers: int
    incorrect_answers: int


class TeacherBatchBreakdownResponse(BaseModel):
    mode: Literal["batch"]
    batch_id: int
    batch_name: str | None = None
    rows: list[TeacherBatchBreakdownRowOut] = Field(default_factory=list)


class TeacherModuleBreakdownResponse(BaseModel):
    mode: Literal["module"]
    module_id: int
    module_title: str | None = None
    rows: list[TeacherModuleBreakdownRowOut] = Field(default_factory=list)


TeacherReportBreakdownResponse = TeacherBatchBreakdownResponse | TeacherModuleBreakdownResponse

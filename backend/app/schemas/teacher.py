from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.module import LessonOut


class TeacherModuleCatalogItem(BaseModel):
    id: int
    slug: str
    title: str
    description: str
    order_index: int
    lessons: list[LessonOut] = Field(default_factory=list)
    is_placeholder: bool = False


class TeacherBatchStudent(BaseModel):
    user_id: int
    username: str
    full_name: str
    email: str | None = None


class TeacherBatchOverview(BaseModel):
    id: int
    name: str
    current_week_number: int
    student_count: int
    students: list[TeacherBatchStudent] = Field(default_factory=list)


class TeacherBatchUpdateRequest(BaseModel):
    current_week_number: int = Field(ge=1, le=52)


class TeacherModuleRosterSummary(BaseModel):
    module_id: int
    module_slug: str
    module_title: str
    total_students: int
    in_progress_students: int
    completed_students: int
    completion_rate_percent: float
    average_progress_percent: float
    average_assessment_score: float | None = None


class TeacherStudentModuleProgress(BaseModel):
    user_id: int
    username: str
    status: str
    progress_percent: int
    completed_lessons_count: int
    assessment_score: float | None = None
    updated_at: datetime


class TeacherStudentProgressList(BaseModel):
    module_id: int
    module_slug: str
    module_title: str
    students: list[TeacherStudentModuleProgress]


class TeacherAssessmentDistributionBucket(BaseModel):
    label: str
    count: int


class TeacherAssessmentMetrics(BaseModel):
    module_id: int
    module_slug: str
    module_title: str
    total_students_with_scores: int
    average_score: float | None = None
    min_score: float | None = None
    max_score: float | None = None
    passing_score_threshold: float
    passing_count: int
    passing_rate_percent: float
    distribution: list[TeacherAssessmentDistributionBucket]


class TeacherAnalyticsSummary(BaseModel):
    filtered_attempts: int
    filtered_students: int
    average_score: float | None = None
    support_queue_count: int
    on_track_count: int
    assessment_ready_count: int
    snapshot_evidence_count: int
    latest_attempted_at: datetime | None = None
    low_score_threshold: float
    ready_score_threshold: float


class TeacherWrongItemStat(BaseModel):
    module_id: int
    module_title: str
    assessment_id: str
    assessment_title: str
    assessment_type: str
    assessment_item_id: str
    prompt: str
    expected_response: str | None = None
    miss_count: int
    appearance_count: int
    miss_rate_percent: float
    unique_student_count: int
    latest_submitted_at: datetime | None = None


class TeacherLowScoringStudent(BaseModel):
    user_id: int
    username: str
    full_name: str
    batch_id: int | None = None
    batch_name: str | None = None
    attempt_count: int
    average_score: float
    latest_score: float
    latest_module_id: int
    latest_module_title: str
    latest_assessment_title: str
    latest_submitted_at: datetime


class TeacherRecentAttempt(BaseModel):
    attempt_id: int
    user_id: int
    username: str
    full_name: str
    batch_id: int | None = None
    batch_name: str | None = None
    module_id: int
    module_title: str
    assessment_id: str
    assessment_title: str
    assessment_type: str
    score_percent: float
    score_correct: int
    score_total: int
    wrong_answer_count: int
    snapshot_count: int
    submitted_at: datetime


class TeacherSnapshotEvidence(BaseModel):
    attempt_id: int
    user_id: int
    username: str
    full_name: str
    batch_id: int | None = None
    batch_name: str | None = None
    module_id: int
    module_title: str
    assessment_title: str
    assessment_type: str
    assessment_item_id: str
    label: str | None = None
    prompt: str | None = None
    expected_response: str | None = None
    response_text: str | None = None
    is_correct: bool | None = None
    image_path: str
    submitted_at: datetime


class TeacherInterventionSuggestion(BaseModel):
    priority: str
    title: str
    rationale: str
    suggested_action: str


class TeacherAnalyticsOverview(BaseModel):
    summary: TeacherAnalyticsSummary
    wrong_items: list[TeacherWrongItemStat] = Field(default_factory=list)
    low_scoring_students: list[TeacherLowScoringStudent] = Field(default_factory=list)
    recent_attempts: list[TeacherRecentAttempt] = Field(default_factory=list)
    snapshot_evidence: list[TeacherSnapshotEvidence] = Field(default_factory=list)
    intervention_suggestions: list[TeacherInterventionSuggestion] = Field(default_factory=list)

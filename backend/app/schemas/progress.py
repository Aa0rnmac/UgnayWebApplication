from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProgressUpdateRequest(BaseModel):
    completed_lesson_id: str | None = None
    assessment_score: float | None = Field(default=None, ge=0, le=100)
    mark_completed: bool = False


class AssessmentAttemptAnswerIn(BaseModel):
    assessment_item_id: str = Field(min_length=1, max_length=120)
    prompt: str = Field(min_length=1, max_length=500)
    response_text: str | None = Field(default=None, max_length=500)
    expected_response: str | None = Field(default=None, max_length=500)
    is_correct: bool


class AssessmentAttemptSnapshotIn(BaseModel):
    assessment_item_id: str = Field(min_length=1, max_length=120)
    label: str | None = Field(default=None, max_length=200)
    image_data_url: str = Field(min_length=30)


class AssessmentAttemptCreateRequest(BaseModel):
    assessment_id: str = Field(min_length=1, max_length=120)
    assessment_title: str = Field(min_length=1, max_length=200)
    assessment_type: str = Field(min_length=1, max_length=60)
    score_percent: float = Field(ge=0, le=100)
    score_correct: int = Field(ge=0)
    score_total: int = Field(ge=1)
    answers: list[AssessmentAttemptAnswerIn] = Field(default_factory=list)
    snapshots: list[AssessmentAttemptSnapshotIn] = Field(default_factory=list, max_length=20)


class AssessmentAttemptAnswerOut(BaseModel):
    assessment_item_id: str
    prompt: str
    response_text: str | None = None
    expected_response: str | None = None
    is_correct: bool


class AssessmentAttemptSnapshotOut(BaseModel):
    assessment_item_id: str
    label: str | None = None
    image_path: str


class AssessmentAttemptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    module_id: int
    assessment_id: str
    assessment_title: str
    assessment_type: str
    score_percent: float
    score_correct: int
    score_total: int
    answers: list[AssessmentAttemptAnswerOut] = Field(default_factory=list)
    snapshots: list[AssessmentAttemptSnapshotOut] = Field(default_factory=list)
    submitted_at: datetime


class ProgressSummaryOut(BaseModel):
    completed_modules: int
    total_modules: int
    overall_progress_percent: float


class TeacherProgressModuleStatOut(BaseModel):
    module_id: int
    module_slug: str
    module_title: str
    learners_started: int
    learners_completed: int
    completion_percent: float
    average_progress_percent: float


class TeacherProgressLearnerStatOut(BaseModel):
    learner_id: int
    learner_username: str
    completed_modules: int
    total_modules: int
    completion_percent: float
    overall_progress_percent: float
    is_active: bool


class TeacherProgressPaginationOut(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


class TeacherProgressOverviewOut(BaseModel):
    completed_modules_percent: float
    average_progress_percent: float
    active_learners: int
    total_learners: int
    modules: list[TeacherProgressModuleStatOut] | None = None
    learners: list[TeacherProgressLearnerStatOut] | None = None
    learners_pagination: TeacherProgressPaginationOut | None = None

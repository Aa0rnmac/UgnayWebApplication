from pydantic import BaseModel, Field


class ProgressUpdateRequest(BaseModel):
    completed_lesson_id: str | None = None
    assessment_score: float | None = Field(default=None, ge=0, le=100)
    mark_completed: bool = False


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

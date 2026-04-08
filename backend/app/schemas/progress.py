from pydantic import BaseModel, Field


class ProgressUpdateRequest(BaseModel):
    completed_lesson_id: str | None = None
    assessment_id: str | None = Field(default=None, max_length=120)
    assessment_score: float | None = Field(default=None, ge=0, le=100)
    assessment_right: int | None = Field(default=None, ge=0)
    assessment_wrong: int | None = Field(default=None, ge=0)
    assessment_total: int | None = Field(default=None, ge=0)
    assessment_title: str | None = Field(default=None, max_length=255)
    improvement_areas: list[str] | None = None
    mark_completed: bool = False


class ProgressSummaryOut(BaseModel):
    completed_modules: int
    total_modules: int
    overall_progress_percent: float

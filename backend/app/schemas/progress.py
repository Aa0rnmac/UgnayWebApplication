from pydantic import BaseModel, Field


class ProgressUpdateRequest(BaseModel):
    completed_lesson_id: str | None = None
    assessment_score: float | None = Field(default=None, ge=0, le=100)
    mark_completed: bool = False


class ProgressSummaryOut(BaseModel):
    completed_modules: int
    total_modules: int
    overall_progress_percent: float


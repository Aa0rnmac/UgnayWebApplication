from pydantic import BaseModel, ConfigDict, Field

from app.schemas.progress import AssessmentAttemptOut


class LessonReferenceOut(BaseModel):
    id: str
    title: str
    image_url: str
    source_url: str
    credit: str | None = None
    license: str | None = None
    letters: list[str] = Field(default_factory=list)


class LessonOut(BaseModel):
    id: str
    title: str
    content: str
    references: list[LessonReferenceOut] = Field(default_factory=list)


class AssessmentOut(BaseModel):
    id: str
    question: str
    choices: list[str]
    answer: str


class ModuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    title: str
    description: str
    order_index: int
    lessons: list[LessonOut]
    assessments: list[AssessmentOut]
    is_locked: bool
    status: str
    progress_percent: int
    completed_lessons: list[str] = Field(default_factory=list)
    assessment_score: float | None = None
    latest_assessment_attempt: AssessmentAttemptOut | None = None

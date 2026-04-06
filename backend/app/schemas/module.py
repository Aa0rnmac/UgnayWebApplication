from pydantic import BaseModel, ConfigDict


class LessonOut(BaseModel):
    id: str
    title: str
    content: str


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
    assessment_score: float | None = None


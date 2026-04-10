from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ModuleTeacherSummaryOut(BaseModel):
    id: int
    username: str
    full_name: str
    email: str | None = None


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


class ModuleActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    activity_key: str
    title: str
    activity_type: str
    order_index: int
    instructions: str | None = None
    definition: dict[str, Any] = Field(default_factory=dict)
    is_published: bool = True


class ActivityAttemptItemCreate(BaseModel):
    item_key: str = Field(min_length=1, max_length=120)
    prompt: str | None = None
    expected_answer: str | None = None
    student_answer: str | None = None
    is_correct: bool | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    ai_metadata: dict[str, Any] = Field(default_factory=dict)


class ActivityAttemptCreate(BaseModel):
    right_count: int = Field(ge=0)
    wrong_count: int = Field(ge=0)
    total_items: int = Field(ge=0)
    score_percent: float = Field(ge=0, le=100)
    improvement_areas: list[str] = Field(default_factory=list)
    ai_metadata: dict[str, Any] = Field(default_factory=dict)
    source: str = Field(default="api", max_length=30)
    notes: str | None = Field(default=None, max_length=2000)
    items: list[ActivityAttemptItemCreate] = Field(default_factory=list)
    completed_lesson_id: str | None = Field(default=None, max_length=120)
    mark_module_completed: bool = False

    @model_validator(mode="after")
    def validate_counts(self) -> "ActivityAttemptCreate":
        if self.right_count + self.wrong_count != self.total_items:
            raise ValueError("right_count + wrong_count must equal total_items.")
        if self.items and len(self.items) != self.total_items:
            raise ValueError("items length must match total_items when item answers are provided.")
        return self


class ActivityAttemptItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_key: str
    prompt: str | None = None
    expected_answer: str | None = None
    student_answer: str | None = None
    is_correct: bool | None = None
    confidence: float | None = None
    ai_metadata: dict[str, Any] = Field(default_factory=dict)


class ActivityAttemptOut(BaseModel):
    id: int
    module_id: int
    module_activity_id: int
    activity_key: str
    activity_title: str
    activity_type: str
    right_count: int
    wrong_count: int
    total_items: int
    score_percent: float
    improvement_areas: list[str] = Field(default_factory=list)
    ai_metadata: dict[str, Any] = Field(default_factory=dict)
    source: str
    items: list[ActivityAttemptItemOut] = Field(default_factory=list)
    progress: "ModuleOut"


class ModuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    title: str
    description: str
    order_index: int
    module_kind: str = "system"
    owner_teacher: ModuleTeacherSummaryOut | None = None
    is_shared_pool: bool = False
    source_module_id: int | None = None
    cover_image_url: str | None = None
    lessons: list[LessonOut]
    assessments: list[AssessmentOut]
    activities: list[ModuleActivityOut] = Field(default_factory=list)
    is_locked: bool
    is_published: bool = True
    status: str
    progress_percent: int
    assessment_score: float | None = None


ActivityAttemptOut.model_rebuild()

from datetime import datetime

from pydantic import BaseModel


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

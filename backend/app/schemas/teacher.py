from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.registration import RegistrationOut


class TeacherUserSummary(BaseModel):
    id: int
    username: str
    full_name: str
    email: str | None = None


class TeacherBatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    status: Literal["active", "archived"]
    start_date: date | None = None
    end_date: date | None = None
    capacity: int | None = None
    notes: str | None = None
    student_count: int = 0
    created_at: datetime | None = None


class TeacherBatchCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=2, max_length=160)
    status: Literal["active", "archived"] = "active"
    start_date: date | None = None
    end_date: date | None = None
    capacity: int | None = Field(default=None, ge=1)
    notes: str | None = Field(default=None, max_length=2000)


class TeacherStudentModuleProgressOut(BaseModel):
    module_id: int
    module_title: str
    status: str
    progress_percent: int
    assessment_score: float | None = None
    updated_at: datetime


class TeacherStudentOut(BaseModel):
    id: int
    username: str
    full_name: str
    email: str | None = None
    phone_number: str | None = None
    address: str | None = None
    birth_date: date | None = None
    role: str
    enrollment_status: str | None = None
    batch: TeacherBatchOut | None = None
    module_progress: list[TeacherStudentModuleProgressOut] = Field(default_factory=list)


class TeacherEnrollmentOut(BaseModel):
    id: int
    status: str
    payment_review_status: str
    review_notes: str | None = None
    reviewed_at: datetime | None = None
    approved_at: datetime | None = None
    rejected_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    registration: RegistrationOut
    batch: TeacherBatchOut | None = None
    student: TeacherUserSummary | None = None


class TeacherEnrollmentApprovalResultOut(BaseModel):
    enrollment: TeacherEnrollmentOut
    issued_username: str
    temporary_password: str
    delivery_status: Literal["sent", "skipped"]
    delivery_message: str
    recipient_email: str


class TeacherEnrollmentApproveRequest(BaseModel):
    batch_id: int | None = Field(default=None, ge=1)
    batch_code: str | None = Field(default=None, max_length=60)
    batch_name: str | None = Field(default=None, max_length=160)
    issued_username: str | None = Field(default=None, min_length=3, max_length=120)
    temporary_password: str | None = Field(default=None, min_length=8, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    send_email: bool = True


class TeacherEnrollmentRejectRequest(BaseModel):
    notes: str = Field(min_length=1, max_length=2000)

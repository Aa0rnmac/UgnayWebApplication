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
    primary_teacher: TeacherUserSummary | None = None
    created_at: datetime | None = None


class TeacherBatchCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=60)
    name: str = Field(min_length=2, max_length=160)
    status: Literal["active", "archived"] = "active"
    start_date: date | None = None
    end_date: date | None = None
    capacity: int | None = Field(default=None, ge=1)
    notes: str | None = Field(default=None, max_length=2000)


class TeacherPresenceOut(BaseModel):
    teacher: TeacherUserSummary
    status: Literal["online", "offline"]
    updated_at: datetime


class TeacherPresenceUpdateRequest(BaseModel):
    status: Literal["online", "offline"]


class TeacherHandlingSessionOut(BaseModel):
    id: int
    status: Literal["active", "ended"]
    started_at: datetime
    ended_at: datetime | None = None
    teacher: TeacherUserSummary
    batch: TeacherBatchOut | None = None
    student: TeacherUserSummary | None = None


class TeacherHandlingSessionCreateRequest(BaseModel):
    batch_id: int | None = Field(default=None, ge=1)
    student_id: int | None = Field(default=None, ge=1)


class TeacherModuleCardOut(BaseModel):
    id: int
    slug: str
    title: str
    description: str
    order_index: int
    module_kind: Literal["system", "teacher_custom"]
    is_published: bool
    is_shared_pool: bool
    source_module_id: int | None = None
    source_module_title: str | None = None
    cover_image_url: str | None = None
    archived_at: datetime | None = None
    owner_teacher: TeacherUserSummary | None = None
    lesson_count: int
    activity_count: int


class TeacherModulesCatalogOut(BaseModel):
    managed_student_count: int = 0
    my_modules: list[TeacherModuleCardOut] = Field(default_factory=list)
    shared_pool: list[TeacherModuleCardOut] = Field(default_factory=list)
    system_templates: list[TeacherModuleCardOut] = Field(default_factory=list)


class TeacherModuleCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=2, max_length=4000)


class TeacherModuleUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, min_length=2, max_length=4000)
    is_published: bool | None = None
    is_shared_pool: bool | None = None


class TeacherStudentModuleProgressOut(BaseModel):
    module_id: int
    module_title: str
    module_kind: str = "system"
    owner_teacher: TeacherUserSummary | None = None
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
    resolved_teacher: TeacherUserSummary | None = None
    active_handling_session: TeacherHandlingSessionOut | None = None
    module_progress: list[TeacherStudentModuleProgressOut] = Field(default_factory=list)


class TeacherStudentCertificateModuleOut(BaseModel):
    module_id: int
    module_title: str
    order_index: int
    completed: bool
    latest_score: float | None = None
    best_score: float | None = None
    certificate_score_used: float | None = None
    passed: bool


class TeacherStudentCertificateSummaryOut(BaseModel):
    target_required_modules: int
    effective_required_modules: int
    completed_required_modules: int
    average_best_score: float
    eligible: bool
    reason: str


class TeacherStudentCertificateRecordOut(BaseModel):
    status: Literal["approved", "rejected"]
    decision_note: str | None = None
    decided_at: datetime
    decided_by_name: str
    issued_at: datetime | None = None
    certificate_reference: str


class TeacherStudentCertificateTemplateOut(BaseModel):
    student_name: str
    certificate_title: str
    completion_statement: str
    issue_date: datetime
    approving_teacher_name: str
    certificate_reference: str
    effective_required_modules: int
    completed_required_modules: int
    average_best_score: float


class TeacherStudentCertificateOut(BaseModel):
    student_id: int
    student_name: str
    modules: list[TeacherStudentCertificateModuleOut] = Field(default_factory=list)
    summary: TeacherStudentCertificateSummaryOut
    record: TeacherStudentCertificateRecordOut | None = None
    template: TeacherStudentCertificateTemplateOut | None = None


class TeacherStudentCertificateDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]
    note: str | None = Field(default=None, max_length=2000)


class TeacherCertificateHistoryItemOut(BaseModel):
    id: int
    student: TeacherUserSummary
    batch: TeacherBatchOut | None = None
    status: Literal["approved", "rejected"]
    certificate_reference: str
    decision_note: str | None = None
    decided_at: datetime
    decided_by_name: str
    issued_at: datetime | None = None


class TeacherEnrollmentOut(BaseModel):
    id: int
    status: str
    payment_review_status: str
    review_notes: str | None = None
    rejection_reason_code: Literal["incorrect_amount_paid", "incorrect_information"] | None = None
    rejection_reason_detail: str | None = None
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


class TeacherEnrollmentRejectionResultOut(BaseModel):
    enrollment: TeacherEnrollmentOut
    delivery_status: Literal["sent", "skipped", "failed"]
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
    internal_note: str | None = Field(default=None, max_length=2000)
    rejection_reason_code: Literal["incorrect_amount_paid", "incorrect_information"]
    rejection_reason_detail: str | None = Field(default=None, max_length=2000)

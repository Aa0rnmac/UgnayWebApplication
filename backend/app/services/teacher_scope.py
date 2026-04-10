from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.batch import Batch
from app.models.enrollment import Enrollment
from app.models.teacher_handling_session import TeacherHandlingSession
from app.models.user import User
from app.services.teacher_context import approved_enrollment_for_student


@dataclass
class TeacherStudentScope:
    enrollment: Enrollment | None
    active_session: TeacherHandlingSession | None

    @property
    def batch(self) -> Batch | None:
        if self.enrollment is None:
            return None
        return self.enrollment.batch


def teacher_has_global_access(current_teacher: User) -> bool:
    return current_teacher.role == "admin"


def teacher_owns_batch(current_teacher: User, batch: Batch | None) -> bool:
    return batch is not None and batch.primary_teacher_id == current_teacher.id


def ensure_teacher_can_access_batch(
    *,
    current_teacher: User,
    batch: Batch,
    detail: str = "Batch not found.",
) -> Batch:
    if teacher_has_global_access(current_teacher) or teacher_owns_batch(current_teacher, batch):
        return batch
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def ensure_teacher_can_assign_batch(
    db: Session,
    *,
    current_teacher: User,
    batch: Batch,
    detail: str = "Batch not found.",
) -> Batch:
    if teacher_has_global_access(current_teacher) or teacher_owns_batch(current_teacher, batch):
        return batch
    if batch.primary_teacher_id is None:
        batch.primary_teacher_id = current_teacher.id
        db.add(batch)
        db.flush()
        return batch
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def teacher_can_access_enrollment(current_teacher: User, enrollment: Enrollment) -> bool:
    if teacher_has_global_access(current_teacher):
        return True

    if enrollment.status == "pending":
        return True
    if enrollment.status == "approved":
        return teacher_owns_batch(current_teacher, enrollment.batch)
    if enrollment.status == "rejected":
        return enrollment.rejected_by_user_id == current_teacher.id
    return False


def ensure_teacher_can_access_enrollment(
    *,
    current_teacher: User,
    enrollment: Enrollment,
    detail: str = "Enrollment not found.",
) -> Enrollment:
    if teacher_can_access_enrollment(current_teacher, enrollment):
        return enrollment
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def resolve_teacher_student_scope(
    db: Session,
    *,
    current_teacher: User,
    student: User,
) -> TeacherStudentScope:
    enrollment = approved_enrollment_for_student(db, student.id)
    batch_id = enrollment.batch_id if enrollment is not None else None

    active_session_query = db.query(TeacherHandlingSession).filter(
        TeacherHandlingSession.teacher_id == current_teacher.id,
        TeacherHandlingSession.status == "active",
        TeacherHandlingSession.ended_at.is_(None),
    )

    session_filters = [TeacherHandlingSession.student_id == student.id]
    if batch_id is not None:
        session_filters.append(
            and_(
                TeacherHandlingSession.student_id.is_(None),
                TeacherHandlingSession.batch_id == batch_id,
            )
        )

    active_session = (
        active_session_query
        .filter(or_(*session_filters))
        .order_by(TeacherHandlingSession.started_at.desc(), TeacherHandlingSession.id.desc())
        .first()
    )

    return TeacherStudentScope(enrollment=enrollment, active_session=active_session)


def teacher_can_view_student(current_teacher: User, scope: TeacherStudentScope) -> bool:
    return (
        teacher_has_global_access(current_teacher)
        or teacher_owns_batch(current_teacher, scope.batch)
        or scope.active_session is not None
    )


def ensure_teacher_can_view_student(
    *,
    current_teacher: User,
    scope: TeacherStudentScope,
    detail: str = "Student not found.",
) -> TeacherStudentScope:
    if teacher_can_view_student(current_teacher, scope):
        return scope
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def teacher_can_decide_certificate(current_teacher: User, scope: TeacherStudentScope) -> bool:
    return teacher_has_global_access(current_teacher) or teacher_owns_batch(current_teacher, scope.batch)


def ensure_teacher_can_decide_certificate(
    *,
    current_teacher: User,
    scope: TeacherStudentScope,
    detail: str = "Student not found.",
) -> TeacherStudentScope:
    if teacher_can_decide_certificate(current_teacher, scope):
        return scope
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def teacher_can_access_performance_record(
    *,
    current_teacher: User,
    enrollment: Enrollment | None,
    handled_by_teacher_id: int | None,
) -> bool:
    return (
        teacher_has_global_access(current_teacher)
        or handled_by_teacher_id == current_teacher.id
        or teacher_owns_batch(current_teacher, enrollment.batch if enrollment is not None else None)
    )

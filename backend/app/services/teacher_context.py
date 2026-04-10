from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session, joinedload

from app.models.enrollment import Enrollment
from app.models.teacher_handling_session import TeacherHandlingSession
from app.models.user import User


@dataclass
class StudentTeacherContext:
    teacher: User | None
    session: TeacherHandlingSession | None
    enrollment: Enrollment | None


def approved_enrollment_for_student(db: Session, student_id: int) -> Enrollment | None:
    return (
        db.query(Enrollment)
        .options(joinedload(Enrollment.batch))
        .filter(Enrollment.user_id == student_id, Enrollment.status == "approved")
        .order_by(Enrollment.approved_at.desc(), Enrollment.id.desc())
        .first()
    )


def active_teacher_session_for_student(
    db: Session,
    *,
    student_id: int,
    batch_id: int | None,
) -> TeacherHandlingSession | None:
    student_session = (
        db.query(TeacherHandlingSession)
        .options(
            joinedload(TeacherHandlingSession.teacher),
            joinedload(TeacherHandlingSession.batch),
            joinedload(TeacherHandlingSession.student),
        )
        .filter(
            TeacherHandlingSession.status == "active",
            TeacherHandlingSession.ended_at.is_(None),
            TeacherHandlingSession.student_id == student_id,
        )
        .order_by(TeacherHandlingSession.started_at.desc(), TeacherHandlingSession.id.desc())
        .first()
    )
    if student_session is not None:
        return student_session
    if batch_id is None:
        return None
    return (
        db.query(TeacherHandlingSession)
        .options(
            joinedload(TeacherHandlingSession.teacher),
            joinedload(TeacherHandlingSession.batch),
            joinedload(TeacherHandlingSession.student),
        )
        .filter(
            TeacherHandlingSession.status == "active",
            TeacherHandlingSession.ended_at.is_(None),
            TeacherHandlingSession.student_id.is_(None),
            TeacherHandlingSession.batch_id == batch_id,
        )
        .order_by(TeacherHandlingSession.started_at.desc(), TeacherHandlingSession.id.desc())
        .first()
    )


def resolve_teacher_context_for_student(db: Session, student: User) -> StudentTeacherContext:
    enrollment = approved_enrollment_for_student(db, student.id)
    batch = enrollment.batch if enrollment is not None else None
    batch_id = batch.id if batch is not None else None
    session = active_teacher_session_for_student(db, student_id=student.id, batch_id=batch_id)
    if session is not None:
        return StudentTeacherContext(teacher=session.teacher, session=session, enrollment=enrollment)
    teacher = batch.primary_teacher if batch is not None else None
    return StudentTeacherContext(teacher=teacher, session=None, enrollment=enrollment)

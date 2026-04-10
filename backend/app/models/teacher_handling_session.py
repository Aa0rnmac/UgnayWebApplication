from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TeacherHandlingSession(Base):
    __tablename__ = "teacher_handling_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    batch_id: Mapped[int | None] = mapped_column(
        ForeignKey("batches.id", ondelete="SET NULL"), nullable=True, index=True
    )
    student_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active", server_default="active"
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    teacher = relationship(
        "User",
        back_populates="started_handling_sessions",
        foreign_keys=[teacher_id],
    )
    batch = relationship("Batch", back_populates="handling_sessions")
    student = relationship(
        "User",
        back_populates="student_handling_sessions",
        foreign_keys=[student_id],
    )
    attempts = relationship("ActivityAttempt", back_populates="handling_session")
    assessment_reports = relationship("AssessmentReport", back_populates="handling_session")

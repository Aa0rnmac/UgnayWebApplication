from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ActivityAttempt(Base):
    __tablename__ = "activity_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    module_id: Mapped[int] = mapped_column(
        ForeignKey("modules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    module_activity_id: Mapped[int] = mapped_column(
        ForeignKey("module_activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    module_owner_teacher_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    handled_by_teacher_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    handling_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("teacher_handling_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    activity_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    activity_title: Mapped[str] = mapped_column(String(255), nullable=False)
    activity_type: Mapped[str] = mapped_column(String(60), nullable=False)
    right_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    wrong_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    improvement_areas: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    ai_metadata: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    source: Mapped[str] = mapped_column(
        String(30), nullable=False, default="api", server_default="api"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship("User", back_populates="activity_attempts", foreign_keys=[user_id])
    module = relationship("Module", back_populates="activity_attempts")
    module_activity = relationship("ModuleActivity", back_populates="attempts")
    module_owner_teacher = relationship(
        "User",
        back_populates="module_owned_activity_attempts",
        foreign_keys=[module_owner_teacher_id],
    )
    handled_by_teacher = relationship(
        "User",
        back_populates="handled_activity_attempts",
        foreign_keys=[handled_by_teacher_id],
    )
    handling_session = relationship("TeacherHandlingSession", back_populates="attempts")
    items = relationship(
        "ActivityAttemptItem",
        back_populates="attempt",
        cascade="all, delete-orphan",
        order_by="ActivityAttemptItem.id.asc()",
    )


class ActivityAttemptItem(Base):
    __tablename__ = "activity_attempt_items"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("activity_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    student_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    ai_metadata: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    attempt = relationship("ActivityAttempt", back_populates="items")

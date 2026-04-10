from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AssessmentReport(Base):
    __tablename__ = "assessment_reports"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), nullable=False, index=True)
    module_owner_teacher_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    handled_by_teacher_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    handling_session_id: Mapped[int | None] = mapped_column(
        ForeignKey("teacher_handling_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    module_title: Mapped[str] = mapped_column(String(255), nullable=False)
    assessment_id: Mapped[str] = mapped_column(String(120), nullable=False)
    assessment_title: Mapped[str] = mapped_column(String(255), nullable=False)
    right_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    wrong_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    improvement_areas: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued", server_default="queued")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship("User", back_populates="assessment_reports", foreign_keys=[user_id])
    module = relationship("Module", back_populates="assessment_reports", foreign_keys=[module_id])
    module_owner_teacher = relationship(
        "User",
        back_populates="module_owned_assessment_reports",
        foreign_keys=[module_owner_teacher_id],
    )
    handled_by_teacher = relationship(
        "User",
        back_populates="handled_assessment_reports",
        foreign_keys=[handled_by_teacher_id],
    )
    handling_session = relationship("TeacherHandlingSession", back_populates="assessment_reports")

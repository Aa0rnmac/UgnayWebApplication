from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserModuleProgress(Base):
    __tablename__ = "user_module_progress"
    __table_args__ = (UniqueConstraint("user_id", "module_id", name="uq_user_module"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    module_id: Mapped[int] = mapped_column(
        ForeignKey("modules.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="locked")
    progress_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_lessons: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    completed_assessments: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    assessment_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    assessment_right_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assessment_wrong_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assessment_total_items: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assessment_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    improvement_areas: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    report_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user = relationship("User", back_populates="progress_entries")
    module = relationship("Module", back_populates="progress_entries")

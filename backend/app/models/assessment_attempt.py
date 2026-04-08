from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserAssessmentAttempt(Base):
    __tablename__ = "user_assessment_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    assessment_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    assessment_title: Mapped[str] = mapped_column(String(200), nullable=False)
    assessment_type: Mapped[str] = mapped_column(String(60), nullable=False)
    score_percent: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    score_correct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    answers: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    snapshots: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship("User", back_populates="assessment_attempts")
    module = relationship("Module", back_populates="assessment_attempts")

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class StudentCertificate(Base):
    __tablename__ = "student_certificates"
    __table_args__ = (UniqueConstraint("student_id", name="uq_student_certificates_student"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    certificate_reference: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    snapshot_target_required_modules: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    snapshot_effective_required_modules: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    snapshot_completed_required_modules: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    snapshot_average_best_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    snapshot_module_details: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    student = relationship("User", foreign_keys=[student_id])
    decided_by = relationship("User", foreign_keys=[decided_by_user_id])

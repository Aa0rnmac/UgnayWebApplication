from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Module(Base):
    __tablename__ = "modules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    lessons: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    assessments: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    module_kind: Mapped[str] = mapped_column(
        String(20), nullable=False, default="system", server_default="system", index=True
    )
    owner_teacher_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_module_id: Mapped[int | None] = mapped_column(
        ForeignKey("modules.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_shared_pool: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    cover_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    progress_entries = relationship(
        "UserModuleProgress", back_populates="module", cascade="all, delete-orphan"
    )
    activities = relationship(
        "ModuleActivity",
        back_populates="module",
        cascade="all, delete-orphan",
        order_by="ModuleActivity.order_index.asc()",
    )
    activity_attempts = relationship(
        "ActivityAttempt",
        back_populates="module",
        cascade="all, delete-orphan",
    )
    assessment_reports = relationship(
        "AssessmentReport",
        back_populates="module",
        cascade="all, delete-orphan",
    )
    owner_teacher = relationship("User", foreign_keys=[owner_teacher_id], back_populates="owned_modules")
    source_module = relationship(
        "Module",
        remote_side="Module.id",
        foreign_keys=[source_module_id],
        back_populates="copied_modules",
    )
    copied_modules = relationship("Module", back_populates="source_module")


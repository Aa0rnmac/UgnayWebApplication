from sqlalchemy import JSON, Boolean, Integer, String, Text
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
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

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


from datetime import datetime
from typing import Literal

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Literal["student", "teacher", "admin"]] = mapped_column(
        String(20), nullable=False, server_default="student"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    progress_entries = relationship(
        "UserModuleProgress", back_populates="user", cascade="all, delete-orphan"
    )

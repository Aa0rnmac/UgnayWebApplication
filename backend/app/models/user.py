from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    middle_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    phone_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    profile_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="student", server_default="student"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    password_reset_otps = relationship(
        "PasswordResetOtp", back_populates="user", cascade="all, delete-orphan"
    )
    progress_entries = relationship(
        "UserModuleProgress", back_populates="user", cascade="all, delete-orphan"
    )
    enrollments = relationship(
        "Enrollment",
        back_populates="user",
        foreign_keys="Enrollment.user_id",
    )
    activity_attempts = relationship(
        "ActivityAttempt",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    created_batches = relationship(
        "Batch",
        back_populates="created_by",
        foreign_keys="Batch.created_by_user_id",
    )

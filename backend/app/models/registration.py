from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Registration(Base):
    __tablename__ = "registrations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    phone_number: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_number: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    reference_image_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    requested_batch_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    validated_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    linked_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("batches.id"), nullable=True)
    issued_username: Mapped[str | None] = mapped_column(String(120), nullable=True)
    credential_email_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    credential_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    credential_email_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    linked_user = relationship("User")
    batch = relationship("Batch", back_populates="registrations")

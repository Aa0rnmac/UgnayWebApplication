from datetime import date, datetime
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

EMAIL_PATTERN = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
PHONE_PATTERN = re.compile(r"^09\d{9}$")
PASSWORD_PATTERN = re.compile(r"^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$")


def _normalize_phone(value: str) -> str:
    return re.sub(r"\D+", "", value)


class RegistrationCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    middle_name: str | None = Field(default=None, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    birth_date: date
    address: str = Field(min_length=1, max_length=1000)
    email: str = Field(min_length=5, max_length=255)
    phone_number: str = Field(min_length=1, max_length=40)
    reference_number: str = Field(min_length=1, max_length=120)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        trimmed = value.strip()
        if not EMAIL_PATTERN.match(trimmed):
            raise ValueError(
                "Email must be in a valid format (example: name@gmail.com, name@hotmail.com, name@yahoo.com)."
            )
        return trimmed.lower()

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        normalized = _normalize_phone(value)
        if not PHONE_PATTERN.match(normalized):
            raise ValueError(
                "Phone number must start with 09 and contain exactly 11 digits (example: 09123456789)."
            )
        return normalized


class RegistrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    middle_name: str | None
    last_name: str
    birth_date: date | None
    address: str | None
    email: str
    phone_number: str
    reference_number: str
    reference_image_path: str | None
    status: str
    validated_at: datetime | None
    validated_by: str | None
    linked_user_id: int | None
    issued_username: str | None
    enrollment_id: int | None = None
    payment_review_status: str | None = None
    notes: str | None
    created_at: datetime


class RegistrationSubmitResponse(BaseModel):
    message: str
    registration: RegistrationOut


class RegistrationValidationRequest(BaseModel):
    teacher_name: str = Field(min_length=1, max_length=120)
    issued_username: str = Field(min_length=3, max_length=120)
    initial_password: str = Field(min_length=8, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("initial_password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not PASSWORD_PATTERN.match(value):
            raise ValueError(
                "Initial password must be at least 8 characters and include 1 uppercase letter, 1 number, and 1 symbol."
            )
        return value


class RegistrationValidationResponse(BaseModel):
    message: str
    registration: RegistrationOut

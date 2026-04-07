from datetime import date
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

EMAIL_PATTERN = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
PHONE_PATTERN = re.compile(r"^\d{11}$")
PASSWORD_PATTERN = re.compile(r"^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$")


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=8, max_length=120)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not PASSWORD_PATTERN.match(value):
            raise ValueError(
                "Password must be at least 8 characters and include 1 uppercase letter, 1 number, and 1 symbol."
            )
        return value


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone_number: str | None = None
    address: str | None = None
    birth_date: date | None = None
    profile_image_path: str | None = None
    must_change_password: bool = False


class UserProfileUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=120)
    middle_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=255)
    phone_number: str | None = Field(default=None, max_length=40)
    address: str | None = Field(default=None, max_length=1000)
    birth_date: date | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        if not EMAIL_PATTERN.match(trimmed):
            raise ValueError(
                "Email must be in a valid format (example: name@gmail.com, name@hotmail.com, name@yahoo.com)."
            )
        return trimmed.lower()

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        if not PHONE_PATTERN.match(trimmed):
            raise ValueError("Phone number must be exactly 11 digits (example: 09XXXXXXXXX).")
        return trimmed


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=120)
    new_password: str = Field(min_length=8, max_length=120)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not PASSWORD_PATTERN.match(value):
            raise ValueError(
                "New password must be at least 8 characters and include 1 uppercase letter, 1 number, and 1 symbol."
            )
        return value


class ForgotPasswordRequest(BaseModel):
    username_or_email: str = Field(min_length=1, max_length=255)

    @field_validator("username_or_email")
    @classmethod
    def validate_identity(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Username or email is required.")
        return trimmed


class ForgotPasswordVerifyRequest(BaseModel):
    username_or_email: str = Field(min_length=1, max_length=255)
    otp_code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=120)

    @field_validator("username_or_email")
    @classmethod
    def validate_identity(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Username or email is required.")
        return trimmed

    @field_validator("otp_code")
    @classmethod
    def validate_otp_code(cls, value: str) -> str:
        trimmed = value.strip()
        if not re.fullmatch(r"\d{6}", trimmed):
            raise ValueError("OTP code must be a 6-digit number.")
        return trimmed

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if not PASSWORD_PATTERN.match(value):
            raise ValueError(
                "New password must be at least 8 characters and include 1 uppercase letter, 1 number, and 1 symbol."
            )
        return value


class AuthResponse(BaseModel):
    token: str
    user: UserOut

from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TESTS_ROOT = Path(__file__).resolve().parent
TEST_DB_PATH = TESTS_ROOT / ".test-fsl-learning-hub.db"

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["AUTO_BOOTSTRAP_SCHEMA"] = "true"
os.environ["TEACHER_INVITE_SIGNING_SECRET"] = "test-teacher-invite-secret"
os.environ["SMTP_HOST"] = ""
os.environ["SMTP_FROM_EMAIL"] = ""

from app.core.datetime_utils import utc_now
from app.core.security import create_session_token, hash_password
from app.db.base import Base
from app.db.init_db import init_db
from app.db.session import SessionLocal, engine
from app.main import app
from app.models.session import UserSession
from app.models.teacher_invite import TeacherInvite
from app.models.user import User


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    init_db()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_session():
    with SessionLocal() as db:
        yield db


def create_user_with_session(
    *,
    username: str,
    password: str,
    role: str,
    email: str | None = None,
) -> dict[str, str]:
    with SessionLocal() as db:
        existing = db.query(User).filter(User.username == username).first()
        if existing is None:
            existing = User(
                username=username,
                email=email or f"{username}@example.com",
                password_hash=hash_password(password),
                role=role,
            )
            db.add(existing)
            db.flush()

        token = create_session_token()
        db.add(
            UserSession(
                user_id=existing.id,
                token=token,
                expires_at=utc_now() + timedelta(hours=24),
            )
        )
        db.commit()
        return {"Authorization": f"Bearer {token}"}


def create_teacher_headers(username: str = "teacher.main") -> dict[str, str]:
    return create_user_with_session(
        username=username,
        password="Teacher123!",
        role="teacher",
        email=f"{username}@school.test",
    )


def create_admin_headers(username: str = "admin.main") -> dict[str, str]:
    return create_user_with_session(
        username=username,
        password="Admin123!",
        role="admin",
        email=f"{username}@school.test",
    )


def create_student_headers(username: str) -> dict[str, str]:
    return create_user_with_session(
        username=username,
        password="Student123!",
        role="student",
        email=f"{username}@student.test",
    )


def create_teacher_invite(
    *,
    invite_code: str,
    passkey: str,
    max_use_count: int | None = 1,
    expires_at=None,
):
    with SessionLocal() as db:
        invite = TeacherInvite(
            invite_code=invite_code,
            label="Test Invite",
            passkey_hash=hash_password(passkey),
            status="active",
            max_use_count=max_use_count,
            expires_at=expires_at,
        )
        db.add(invite)
        db.commit()
        db.refresh(invite)
        return invite


@pytest.fixture
def teacher_headers_factory():
    return create_teacher_headers


@pytest.fixture
def admin_headers_factory():
    return create_admin_headers


@pytest.fixture
def student_headers_factory():
    return create_student_headers


@pytest.fixture
def teacher_invite_factory():
    return create_teacher_invite

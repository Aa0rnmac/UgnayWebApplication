from __future__ import annotations

from app.api.deps import get_current_learning_user
from app.core.config import settings
from app.core.security import verify_password
from app.db.init_db import seed_demo_users
from app.models.user import User


def test_seed_demo_users_creates_student_and_teacher_accounts(db_session):
    student = db_session.query(User).filter(User.username == settings.demo_student_username).first()
    teacher = db_session.query(User).filter(User.username == settings.demo_teacher_username).first()

    assert student is not None
    assert teacher is not None
    assert student.role == "student"
    assert teacher.role == "teacher"
    assert verify_password(settings.demo_student_password, student.password_hash)
    assert verify_password(settings.demo_teacher_password, teacher.password_hash)


def test_seed_demo_users_is_idempotent(db_session):
    seed_demo_users(db_session)

    demo_users = (
        db_session.query(User)
        .filter(User.username.in_([settings.demo_student_username, settings.demo_teacher_username]))
        .all()
    )
    assert len(demo_users) == 2


def test_guest_fallback_uses_configured_student_demo_user(db_session):
    current_user = get_current_learning_user(authorization=None, db=db_session)

    assert current_user.username == settings.demo_student_username
    assert current_user.role == "student"

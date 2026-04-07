from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import get_db
from app.models.session import UserSession
from app.models.user import User

DEMO_USERNAME = "student_demo"
STUDENT_ROLE = "student"
TEACHER_ROLES = {"teacher", "admin"}


def _get_or_create_demo_user(db: Session) -> User:
    user = db.query(User).filter(User.username == DEMO_USERNAME).first()
    if user:
        if not user.role:
            user.role = STUDENT_ROLE
            db.add(user)
            db.commit()
            db.refresh(user)
        return user

    user = User(username=DEMO_USERNAME, password_hash=hash_password("student123"), role=STUDENT_ROLE)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _get_user_from_bearer_token(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header.",
        )

    token = authorization.split(" ", maxsplit=1)[1].strip()
    session = db.query(UserSession).filter(UserSession.token == token).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token.")

    if session.expires_at < datetime.now(timezone.utc):
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has expired.")

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    if not user.role:
        user.role = STUDENT_ROLE
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header.",
        )
    return _get_user_from_bearer_token(authorization=authorization, db=db)


def get_current_student_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization:
        return _get_or_create_demo_user(db)

    user = _get_user_from_bearer_token(authorization=authorization, db=db)
    if user.role not in {STUDENT_ROLE, "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student access required.",
        )
    return user


def get_current_teacher(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in TEACHER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teacher access required.",
        )
    return current_user

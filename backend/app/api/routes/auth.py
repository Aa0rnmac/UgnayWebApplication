from datetime import datetime, timedelta, timezone
from pathlib import Path
import secrets
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_session_token, hash_password, verify_password
from app.db.session import get_db
from app.models.password_reset_otp import PasswordResetOtp
from app.models.session import UserSession
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    ForgotPasswordVerifyRequest,
    PasswordChangeRequest,
    UserCreate,
    UserLogin,
    UserOut,
    UserProfileUpdate,
)
from app.services.email_sender import send_password_reset_otp_email

router = APIRouter(prefix="/auth", tags=["auth"])


def create_user_session(db: Session, user_id: int) -> str:
    token = create_session_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.session_hours)

    session = UserSession(user_id=user_id, token=token, expires_at=expires_at)
    db.add(session)
    db.commit()
    return token


def find_user_by_identity(db: Session, identity: str) -> User | None:
    trimmed = identity.strip()
    if not trimmed:
        return None

    by_username = db.query(User).filter(User.username == trimmed).first()
    if by_username:
        return by_username

    return db.query(User).filter(User.email == trimmed.lower()).first()


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> AuthResponse:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Direct self-registration is disabled. Submit registration first, then wait for "
            "teacher validation and initial credentials via email."
        ),
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    token = create_user_session(db, user.id)
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.post("/forgot-password/request")
def request_password_reset_otp(
    payload: ForgotPasswordRequest, db: Session = Depends(get_db)
) -> dict[str, str]:
    user = find_user_by_identity(db, payload.username_or_email)
    if not user:
        return {"message": "If the account exists, an OTP code has been sent to the registered email."}
    if not user.email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No email is linked to this account yet. Please contact your teacher/admin.",
        )

    now = datetime.now(timezone.utc)
    db.query(PasswordResetOtp).filter(
        PasswordResetOtp.expires_at < now,
    ).delete(synchronize_session=False)

    db.query(PasswordResetOtp).filter(
        PasswordResetOtp.user_id == user.id,
        PasswordResetOtp.consumed_at.is_(None),
    ).update(
        {PasswordResetOtp.consumed_at: now},
        synchronize_session=False,
    )

    otp_code = f"{secrets.randbelow(1_000_000):06d}"
    otp_record = PasswordResetOtp(
        user_id=user.id,
        otp_hash=hash_password(otp_code),
        expires_at=now + timedelta(minutes=settings.password_reset_otp_minutes),
    )
    db.add(otp_record)

    try:
        send_password_reset_otp_email(
            to_email=user.email,
            otp_code=otp_code,
            username=user.username,
            otp_valid_minutes=settings.password_reset_otp_minutes,
        )
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    db.commit()
    return {"message": "OTP sent. Check your email inbox for the reset code."}


@router.post("/forgot-password/verify", response_model=AuthResponse)
def verify_password_reset_otp(
    payload: ForgotPasswordVerifyRequest, db: Session = Depends(get_db)
) -> AuthResponse:
    user = find_user_by_identity(db, payload.username_or_email)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP request.")

    now = datetime.now(timezone.utc)
    otp_record = (
        db.query(PasswordResetOtp)
        .filter(
            PasswordResetOtp.user_id == user.id,
            PasswordResetOtp.consumed_at.is_(None),
        )
        .order_by(PasswordResetOtp.created_at.desc())
        .first()
    )
    if not otp_record or otp_record.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OTP is missing or expired. Request a new code.",
        )

    if otp_record.attempt_count >= settings.password_reset_max_attempts:
        otp_record.consumed_at = now
        db.add(otp_record)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="OTP attempts exceeded. Please request a new code.",
        )

    if not verify_password(payload.otp_code, otp_record.otp_hash):
        otp_record.attempt_count += 1
        if otp_record.attempt_count >= settings.password_reset_max_attempts:
            otp_record.consumed_at = now
        db.add(otp_record)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP code.")

    otp_record.consumed_at = now
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.add(otp_record)
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_user_session(db, user.id)
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.patch("/me/profile", response_model=UserOut)
def update_my_profile(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    if payload.first_name is not None:
        current_user.first_name = payload.first_name.strip() or None
    if payload.middle_name is not None:
        current_user.middle_name = payload.middle_name.strip() or None
    if payload.last_name is not None:
        current_user.last_name = payload.last_name.strip() or None
    if payload.email is not None:
        normalized_email = payload.email.strip().lower()
        if normalized_email:
            existing = (
                db.query(User)
                .filter(User.email == normalized_email, User.id != current_user.id)
                .first()
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail="Email is already in use."
                )
            current_user.email = normalized_email
        else:
            current_user.email = None
    if payload.phone_number is not None:
        current_user.phone_number = payload.phone_number.strip() or None
    if payload.address is not None:
        current_user.address = payload.address.strip() or None
    if payload.birth_date is not None:
        current_user.birth_date = payload.birth_date

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.post("/me/change-password")
def change_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Current password is incorrect.")

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="New password must be different from current password.",
        )

    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    db.add(current_user)
    db.commit()
    return {"message": "Password updated successfully."}


@router.post("/me/profile-photo", response_model=UserOut)
async def upload_profile_photo(
    profile_photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    suffix = Path(profile_photo.filename or "").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Profile photo must be JPG, PNG, or WEBP.",
        )

    content = await profile_photo.read()
    if len(content) > 6 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Profile photo is too large. Max size is 6MB.",
        )

    uploads_dir = (Path(__file__).resolve().parents[3] / "uploads" / "profiles").resolve()
    uploads_dir.mkdir(parents=True, exist_ok=True)
    filename = f"user-{current_user.id}-{uuid4().hex}{suffix}"
    destination = uploads_dir / filename
    destination.write_bytes(content)

    current_user.profile_image_path = f"uploads/profiles/{filename}"
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)

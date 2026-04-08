from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import PROJECT_ROOT, settings
from app.core.security import hash_password
from app.db.session import get_db
from app.models.registration import Registration
from app.models.user import User
from app.schemas.registration import (
    RegistrationCreate,
    RegistrationSubmitResponse,
    RegistrationValidationRequest,
    RegistrationValidationResponse,
)

router = APIRouter(prefix="/registrations", tags=["registrations"])

ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
MAX_UPLOAD_SIZE_BYTES = 6 * 1024 * 1024
UPLOADS_DIR = (PROJECT_ROOT / "backend" / "uploads" / "registrations").resolve()


def _ensure_uploads_dir() -> None:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None


@router.post("", response_model=RegistrationSubmitResponse, status_code=status.HTTP_201_CREATED)
async def submit_registration(
    first_name: str = Form(...),
    middle_name: str | None = Form(default=None),
    last_name: str = Form(...),
    birth_date: str = Form(...),
    address: str = Form(...),
    email: str = Form(...),
    phone_number: str = Form(...),
    reference_number: str = Form(...),
    requested_batch_name: str | None = Form(default=None),
    reference_image: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> RegistrationSubmitResponse:
    try:
        parsed_birth_date = date.fromisoformat(birth_date.strip())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Birth date must be in YYYY-MM-DD format.",
        ) from exc

    payload = RegistrationCreate(
        first_name=first_name.strip(),
        middle_name=_clean_optional(middle_name),
        last_name=last_name.strip(),
        birth_date=parsed_birth_date,
        address=address.strip(),
        email=email.strip(),
        phone_number=phone_number.strip(),
        reference_number=reference_number.strip(),
        requested_batch_name=_clean_optional(requested_batch_name),
    )

    if not reference_image.filename:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Reference image is required.",
        )

    suffix = Path(reference_image.filename).suffix.lower()
    if suffix not in ALLOWED_IMAGE_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Reference image must be JPG, PNG, or WEBP.",
        )

    content = await reference_image.read()
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Reference image is too large. Max size is 6MB.",
        )

    _ensure_uploads_dir()
    filename = f"{uuid4().hex}{suffix}"
    destination = UPLOADS_DIR / filename
    destination.write_bytes(content)
    image_path = f"uploads/registrations/{filename}"

    registration = Registration(
        first_name=payload.first_name,
        middle_name=payload.middle_name,
        last_name=payload.last_name,
        birth_date=payload.birth_date,
        address=payload.address,
        email=payload.email,
        phone_number=payload.phone_number,
        reference_number=payload.reference_number,
        requested_batch_name=payload.requested_batch_name,
        reference_image_path=image_path,
        status="pending",
    )
    db.add(registration)
    db.commit()
    db.refresh(registration)

    return RegistrationSubmitResponse(
        message="Registration submitted successfully.",
        registration=registration,
    )


@router.post(
    "/{registration_id}/validate",
    response_model=RegistrationValidationResponse,
    status_code=status.HTTP_200_OK,
)
def validate_registration(
    registration_id: int,
    payload: RegistrationValidationRequest,
    db: Session = Depends(get_db),
    x_teacher_key: str | None = Header(default=None),
) -> RegistrationValidationResponse:
    if x_teacher_key != settings.teacher_validation_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid teacher key.")

    registration = db.query(Registration).filter(Registration.id == registration_id).first()
    if not registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")

    if registration.status == "validated" and registration.linked_user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration is already validated.",
        )

    existing_user = db.query(User).filter(User.username == payload.issued_username).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.")

    normalized_email = registration.email.strip().lower()
    existing_email = db.query(User).filter(User.email == normalized_email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already linked to another account.",
        )

    user = User(
        username=payload.issued_username.strip(),
        password_hash=hash_password(payload.initial_password),
        first_name=registration.first_name,
        middle_name=registration.middle_name,
        last_name=registration.last_name,
        birth_date=registration.birth_date,
        address=registration.address,
        email=normalized_email,
        phone_number=registration.phone_number,
        must_change_password=True,
    )
    db.add(user)
    db.flush()

    registration.status = "approved"
    registration.validated_at = datetime.now(timezone.utc)
    registration.validated_by = payload.teacher_name.strip()
    registration.linked_user_id = user.id
    registration.issued_username = payload.issued_username.strip()
    registration.credential_email_status = "manual"
    registration.credential_email_error = None
    registration.notes = payload.notes.strip() if payload.notes else None

    db.add(registration)
    db.commit()
    db.refresh(registration)

    return RegistrationValidationResponse(
        message=(
            "Registration validated. Send the issued username and initial password to the student email."
        ),
        registration=registration,
    )

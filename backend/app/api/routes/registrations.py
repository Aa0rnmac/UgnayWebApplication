from datetime import date
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_teacher
from app.core.config import PROJECT_ROOT
from app.db.session import get_db
from app.models.enrollment import Enrollment
from app.models.registration import Registration
from app.models.user import User
from app.schemas.registration import (
    RegistrationCreate,
    RegistrationOut,
    RegistrationSubmitResponse,
    RegistrationValidationRequest,
    RegistrationValidationResponse,
)
from app.services.enrollment_service import approve_enrollment, get_or_create_batch

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


def _registration_out(registration: Registration, enrollment: Enrollment | None = None) -> RegistrationOut:
    resolved_enrollment = enrollment or registration.enrollment
    return RegistrationOut(
        id=registration.id,
        first_name=registration.first_name,
        middle_name=registration.middle_name,
        last_name=registration.last_name,
        birth_date=registration.birth_date,
        address=registration.address,
        email=registration.email,
        phone_number=registration.phone_number,
        reference_number=registration.reference_number,
        reference_image_path=registration.reference_image_path,
        status=registration.status,
        validated_at=registration.validated_at,
        validated_by=registration.validated_by,
        linked_user_id=registration.linked_user_id,
        issued_username=registration.issued_username,
        enrollment_id=resolved_enrollment.id if resolved_enrollment else None,
        payment_review_status=resolved_enrollment.payment_review_status if resolved_enrollment else None,
        notes=registration.notes,
        created_at=registration.created_at,
    )


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
    image_path = f"registrations/{filename}"

    registration = Registration(
        first_name=payload.first_name,
        middle_name=payload.middle_name,
        last_name=payload.last_name,
        birth_date=payload.birth_date,
        address=payload.address,
        email=payload.email,
        phone_number=payload.phone_number,
        reference_number=payload.reference_number,
        reference_image_path=image_path,
        status="pending",
    )
    db.add(registration)
    db.flush()

    enrollment = Enrollment(
        registration_id=registration.id,
        status="pending",
        payment_review_status="submitted",
    )
    db.add(enrollment)
    db.commit()
    db.refresh(registration)
    db.refresh(enrollment)

    return RegistrationSubmitResponse(
        message="Registration submitted successfully.",
        registration=_registration_out(registration, enrollment),
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
    current_teacher: User = Depends(get_current_teacher),
) -> RegistrationValidationResponse:
    registration = db.query(Registration).filter(Registration.id == registration_id).first()
    if not registration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration not found.")

    enrollment = registration.enrollment
    if enrollment is None:
        enrollment = Enrollment(
            registration_id=registration.id,
            status="pending",
            payment_review_status="submitted",
        )
        db.add(enrollment)
        db.flush()

    batch = get_or_create_batch(
        db,
        current_teacher=current_teacher,
        batch_code="LEGACY-APPROVED",
        batch_name="Legacy Approved",
    )
    approve_enrollment(
        db,
        enrollment=enrollment,
        current_teacher=current_teacher,
        batch=batch,
        issued_username=payload.issued_username,
        temporary_password=payload.initial_password,
        notes=payload.notes,
        send_email=False,
    )
    db.commit()
    db.refresh(registration)
    db.refresh(enrollment)

    return RegistrationValidationResponse(
        message=(
            "Registration validated. Use the teacher enrollment routes for the full batch-aware approval workflow."
        ),
        registration=_registration_out(registration, enrollment),
    )

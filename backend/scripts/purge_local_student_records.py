from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import delete, func, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models import (
    ActivityAttempt,
    ActivityAttemptItem,
    ArchivedStudentAccount,
    AssessmentReport,
    Batch,
    Enrollment,
    PasswordResetOtp,
    Registration,
    TeacherInvite,
    User,
    UserModuleProgress,
    UserSession,
)

EXPECTED_DATABASE_URL = "postgresql+psycopg://fsl_app:admin123@localhost:5432/fsl_learning_hub"
UPLOAD_ROOT = ROOT / "uploads" / "registrations"


@dataclass(frozen=True)
class ApprovedTarget:
    label: str
    user_id: int
    registration_id: int
    enrollment_id: int
    proof_file_name: str
    expected_name: str | None = None
    expected_email: str | None = None
    expected_username: str | None = None


@dataclass(frozen=True)
class RejectedTarget:
    label: str
    registration_id: int
    enrollment_id: int
    proof_file_name: str
    expected_name: str


APPROVED_TARGETS = (
    ApprovedTarget(
        label="Approved Rachel",
        user_id=7,
        registration_id=3,
        enrollment_id=3,
        proof_file_name="1794325773ab42818bd3d8859ff5b9b6.png",
        expected_name="Rachel V Bestal",
        expected_email="draptap09@gmail.com",
    ),
    ApprovedTarget(
        label="Approved Bation",
        user_id=6,
        registration_id=1,
        enrollment_id=1,
        proof_file_name="322b4107198e4f1b87ff4e387a688a4c.png",
        expected_email="timothy.bation@yahoo.com",
        expected_username="timothy.bation@yahoo.com",
    ),
)

REJECTED_TARGETS = (
    RejectedTarget(
        label="Rejected Tim L Bation",
        registration_id=2,
        enrollment_id=2,
        proof_file_name="4d3166bd5ed247e6a43d1161f598e2a1.png",
        expected_name="Tim L Bation",
    ),
    RejectedTarget(
        label="Rejected mark tahimik soyosa",
        registration_id=4,
        enrollment_id=4,
        proof_file_name="4f6f9c28f9764dbc9668393cff9664f5.png",
        expected_name="mark tahimik soyosa",
    ),
)

TARGET_USER_IDS = tuple(target.user_id for target in APPROVED_TARGETS)
TARGET_REGISTRATION_IDS = tuple(
    [target.registration_id for target in APPROVED_TARGETS]
    + [target.registration_id for target in REJECTED_TARGETS]
)
TARGET_ENROLLMENT_IDS = tuple(
    [target.enrollment_id for target in APPROVED_TARGETS]
    + [target.enrollment_id for target in REJECTED_TARGETS]
)


def normalize(value: str | None) -> str:
    if value is None:
        return ""
    return " ".join(value.split()).casefold()


def compose_name(first_name: str | None, middle_name: str | None, last_name: str | None) -> str:
    parts = [part.strip() for part in (first_name, middle_name, last_name) if part and part.strip()]
    return " ".join(parts)


def count_rows(session: Session, model: type, *filters) -> int:
    statement = select(func.count()).select_from(model)
    for item in filters:
        statement = statement.where(item)
    return int(session.scalar(statement) or 0)


def require_equal(label: str, actual: str | int | None, expected: str | int | None) -> None:
    if actual != expected:
        raise RuntimeError(f"{label} mismatch: expected {expected!r}, found {actual!r}")


def require_normalized_match(label: str, actual: str | None, expected: str | None) -> None:
    if expected is None:
        return
    if normalize(actual) != normalize(expected):
        raise RuntimeError(f"{label} mismatch: expected {expected!r}, found {actual!r}")


def render_database_target() -> str:
    return make_url(settings.database_url).render_as_string(hide_password=True)


def verify_database_target() -> None:
    actual = make_url(settings.database_url)
    expected = make_url(EXPECTED_DATABASE_URL)

    checks = (
        ("backend", actual.get_backend_name(), expected.get_backend_name()),
        ("driver", actual.drivername, expected.drivername),
        ("username", actual.username, expected.username),
        ("host", actual.host, expected.host),
        ("port", actual.port, expected.port),
        ("database", actual.database, expected.database),
    )
    for label, actual_value, expected_value in checks:
        require_equal(f"database {label}", actual_value, expected_value)


def summarize_user_children(session: Session, user_id: int) -> dict[str, int]:
    return {
        "user_sessions": count_rows(session, UserSession, UserSession.user_id == user_id),
        "user_module_progress": count_rows(
            session, UserModuleProgress, UserModuleProgress.user_id == user_id
        ),
        "activity_attempts": count_rows(session, ActivityAttempt, ActivityAttempt.user_id == user_id),
        "assessment_reports": count_rows(
            session, AssessmentReport, AssessmentReport.user_id == user_id
        ),
        "password_reset_otps": count_rows(
            session, PasswordResetOtp, PasswordResetOtp.user_id == user_id
        ),
    }


def summarize_user_blockers(session: Session, user_id: int) -> dict[str, int]:
    return {
        "archived_student_accounts": count_rows(
            session, ArchivedStudentAccount, ArchivedStudentAccount.original_user_id == user_id
        ),
        "created_batches": count_rows(session, Batch, Batch.created_by_user_id == user_id),
        "revoked_teacher_invites": count_rows(
            session, TeacherInvite, TeacherInvite.revoked_by_user_id == user_id
        ),
        "approved_by_enrollments": count_rows(
            session, Enrollment, Enrollment.approved_by_user_id == user_id
        ),
        "rejected_by_enrollments": count_rows(
            session, Enrollment, Enrollment.rejected_by_user_id == user_id
        ),
        "unexpected_linked_registrations": count_rows(
            session,
            Registration,
            Registration.linked_user_id == user_id,
            Registration.id.not_in(TARGET_REGISTRATION_IDS),
        ),
        "unexpected_linked_enrollments": count_rows(
            session,
            Enrollment,
            Enrollment.user_id == user_id,
            Enrollment.id.not_in(TARGET_ENROLLMENT_IDS),
        ),
    }


def ensure_no_blockers(label: str, blockers: dict[str, int]) -> None:
    active = {name: count for name, count in blockers.items() if count}
    if active:
        parts = ", ".join(f"{name}={count}" for name, count in active.items())
        raise RuntimeError(f"{label} has dependent rows outside the requested purge scope: {parts}")


def proof_path(file_name: str) -> Path:
    return (UPLOAD_ROOT / file_name).resolve()


def inspect_approved_target(session: Session, target: ApprovedTarget) -> dict:
    user = session.get(User, target.user_id)
    registration = session.get(Registration, target.registration_id)
    enrollment = session.get(Enrollment, target.enrollment_id)

    if user is None:
        raise RuntimeError(f"{target.label}: missing users.id={target.user_id}")
    if registration is None:
        raise RuntimeError(f"{target.label}: missing registrations.id={target.registration_id}")
    if enrollment is None:
        raise RuntimeError(f"{target.label}: missing enrollments.id={target.enrollment_id}")

    require_equal(f"{target.label} registration.linked_user_id", registration.linked_user_id, user.id)
    require_equal(f"{target.label} enrollment.registration_id", enrollment.registration_id, registration.id)
    require_equal(f"{target.label} enrollment.user_id", enrollment.user_id, user.id)

    registration_name = compose_name(
        registration.first_name,
        registration.middle_name,
        registration.last_name,
    )
    user_name = compose_name(user.first_name, user.middle_name, user.last_name)
    require_normalized_match(f"{target.label} registration full name", registration_name, target.expected_name)
    if user_name:
        require_normalized_match(f"{target.label} user full name", user_name, target.expected_name)

    require_normalized_match(f"{target.label} registration email", registration.email, target.expected_email)
    require_normalized_match(f"{target.label} user email", user.email, target.expected_email)
    require_normalized_match(f"{target.label} username", user.username, target.expected_username)

    actual_file_name = Path(registration.reference_image_path or "").name
    require_equal(f"{target.label} proof file", actual_file_name, target.proof_file_name)

    file_path = proof_path(target.proof_file_name)
    if not file_path.exists():
        raise RuntimeError(f"{target.label}: proof file is missing on disk: {file_path}")

    child_counts = summarize_user_children(session, user.id)
    blockers = summarize_user_blockers(session, user.id)
    ensure_no_blockers(target.label, blockers)

    return {
        "label": target.label,
        "user": user,
        "registration": registration,
        "enrollment": enrollment,
        "proof_file": file_path,
        "child_counts": child_counts,
    }


def inspect_rejected_target(session: Session, target: RejectedTarget) -> dict:
    registration = session.get(Registration, target.registration_id)
    enrollment = session.get(Enrollment, target.enrollment_id)

    if registration is None:
        raise RuntimeError(f"{target.label}: missing registrations.id={target.registration_id}")
    if enrollment is None:
        raise RuntimeError(f"{target.label}: missing enrollments.id={target.enrollment_id}")

    require_equal(f"{target.label} registration.linked_user_id", registration.linked_user_id, None)
    require_equal(f"{target.label} enrollment.registration_id", enrollment.registration_id, registration.id)
    require_equal(f"{target.label} enrollment.user_id", enrollment.user_id, None)

    registration_name = compose_name(
        registration.first_name,
        registration.middle_name,
        registration.last_name,
    )
    require_normalized_match(f"{target.label} registration full name", registration_name, target.expected_name)

    actual_file_name = Path(registration.reference_image_path or "").name
    require_equal(f"{target.label} proof file", actual_file_name, target.proof_file_name)

    file_path = proof_path(target.proof_file_name)
    if not file_path.exists():
        raise RuntimeError(f"{target.label}: proof file is missing on disk: {file_path}")

    return {
        "label": target.label,
        "registration": registration,
        "enrollment": enrollment,
        "proof_file": file_path,
    }


def collect_preflight(session: Session) -> dict:
    approved = [inspect_approved_target(session, target) for target in APPROVED_TARGETS]
    rejected = [inspect_rejected_target(session, target) for target in REJECTED_TARGETS]
    return {
        "approved": approved,
        "rejected": rejected,
        "target_registration_count": count_rows(
            session, Registration, Registration.id.in_(TARGET_REGISTRATION_IDS)
        ),
        "target_enrollment_count": count_rows(
            session, Enrollment, Enrollment.id.in_(TARGET_ENROLLMENT_IDS)
        ),
        "target_user_count": count_rows(session, User, User.id.in_(TARGET_USER_IDS)),
    }


def print_preflight(summary: dict) -> None:
    print(f"Database target: {render_database_target()}")
    print("Preflight checks:")
    print(f"  registrations to purge: {summary['target_registration_count']}")
    print(f"  enrollments to purge  : {summary['target_enrollment_count']}")
    print(f"  users to purge        : {summary['target_user_count']}")
    for package in summary["approved"]:
        child_counts = ", ".join(
            f"{name}={count}" for name, count in package["child_counts"].items()
        )
        print(
            f"  {package['label']}: "
            f"user={package['user'].id}, registration={package['registration'].id}, "
            f"enrollment={package['enrollment'].id}, file={package['proof_file'].name}"
        )
        print(f"    child rows: {child_counts}")
    for application in summary["rejected"]:
        print(
            f"  {application['label']}: "
            f"registration={application['registration'].id}, "
            f"enrollment={application['enrollment'].id}, "
            f"file={application['proof_file'].name}"
        )


def execute_purge(session: Session, summary: dict) -> None:
    approved_registration_ids = [package["registration"].id for package in summary["approved"]]
    rejected_registration_ids = [item["registration"].id for item in summary["rejected"]]
    target_user_ids = [package["user"].id for package in summary["approved"]]
    attempt_ids = select(ActivityAttempt.id).where(ActivityAttempt.user_id.in_(target_user_ids))

    session.execute(delete(Registration).where(Registration.id.in_(approved_registration_ids)))
    session.execute(delete(Registration).where(Registration.id.in_(rejected_registration_ids)))
    session.execute(delete(ActivityAttemptItem).where(ActivityAttemptItem.attempt_id.in_(attempt_ids)))
    session.execute(delete(ActivityAttempt).where(ActivityAttempt.user_id.in_(target_user_ids)))
    session.execute(delete(AssessmentReport).where(AssessmentReport.user_id.in_(target_user_ids)))
    session.execute(delete(PasswordResetOtp).where(PasswordResetOtp.user_id.in_(target_user_ids)))
    session.execute(delete(UserModuleProgress).where(UserModuleProgress.user_id.in_(target_user_ids)))
    session.execute(delete(UserSession).where(UserSession.user_id.in_(target_user_ids)))
    session.execute(delete(User).where(User.id.in_(target_user_ids)))
    session.commit()


def delete_proof_files(summary: dict) -> tuple[list[Path], list[Path]]:
    deleted: list[Path] = []
    leftovers: list[Path] = []
    targets = [item["proof_file"] for item in summary["approved"]] + [
        item["proof_file"] for item in summary["rejected"]
    ]

    for path in targets:
        try:
            path.unlink()
            deleted.append(path)
        except FileNotFoundError:
            leftovers.append(path)
        except OSError:
            leftovers.append(path)

    return deleted, leftovers


def collect_postcheck(session: Session) -> dict:
    user_counts = {user_id: summarize_user_children(session, user_id) for user_id in TARGET_USER_IDS}
    return {
        "users_remaining": count_rows(session, User, User.id.in_(TARGET_USER_IDS)),
        "registrations_remaining": count_rows(
            session, Registration, Registration.id.in_(TARGET_REGISTRATION_IDS)
        ),
        "enrollments_remaining": count_rows(
            session, Enrollment, Enrollment.id.in_(TARGET_ENROLLMENT_IDS)
        ),
        "user_child_counts": user_counts,
    }


def print_postcheck(summary: dict, deleted_files: list[Path], leftover_files: list[Path]) -> None:
    print("Post-check:")
    print(f"  users remaining        : {summary['users_remaining']}")
    print(f"  registrations remaining: {summary['registrations_remaining']}")
    print(f"  enrollments remaining  : {summary['enrollments_remaining']}")
    for user_id, counts in summary["user_child_counts"].items():
        child_counts = ", ".join(f"{name}={count}" for name, count in counts.items())
        print(f"  user {user_id} child rows: {child_counts}")
    print(f"  proof files deleted    : {len(deleted_files)}")
    if leftover_files:
        print("  proof files still present or undeleted:")
        for path in leftover_files:
            print(f"    {path}")


def ensure_postcheck_is_clean(summary: dict, leftover_files: list[Path]) -> None:
    if summary["users_remaining"] != 0:
        raise RuntimeError("Post-check failed: target users still exist.")
    if summary["registrations_remaining"] != 0:
        raise RuntimeError("Post-check failed: target registrations still exist.")
    if summary["enrollments_remaining"] != 0:
        raise RuntimeError("Post-check failed: target enrollments still exist.")

    for user_id, counts in summary["user_child_counts"].items():
        active = {name: count for name, count in counts.items() if count}
        if active:
            parts = ", ".join(f"{name}={count}" for name, count in active.items())
            raise RuntimeError(f"Post-check failed: user {user_id} still has child rows: {parts}")

    if leftover_files:
        lines = "\n".join(str(path) for path in leftover_files)
        raise RuntimeError(
            "Database purge committed, but some proof files could not be removed:\n"
            f"{lines}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Purge the requested Rachel/Bation student packages and two rejected applications "
            "from the local PostgreSQL database, then remove their registration proof files."
        )
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply the purge. Without this flag, the script only performs preflight validation.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    verify_database_target()

    with SessionLocal() as session:
        preflight = collect_preflight(session)
        print_preflight(preflight)

        if not args.execute:
            session.rollback()
            print("Dry run complete. Re-run with --execute to apply the purge.")
            return

        try:
            execute_purge(session, preflight)
        except Exception:
            session.rollback()
            raise

    deleted_files, leftover_files = delete_proof_files(preflight)

    with SessionLocal() as session:
        postcheck = collect_postcheck(session)

    print_postcheck(postcheck, deleted_files, leftover_files)
    ensure_postcheck_is_clean(postcheck, leftover_files)
    print("Purge completed successfully.")


if __name__ == "__main__":
    main()

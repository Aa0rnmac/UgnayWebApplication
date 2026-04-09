from __future__ import annotations

import app.services.enrollment_service as enrollment_service
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.enrollment import Enrollment
from app.models.user import User


def _submit_registration(client, *, email: str, reference_number: str, phone_number: str = "09123456789"):
    response = client.post(
        "/api/registrations",
        data={
            "first_name": "Juan",
            "middle_name": "S",
            "last_name": "Dela Cruz",
            "birth_date": "2012-05-01",
            "address": "Manila",
            "email": email,
            "phone_number": phone_number,
            "reference_number": reference_number,
        },
        files={"reference_image": ("proof.png", b"proof-image-bytes", "image/png")},
    )
    assert response.status_code == 201
    return response.json()["registration"]


def test_registration_and_teacher_approval_flow(client, teacher_headers_factory):
    registration = _submit_registration(
        client,
        email="student.one@example.com",
        reference_number="REF-1001",
    )
    assert registration["payment_review_status"] == "submitted"
    assert registration["reference_image_path"].startswith("registrations/")

    teacher_headers = teacher_headers_factory()

    enrollments_response = client.get("/api/teacher/enrollments", headers=teacher_headers)
    assert enrollments_response.status_code == 200
    enrollments = enrollments_response.json()
    assert len(enrollments) == 1
    enrollment = enrollments[0]
    assert enrollment["status"] == "pending"

    proof_response = client.get(
        f"/api/teacher/enrollments/{enrollment['id']}/payment-proof",
        headers=teacher_headers,
    )
    assert proof_response.status_code == 200
    assert proof_response.content == b"proof-image-bytes"

    approve_response = client.post(
        f"/api/teacher/enrollments/{enrollment['id']}/approve",
        json={
            "batch_code": "BATCH-APR-2026",
            "batch_name": "April 2026 Batch",
            "issued_username": "student.approved",
            "temporary_password": "Student123!",
            "notes": "Payment confirmed.",
            "send_email": False,
        },
        headers=teacher_headers,
    )
    assert approve_response.status_code == 200
    approval = approve_response.json()
    assert approval["delivery_status"] == "skipped"
    assert approval["delivery_message"] == "Credential email skipped. Share the one-time credentials manually."
    assert approval["issued_username"] == "student.approved"
    assert approval["temporary_password"] == "Student123!"
    approved = approval["enrollment"]
    assert approved["status"] == "approved"
    assert approved["payment_review_status"] == "approved"
    assert approved["batch"]["code"] == "BATCH-APR-2026"
    assert approved["student"]["username"] == "student.approved"

    batches_response = client.get("/api/teacher/batches", headers=teacher_headers)
    assert batches_response.status_code == 200
    batches = batches_response.json()
    assert batches[0]["student_count"] == 1

    students_response = client.get(
        f"/api/teacher/batches/{approved['batch']['id']}/students",
        headers=teacher_headers,
    )
    assert students_response.status_code == 200
    assert students_response.json()[0]["username"] == "student.approved"


def test_teacher_can_reject_pending_enrollment(client, teacher_headers_factory):
    registration = _submit_registration(
        client,
        email="student.reject@example.com",
        reference_number="REF-1002",
    )
    teacher_headers = teacher_headers_factory("teacher.reject")

    reject_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/reject",
        json={
            "internal_note": "Reference number did not match the submitted proof.",
            "rejection_reason_code": "incorrect_information",
            "rejection_reason_detail": None,
        },
        headers=teacher_headers,
    )
    assert reject_response.status_code == 200
    rejected = reject_response.json()
    assert rejected["delivery_status"] == "skipped"
    assert rejected["recipient_email"] == "student.reject@example.com"
    assert rejected["enrollment"]["status"] == "rejected"
    assert rejected["enrollment"]["payment_review_status"] == "rejected"
    assert rejected["enrollment"]["review_notes"] == "Reference number did not match the submitted proof."
    assert rejected["enrollment"]["rejection_reason_code"] == "incorrect_information"
    assert rejected["enrollment"]["rejection_reason_detail"] is None

    with SessionLocal() as db:
        student_user = db.query(User).filter(User.email == "student.reject@example.com").first()
        enrollment = db.query(Enrollment).filter(Enrollment.id == registration["enrollment_id"]).first()
        assert student_user is None
        assert enrollment is not None
        assert enrollment.review_notes == "Reference number did not match the submitted proof."
        assert enrollment.rejection_reason_code == "incorrect_information"


def test_teacher_rejection_sends_reason_email_when_smtp_available(
    client, teacher_headers_factory, monkeypatch
):
    registration = _submit_registration(
        client,
        email="student.rejectmail@example.com",
        reference_number="REF-1002-MAIL",
    )
    teacher_headers = teacher_headers_factory("teacher.rejectmail")
    sent_payload: dict[str, str] = {}

    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "smtp_from_email", "teacher@example.com")
    monkeypatch.setattr(settings, "smtp_username", "teacher@example.com")
    monkeypatch.setattr(settings, "smtp_password", "gmail-app-password")

    def fake_send_student_rejection_email(**kwargs):
        sent_payload.update(kwargs)

    monkeypatch.setattr(
        "app.api.routes.teacher_enrollment.send_student_rejection_email",
        fake_send_student_rejection_email,
    )

    reject_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/reject",
        json={
            "internal_note": "Payment proof needs teacher follow-up.",
            "rejection_reason_code": "incorrect_amount_paid",
            "rejection_reason_detail": None,
        },
        headers=teacher_headers,
    )

    assert reject_response.status_code == 200
    rejected = reject_response.json()
    assert rejected["delivery_status"] == "sent"
    assert rejected["recipient_email"] == "student.rejectmail@example.com"
    assert rejected["enrollment"]["status"] == "rejected"
    assert rejected["enrollment"]["review_notes"] == "Payment proof needs teacher follow-up."
    assert rejected["enrollment"]["rejection_reason_code"] == "incorrect_amount_paid"
    assert sent_payload["to_email"] == "student.rejectmail@example.com"
    assert "amount paid did not match the required payment amount" in sent_payload["rejection_reason"]
    assert sent_payload["student_name"] == "Juan S Dela Cruz"


def test_teacher_rejection_keeps_saved_status_when_email_delivery_fails(
    client, teacher_headers_factory, monkeypatch
):
    registration = _submit_registration(
        client,
        email="student.rejectfail@example.com",
        reference_number="REF-1002-FAIL",
    )
    teacher_headers = teacher_headers_factory("teacher.rejectfail")

    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "smtp_from_email", "teacher@example.com")
    monkeypatch.setattr(settings, "smtp_username", "teacher@example.com")
    monkeypatch.setattr(settings, "smtp_password", "gmail-app-password")

    def failing_send_student_rejection_email(**_kwargs):
        raise RuntimeError("SMTP failed")

    monkeypatch.setattr(
        "app.api.routes.teacher_enrollment.send_student_rejection_email",
        failing_send_student_rejection_email,
    )

    reject_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/reject",
        json={
            "internal_note": "Teacher needs corrected registration details.",
            "rejection_reason_code": "incorrect_information",
            "rejection_reason_detail": "The submitted payment details were incomplete.",
        },
        headers=teacher_headers,
    )

    assert reject_response.status_code == 200
    rejected = reject_response.json()
    assert rejected["delivery_status"] == "failed"
    assert rejected["recipient_email"] == "student.rejectfail@example.com"
    assert rejected["enrollment"]["status"] == "rejected"
    assert rejected["enrollment"]["review_notes"] == "Teacher needs corrected registration details."
    assert rejected["enrollment"]["rejection_reason_code"] == "incorrect_information"
    assert (
        rejected["enrollment"]["rejection_reason_detail"]
        == "The submitted payment details were incomplete."
    )

    with SessionLocal() as db:
        enrollment = db.query(Enrollment).filter(Enrollment.id == registration["enrollment_id"]).first()
        assert enrollment is not None
        assert enrollment.status == "rejected"
        assert enrollment.review_notes == "Teacher needs corrected registration details."
        assert enrollment.rejection_reason_code == "incorrect_information"
        assert enrollment.rejection_reason_detail == "The submitted payment details were incomplete."


def test_registration_normalizes_phone_number(client):
    registration = _submit_registration(
        client,
        email="student.phone@example.com",
        reference_number="REF-1003",
        phone_number="0912 345 6789",
    )

    assert registration["phone_number"] == "09123456789"


def test_registration_rejects_existing_user_email(client, teacher_headers_factory):
    teacher_headers_factory("existing.student")

    response = client.post(
        "/api/registrations",
        data={
            "first_name": "Ana",
            "middle_name": "L",
            "last_name": "Student",
            "birth_date": "2012-05-01",
            "address": "Manila",
            "email": "existing.student@school.test",
            "phone_number": "09123456789",
            "reference_number": "REF-DUP-EMAIL",
        },
        files={"reference_image": ("proof.png", b"proof-image-bytes", "image/png")},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "An account with this email or username already exists. Please log in instead."


def test_registration_rejects_email_that_matches_existing_username(client, db_session):
    db_session.add(
        User(
            username="student.username@example.com",
            email="different@example.com",
            password_hash="hashed-password",
            role="student",
        )
    )
    db_session.commit()

    response = client.post(
        "/api/registrations",
        data={
            "first_name": "Bia",
            "middle_name": "L",
            "last_name": "Student",
            "birth_date": "2012-05-01",
            "address": "Cebu",
            "email": "student.username@example.com",
            "phone_number": "09123456789",
            "reference_number": "REF-DUP-USERNAME",
        },
        files={"reference_image": ("proof.png", b"proof-image-bytes", "image/png")},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "An account with this email or username already exists. Please log in instead."


def test_teacher_approval_sends_credentials_email_when_smtp_available(
    client, teacher_headers_factory, monkeypatch
):
    registration = _submit_registration(
        client,
        email="student.mail@example.com",
        reference_number="REF-1004",
    )
    teacher_headers = teacher_headers_factory("teacher.mail")
    sent_payload: dict[str, str | None] = {}

    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "smtp_from_email", "teacher@example.com")
    monkeypatch.setattr(settings, "smtp_username", "teacher@example.com")
    monkeypatch.setattr(settings, "smtp_password", "gmail-app-password")

    def fake_send_student_initial_credentials_email(**kwargs):
        sent_payload.update(kwargs)

    monkeypatch.setattr(
        enrollment_service,
        "send_student_initial_credentials_email",
        fake_send_student_initial_credentials_email,
    )

    approve_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/approve",
        json={
            "batch_code": "BATCH-MAIL-2026",
            "batch_name": "Mail Batch",
            "issued_username": "student.mail",
            "temporary_password": "Student123!",
            "notes": "Email should be sent.",
            "send_email": True,
        },
        headers=teacher_headers,
    )

    assert approve_response.status_code == 200
    approval = approve_response.json()
    assert approval["delivery_status"] == "sent"
    assert approval["recipient_email"] == "student.mail@example.com"
    assert approval["issued_username"] == "student.mail"
    assert approval["temporary_password"] == "Student123!"
    assert sent_payload["to_email"] == "student.mail@example.com"
    assert sent_payload["username"] == "student.mail"
    assert sent_payload["temporary_password"] == "Student123!"
    assert sent_payload["batch_name"] == "Mail Batch"


def test_teacher_approval_requires_smtp_when_send_email_is_true(
    client, teacher_headers_factory, monkeypatch
):
    registration = _submit_registration(
        client,
        email="student.nosmtp@example.com",
        reference_number="REF-1005",
    )
    teacher_headers = teacher_headers_factory("teacher.nosmtp")

    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "smtp_from_email", "")
    monkeypatch.setattr(settings, "smtp_username", "")
    monkeypatch.setattr(settings, "smtp_password", "")

    approve_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/approve",
        json={
            "batch_code": "BATCH-NOSMTP-2026",
            "batch_name": "No SMTP Batch",
            "issued_username": "student.nosmtp",
            "temporary_password": "Student123!",
            "notes": "Should fail without SMTP.",
            "send_email": True,
        },
        headers=teacher_headers,
    )

    assert approve_response.status_code == 503
    assert "SMTP is not configured" in approve_response.json()["detail"]

    with SessionLocal() as db:
        student_user = db.query(User).filter(User.email == "student.nosmtp@example.com").first()
        enrollment = db.query(Enrollment).filter(Enrollment.id == registration["enrollment_id"]).first()
        assert student_user is None
        assert enrollment is not None
        assert enrollment.status == "pending"


def test_teacher_approval_rolls_back_when_email_delivery_fails(
    client, teacher_headers_factory, monkeypatch
):
    registration = _submit_registration(
        client,
        email="student.failmail@example.com",
        reference_number="REF-1006",
    )
    teacher_headers = teacher_headers_factory("teacher.failmail")

    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "smtp_from_email", "teacher@example.com")
    monkeypatch.setattr(settings, "smtp_username", "teacher@example.com")
    monkeypatch.setattr(settings, "smtp_password", "gmail-app-password")

    def failing_send_student_initial_credentials_email(**_kwargs):
        raise RuntimeError("SMTP failed")

    monkeypatch.setattr(
        enrollment_service,
        "send_student_initial_credentials_email",
        failing_send_student_initial_credentials_email,
    )

    approve_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/approve",
        json={
            "batch_code": "BATCH-FAIL-2026",
            "batch_name": "Fail Batch",
            "issued_username": "student.failmail",
            "temporary_password": "Student123!",
            "notes": "Should fail when delivery fails.",
            "send_email": True,
        },
        headers=teacher_headers,
    )

    assert approve_response.status_code == 503
    assert approve_response.json()["detail"] == "Approval not completed because the credential email could not be sent."

    with SessionLocal() as db:
        student_user = db.query(User).filter(User.email == "student.failmail@example.com").first()
        enrollment = db.query(Enrollment).filter(Enrollment.id == registration["enrollment_id"]).first()
        assert student_user is None
        assert enrollment is not None
        assert enrollment.status == "pending"


def test_teacher_can_archive_restore_and_filter_batches(client, teacher_headers_factory):
    teacher_headers = teacher_headers_factory("teacher.archive")

    first_batch_response = client.post(
        "/api/teacher/batches",
        json={"code": "BATCH-ACTIVE-2026", "name": "Active Batch"},
        headers=teacher_headers,
    )
    assert first_batch_response.status_code == 201
    first_batch = first_batch_response.json()

    second_batch_response = client.post(
        "/api/teacher/batches",
        json={"code": "BATCH-ARCHIVE-2026", "name": "Archive Batch"},
        headers=teacher_headers,
    )
    assert second_batch_response.status_code == 201
    second_batch = second_batch_response.json()

    archive_response = client.post(
        f"/api/teacher/batches/{second_batch['id']}/archive",
        headers=teacher_headers,
    )
    assert archive_response.status_code == 200
    archived_batch = archive_response.json()
    assert archived_batch["status"] == "archived"

    default_batches_response = client.get("/api/teacher/batches", headers=teacher_headers)
    assert default_batches_response.status_code == 200
    assert [batch["id"] for batch in default_batches_response.json()] == [first_batch["id"]]

    archived_batches_response = client.get(
        "/api/teacher/batches?status=archived",
        headers=teacher_headers,
    )
    assert archived_batches_response.status_code == 200
    assert [batch["id"] for batch in archived_batches_response.json()] == [second_batch["id"]]

    all_batches_response = client.get("/api/teacher/batches?status=all", headers=teacher_headers)
    assert all_batches_response.status_code == 200
    assert [batch["id"] for batch in all_batches_response.json()] == [
        first_batch["id"],
        second_batch["id"],
    ]

    restore_response = client.post(
        f"/api/teacher/batches/{second_batch['id']}/restore",
        headers=teacher_headers,
    )
    assert restore_response.status_code == 200
    restored_batch = restore_response.json()
    assert restored_batch["status"] == "active"

    active_batches_response = client.get("/api/teacher/batches", headers=teacher_headers)
    assert active_batches_response.status_code == 200
    assert [batch["id"] for batch in active_batches_response.json()] == [
        first_batch["id"],
        second_batch["id"],
    ]


def test_teacher_cannot_approve_into_archived_batch(client, teacher_headers_factory):
    teacher_headers = teacher_headers_factory("teacher.archived.approval")

    batch_response = client.post(
        "/api/teacher/batches",
        json={"code": "BATCH-LOCKED-2026", "name": "Locked Batch"},
        headers=teacher_headers,
    )
    assert batch_response.status_code == 201
    batch = batch_response.json()

    archive_response = client.post(
        f"/api/teacher/batches/{batch['id']}/archive",
        headers=teacher_headers,
    )
    assert archive_response.status_code == 200

    registration = _submit_registration(
        client,
        email="student.archivedbatch@example.com",
        reference_number="REF-ARCHIVE-1001",
    )

    approve_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/approve",
        json={
            "batch_id": batch["id"],
            "issued_username": "student.archivedbatch",
            "temporary_password": "Student123!",
            "notes": "Should stay blocked.",
            "send_email": False,
        },
        headers=teacher_headers,
    )

    assert approve_response.status_code == 409
    assert (
        approve_response.json()["detail"]
        == "Archived batches cannot accept new approvals. Restore the batch first."
    )

    with SessionLocal() as db:
        student_user = db.query(User).filter(User.email == "student.archivedbatch@example.com").first()
        enrollment = db.query(Enrollment).filter(Enrollment.id == registration["enrollment_id"]).first()
        assert student_user is None
        assert enrollment is not None
        assert enrollment.status == "pending"


def test_archived_batch_keeps_student_roster_and_history(client, teacher_headers_factory):
    registration = _submit_registration(
        client,
        email="student.history@example.com",
        reference_number="REF-ARCHIVE-1002",
    )
    teacher_headers = teacher_headers_factory("teacher.history")

    approve_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/approve",
        json={
            "batch_code": "BATCH-HISTORY-2026",
            "batch_name": "History Batch",
            "issued_username": "student.history",
            "temporary_password": "Student123!",
            "notes": "Archive after approval.",
            "send_email": False,
        },
        headers=teacher_headers,
    )
    assert approve_response.status_code == 200
    approved = approve_response.json()["enrollment"]

    archive_response = client.post(
        f"/api/teacher/batches/{approved['batch']['id']}/archive",
        headers=teacher_headers,
    )
    assert archive_response.status_code == 200
    archived_batch = archive_response.json()
    assert archived_batch["status"] == "archived"
    assert archived_batch["student_count"] == 1

    archived_batches_response = client.get(
        "/api/teacher/batches?status=archived",
        headers=teacher_headers,
    )
    assert archived_batches_response.status_code == 200
    assert archived_batches_response.json()[0]["id"] == approved["batch"]["id"]
    assert archived_batches_response.json()[0]["student_count"] == 1

    students_response = client.get(
        f"/api/teacher/batches/{approved['batch']['id']}/students",
        headers=teacher_headers,
    )
    assert students_response.status_code == 200
    assert students_response.json()[0]["username"] == "student.history"

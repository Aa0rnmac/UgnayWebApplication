from __future__ import annotations

from app.db.session import SessionLocal
from app.models.user import User


def _submit_registration(client, *, email: str, reference_number: str):
    response = client.post(
        "/api/registrations",
        data={
            "first_name": "Juan",
            "middle_name": "S",
            "last_name": "Dela Cruz",
            "birth_date": "2012-05-01",
            "address": "Manila",
            "email": email,
            "phone_number": "09123456789",
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
    approved = approve_response.json()
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
        json={"notes": "Reference number did not match the submitted proof."},
        headers=teacher_headers,
    )
    assert reject_response.status_code == 200
    rejected = reject_response.json()
    assert rejected["status"] == "rejected"
    assert rejected["payment_review_status"] == "rejected"

    with SessionLocal() as db:
        student_user = db.query(User).filter(User.email == "student.reject@example.com").first()
        assert student_user is None

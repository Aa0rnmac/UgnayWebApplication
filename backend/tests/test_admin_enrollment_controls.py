from __future__ import annotations


def _submit_registration(client, *, email: str, reference_number: str):
    response = client.post(
        "/api/registrations",
        data={
            "first_name": "Admin",
            "middle_name": "Flow",
            "last_name": "Student",
            "birth_date": "2013-01-01",
            "address": "Manila",
            "email": email,
            "phone_number": "09123456789",
            "reference_number": reference_number,
        },
        files={"reference_image": ("proof.png", b"proof-image-bytes", "image/png")},
    )
    assert response.status_code == 201
    return response.json()["registration"]


def test_admin_can_approve_without_batch_and_teacher_can_assign_batch(
    client,
    admin_headers_factory,
    teacher_headers_factory,
):
    admin_headers = admin_headers_factory("admin.enrollment")
    teacher_headers = teacher_headers_factory("teacher.enrollment")
    registration = _submit_registration(
        client,
        email="student.unbatched@example.com",
        reference_number="REF-ADMIN-UNBATCHED",
    )

    teacher_pending = client.get("/api/teacher/enrollments?status=pending", headers=teacher_headers)
    assert teacher_pending.status_code == 200
    assert teacher_pending.json() == []

    approve_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/approve",
        json={
            "issued_username": "student.unbatched",
            "temporary_password": "Student123!",
            "notes": "Approved by admin without immediate batch.",
            "send_email": False,
        },
        headers=admin_headers,
    )
    assert approve_response.status_code == 200
    approved_enrollment = approve_response.json()["enrollment"]
    assert approved_enrollment["status"] == "approved"
    assert approved_enrollment["batch"] is None

    teacher_approved = client.get("/api/teacher/enrollments?status=approved", headers=teacher_headers)
    assert teacher_approved.status_code == 200
    assert [item["id"] for item in teacher_approved.json()] == [approved_enrollment["id"]]

    create_batch_response = client.post(
        "/api/teacher/batches",
        json={"code": "BATCH-ADMIN-ASSIGN-2026", "name": "Teacher Enrollment Batch"},
        headers=teacher_headers,
    )
    assert create_batch_response.status_code == 201
    batch_id = create_batch_response.json()["id"]

    assign_response = client.post(
        f"/api/teacher/enrollments/{approved_enrollment['id']}/assign-batch",
        json={"batch_id": batch_id, "notes": "Teacher enrolled unbatched student."},
        headers=teacher_headers,
    )
    assert assign_response.status_code == 200
    assert assign_response.json()["batch"]["id"] == batch_id


def test_teacher_cannot_approve_or_reject_pending_enrollment(
    client,
    admin_headers_factory,
    teacher_headers_factory,
):
    admin_headers = admin_headers_factory("admin.review")
    teacher_headers = teacher_headers_factory("teacher.review")
    registration = _submit_registration(
        client,
        email="student.review@example.com",
        reference_number="REF-ADMIN-REVIEW",
    )

    teacher_approve = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/approve",
        json={
            "issued_username": "student.review",
            "temporary_password": "Student123!",
            "send_email": False,
        },
        headers=teacher_headers,
    )
    assert teacher_approve.status_code == 403
    assert teacher_approve.json()["detail"] == "Admin access required."

    teacher_reject = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/reject",
        json={
            "internal_note": "Only admin can reject pending applications.",
            "rejection_reason_code": "incorrect_information",
        },
        headers=teacher_headers,
    )
    assert teacher_reject.status_code == 403
    assert teacher_reject.json()["detail"] == "Admin access required."

    admin_reject = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/reject",
        json={
            "internal_note": "Reviewed and rejected by admin.",
            "rejection_reason_code": "incorrect_information",
        },
        headers=admin_headers,
    )
    assert admin_reject.status_code == 200
    assert admin_reject.json()["enrollment"]["status"] == "rejected"


def test_admin_can_assign_batch_teacher(
    client,
    admin_headers_factory,
    teacher_headers_factory,
):
    admin_headers = admin_headers_factory("admin.assign")
    teacher_one_headers = teacher_headers_factory("teacher.assign.one")
    teacher_two_headers = teacher_headers_factory("teacher.assign.two")
    _ = teacher_two_headers

    create_batch_response = client.post(
        "/api/teacher/batches",
        json={"code": "BATCH-ADMIN-OWNER-2026", "name": "Admin Owner Batch"},
        headers=teacher_one_headers,
    )
    assert create_batch_response.status_code == 201
    batch = create_batch_response.json()

    teachers_response = client.get("/api/teacher/teachers", headers=admin_headers)
    assert teachers_response.status_code == 200
    teachers = teachers_response.json()
    target_teacher = next(item for item in teachers if item["username"] == "teacher.assign.two")

    assign_response = client.post(
        f"/api/teacher/batches/{batch['id']}/assign-teacher",
        json={"teacher_id": target_teacher["id"]},
        headers=admin_headers,
    )
    assert assign_response.status_code == 200
    assert assign_response.json()["primary_teacher"]["username"] == "teacher.assign.two"


def test_teacher_can_request_management_and_admin_can_approve_it(
    client,
    admin_headers_factory,
    teacher_headers_factory,
):
    admin_headers = admin_headers_factory("admin.request.approve")
    teacher_headers = teacher_headers_factory("teacher.request.approve")
    registration = _submit_registration(
        client,
        email="student.request.approve@example.com",
        reference_number="REF-REQUEST-APPROVE",
    )

    approve_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/approve",
        json={
            "issued_username": "student.request.approve",
            "temporary_password": "Student123!",
            "send_email": False,
        },
        headers=admin_headers,
    )
    assert approve_response.status_code == 200
    enrollment = approve_response.json()["enrollment"]
    assert enrollment["batch"] is None

    batch_response = client.post(
        "/api/teacher/batches",
        json={"code": "BATCH-REQUEST-APPROVE-2026", "name": "Teacher Request Batch"},
        headers=teacher_headers,
    )
    assert batch_response.status_code == 201
    batch_id = batch_response.json()["id"]

    request_response = client.post(
        f"/api/teacher/enrollments/{enrollment['id']}/request-management",
        json={"note": "Please assign this learner to my class roster."},
        headers=teacher_headers,
    )
    assert request_response.status_code == 200
    requested = request_response.json()
    assert requested["teacher_assignment_request_status"] == "pending"
    assert requested["requested_teacher"]["username"] == "teacher.request.approve"

    approval_response = client.post(
        f"/api/teacher/enrollments/{enrollment['id']}/request-management/approve",
        json={
            "batch_id": batch_id,
            "decision_note": "Approved for teacher management.",
        },
        headers=admin_headers,
    )
    assert approval_response.status_code == 200
    approved_request = approval_response.json()
    assert approved_request["teacher_assignment_request_status"] == "approved"
    assert approved_request["batch"]["id"] == batch_id
    assert approved_request["teacher_assignment_reviewed_by"]["username"] == "admin.request.approve"


def test_teacher_request_conflict_when_another_teacher_already_requested(
    client,
    admin_headers_factory,
    teacher_headers_factory,
):
    admin_headers = admin_headers_factory("admin.request.conflict")
    teacher_one_headers = teacher_headers_factory("teacher.request.one")
    teacher_two_headers = teacher_headers_factory("teacher.request.two")
    registration = _submit_registration(
        client,
        email="student.request.conflict@example.com",
        reference_number="REF-REQUEST-CONFLICT",
    )

    approve_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/approve",
        json={
            "issued_username": "student.request.conflict",
            "temporary_password": "Student123!",
            "send_email": False,
        },
        headers=admin_headers,
    )
    assert approve_response.status_code == 200
    enrollment = approve_response.json()["enrollment"]

    first_request = client.post(
        f"/api/teacher/enrollments/{enrollment['id']}/request-management",
        json={"note": "Teacher one request."},
        headers=teacher_one_headers,
    )
    assert first_request.status_code == 200
    assert first_request.json()["teacher_assignment_request_status"] == "pending"
    assert first_request.json()["requested_teacher"]["username"] == "teacher.request.one"

    second_request = client.post(
        f"/api/teacher/enrollments/{enrollment['id']}/request-management",
        json={"note": "Teacher two request."},
        headers=teacher_two_headers,
    )
    assert second_request.status_code == 409
    assert second_request.json()["detail"] == "Another teacher already has an active request for this student."


def test_admin_can_reject_teacher_management_request(
    client,
    admin_headers_factory,
    teacher_headers_factory,
):
    admin_headers = admin_headers_factory("admin.request.reject")
    teacher_headers = teacher_headers_factory("teacher.request.reject")
    registration = _submit_registration(
        client,
        email="student.request.reject@example.com",
        reference_number="REF-REQUEST-REJECT",
    )

    approve_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/approve",
        json={
            "issued_username": "student.request.reject",
            "temporary_password": "Student123!",
            "send_email": False,
        },
        headers=admin_headers,
    )
    assert approve_response.status_code == 200
    enrollment = approve_response.json()["enrollment"]

    request_response = client.post(
        f"/api/teacher/enrollments/{enrollment['id']}/request-management",
        json={"note": "Please assign this student to me."},
        headers=teacher_headers,
    )
    assert request_response.status_code == 200
    assert request_response.json()["teacher_assignment_request_status"] == "pending"

    reject_response = client.post(
        f"/api/teacher/enrollments/{enrollment['id']}/request-management/reject",
        json={"decision_note": "Not enough slots in teacher batch right now."},
        headers=admin_headers,
    )
    assert reject_response.status_code == 200
    rejected = reject_response.json()
    assert rejected["teacher_assignment_request_status"] == "rejected"
    assert rejected["teacher_assignment_decision_note"] == "Not enough slots in teacher batch right now."
    assert rejected["batch"] is None

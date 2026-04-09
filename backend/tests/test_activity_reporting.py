from __future__ import annotations

from app.db.session import SessionLocal
from app.models.user import User


def _register_and_approve_student(
    client,
    *,
    teacher_headers,
    suffix: str,
    issued_username: str,
    batch_code: str = "BATCH-REPORTS",
    batch_name: str = "Reports Batch",
):
    submit_response = client.post(
        "/api/registrations",
        data={
            "first_name": "Student",
            "middle_name": "T",
            "last_name": suffix,
            "birth_date": "2011-06-15",
            "address": "Quezon City",
            "email": f"{issued_username}@example.com",
            "phone_number": "09123456789",
            "reference_number": f"REF-{suffix}",
        },
        files={"reference_image": ("proof.png", b"proof-image", "image/png")},
    )
    assert submit_response.status_code == 201
    enrollment_id = submit_response.json()["registration"]["enrollment_id"]

    approve_response = client.post(
        f"/api/teacher/enrollments/{enrollment_id}/approve",
        json={
            "batch_code": batch_code,
            "batch_name": batch_name,
            "issued_username": issued_username,
            "temporary_password": "Student123!",
            "notes": f"Approved for {suffix}.",
            "send_email": False,
        },
        headers=teacher_headers,
    )
    assert approve_response.status_code == 200
    return approve_response.json()["enrollment"]


def _submit_activity_attempt(
    client,
    *,
    module_id: int,
    activity_key: str,
    headers,
    payload: dict,
    repeat: int = 1,
):
    for _ in range(repeat):
        response = client.post(
            f"/api/modules/{module_id}/activities/{activity_key}/attempts",
            json=payload,
            headers=headers,
        )
        assert response.status_code == 200


def test_activity_attempts_feed_teacher_review_and_summary(
    client,
    teacher_headers_factory,
    student_headers_factory,
):
    teacher_headers = teacher_headers_factory("teacher.analytics")
    approved_student_one = _register_and_approve_student(
        client,
        teacher_headers=teacher_headers,
        suffix="One",
        issued_username="student.one",
    )
    approved_student_two = _register_and_approve_student(
        client,
        teacher_headers=teacher_headers,
        suffix="Two",
        issued_username="student.two",
    )
    approved_student_three = _register_and_approve_student(
        client,
        teacher_headers=teacher_headers,
        suffix="Three",
        issued_username="student.three",
        batch_code="BATCH-EVENING",
        batch_name="Evening Batch",
    )
    approved_student_empty = _register_and_approve_student(
        client,
        teacher_headers=teacher_headers,
        suffix="Empty",
        issued_username="student.empty",
        batch_code="BATCH-EMPTY",
        batch_name="Empty Batch",
    )
    pending_registration_response = client.post(
        "/api/registrations",
        data={
            "first_name": "Student",
            "middle_name": "T",
            "last_name": "Pending",
            "birth_date": "2011-06-15",
            "address": "Quezon City",
            "email": "student.pending@example.com",
            "phone_number": "09123456789",
            "reference_number": "REF-Pending",
        },
        files={"reference_image": ("proof.png", b"proof-image", "image/png")},
    )
    assert pending_registration_response.status_code == 201

    rejected_registration_response = client.post(
        "/api/registrations",
        data={
            "first_name": "Student",
            "middle_name": "T",
            "last_name": "Rejected",
            "birth_date": "2011-06-15",
            "address": "Quezon City",
            "email": "student.rejected@example.com",
            "phone_number": "09123456789",
            "reference_number": "REF-Rejected",
        },
        files={"reference_image": ("proof.png", b"proof-image", "image/png")},
    )
    assert rejected_registration_response.status_code == 201
    rejected_enrollment_id = rejected_registration_response.json()["registration"]["enrollment_id"]
    reject_response = client.post(
        f"/api/teacher/enrollments/{rejected_enrollment_id}/reject",
        json={
            "internal_note": "Rejected for activity reporting coverage.",
            "rejection_reason_code": "incorrect_information",
            "rejection_reason_detail": None,
        },
        headers=teacher_headers,
    )
    assert reject_response.status_code == 200

    with SessionLocal() as db:
        student_one = db.query(User).filter(User.username == "student.one").first()
        student_two = db.query(User).filter(User.username == "student.two").first()
        student_three = db.query(User).filter(User.username == "student.three").first()
        assert student_one is not None
        assert student_two is not None
        assert student_three is not None

    student_one_headers = student_headers_factory("student.one")
    student_two_headers = student_headers_factory("student.two")
    student_three_headers = student_headers_factory("student.three")

    modules_response = client.get("/api/modules", headers=student_one_headers)
    assert modules_response.status_code == 200
    module = modules_response.json()[0]
    module_id = module["id"]
    activity_key = module["activities"][0]["activity_key"]
    batch_id = approved_student_one["batch"]["id"]

    low_attempt_payload = {
        "right_count": 2,
        "wrong_count": 3,
        "total_items": 5,
        "score_percent": 40,
        "improvement_areas": ["Finger spelling clarity"],
        "ai_metadata": {"capture_mode": "manual"},
        "source": "api",
        "items": [
            {
                "item_key": "m1-q1",
                "prompt": "Prompt 1",
                "expected_answer": "A",
                "student_answer": "B",
                "is_correct": False,
                "confidence": 0.21,
                "ai_metadata": {},
            },
            {
                "item_key": "m1-q2",
                "prompt": "Prompt 2",
                "expected_answer": "J and Z",
                "student_answer": "J and Z",
                "is_correct": True,
                "confidence": 0.91,
                "ai_metadata": {},
            },
            {
                "item_key": "m1-q3",
                "prompt": "Prompt 3",
                "expected_answer": "Finger-spell the word clearly letter by letter",
                "student_answer": "Skip difficult letters",
                "is_correct": False,
                "confidence": 0.35,
                "ai_metadata": {},
            },
            {
                "item_key": "m1-q4",
                "prompt": "Prompt 4",
                "expected_answer": "It helps sign names and specific terms",
                "student_answer": "It helps sign names and specific terms",
                "is_correct": True,
                "confidence": 0.94,
                "ai_metadata": {},
            },
            {
                "item_key": "m1-q5",
                "prompt": "Prompt 5",
                "expected_answer": "Clear handshape and readable pacing",
                "student_answer": "Very fast movement",
                "is_correct": False,
                "confidence": 0.29,
                "ai_metadata": {},
            },
        ],
    }
    strong_attempt_payload = {
        "right_count": 4,
        "wrong_count": 1,
        "total_items": 5,
        "score_percent": 80,
        "improvement_areas": [],
        "ai_metadata": {"capture_mode": "manual"},
        "source": "api",
        "items": [
            {
                "item_key": "m1-q1",
                "prompt": "Prompt 1",
                "expected_answer": "A",
                "student_answer": "B",
                "is_correct": False,
                "confidence": 0.33,
                "ai_metadata": {},
            },
            {
                "item_key": "m1-q2",
                "prompt": "Prompt 2",
                "expected_answer": "J and Z",
                "student_answer": "J and Z",
                "is_correct": True,
                "confidence": 0.88,
                "ai_metadata": {},
            },
            {
                "item_key": "m1-q3",
                "prompt": "Prompt 3",
                "expected_answer": "Finger-spell the word clearly letter by letter",
                "student_answer": "Finger-spell the word clearly letter by letter",
                "is_correct": True,
                "confidence": 0.82,
                "ai_metadata": {},
            },
            {
                "item_key": "m1-q4",
                "prompt": "Prompt 4",
                "expected_answer": "It helps sign names and specific terms",
                "student_answer": "It helps sign names and specific terms",
                "is_correct": True,
                "confidence": 0.9,
                "ai_metadata": {},
            },
            {
                "item_key": "m1-q5",
                "prompt": "Prompt 5",
                "expected_answer": "Clear handshape and readable pacing",
                "student_answer": "Clear handshape and readable pacing",
                "is_correct": True,
                "confidence": 0.89,
                "ai_metadata": {},
            },
        ],
    }
    medium_attempt_payload = {
        "right_count": 3,
        "wrong_count": 2,
        "total_items": 5,
        "score_percent": 60,
        "improvement_areas": ["Timing control"],
        "ai_metadata": {"capture_mode": "manual"},
        "source": "api",
        "items": [
            {
                "item_key": "m1-q1",
                "prompt": "Prompt 1",
                "expected_answer": "A",
                "student_answer": "A",
                "is_correct": True,
                "confidence": 0.87,
                "ai_metadata": {},
            },
            {
                "item_key": "m1-q2",
                "prompt": "Prompt 2",
                "expected_answer": "J and Z",
                "student_answer": "J",
                "is_correct": False,
                "confidence": 0.49,
                "ai_metadata": {},
            },
            {
                "item_key": "m1-q3",
                "prompt": "Prompt 3",
                "expected_answer": "Finger-spell the word clearly letter by letter",
                "student_answer": "Finger-spell the word clearly letter by letter",
                "is_correct": True,
                "confidence": 0.84,
                "ai_metadata": {},
            },
            {
                "item_key": "m1-q4",
                "prompt": "Prompt 4",
                "expected_answer": "It helps sign names and specific terms",
                "student_answer": "Different answer",
                "is_correct": False,
                "confidence": 0.52,
                "ai_metadata": {},
            },
            {
                "item_key": "m1-q5",
                "prompt": "Prompt 5",
                "expected_answer": "Clear handshape and readable pacing",
                "student_answer": "Clear handshape and readable pacing",
                "is_correct": True,
                "confidence": 0.88,
                "ai_metadata": {},
            },
        ],
    }

    _submit_activity_attempt(
        client,
        module_id=module_id,
        activity_key=activity_key,
        headers=student_one_headers,
        payload=low_attempt_payload,
        repeat=3,
    )
    _submit_activity_attempt(
        client,
        module_id=module_id,
        activity_key=activity_key,
        headers=student_two_headers,
        payload=strong_attempt_payload,
        repeat=2,
    )
    _submit_activity_attempt(
        client,
        module_id=module_id,
        activity_key=activity_key,
        headers=student_three_headers,
        payload=medium_attempt_payload,
    )

    student_attempts_response = client.get(
        f"/api/teacher/students/{student_one.id}/activity-attempts",
        headers=teacher_headers,
    )
    assert student_attempts_response.status_code == 200
    attempts = student_attempts_response.json()
    assert len(attempts) == 3
    attempt_id = attempts[0]["id"]

    attempt_detail_response = client.get(
        f"/api/teacher/activity-attempts/{attempt_id}",
        headers=teacher_headers,
    )
    assert attempt_detail_response.status_code == 200
    attempt_detail = attempt_detail_response.json()
    assert len(attempt_detail["items"]) == 5
    assert attempt_detail["score_percent"] == 40

    summary_response = client.get(
        f"/api/teacher/reports/summary?batch_id={batch_id}&module_id={module_id}",
        headers=teacher_headers,
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["registered_student_count"] == 4
    assert summary["total_attempts"] == 5
    assert summary["total_students"] == 2
    assert summary["weak_items"]
    assert summary["weak_items"][0]["item_key"] == "m1-q1"
    assert summary["students_needing_attention"][0]["student_id"] == student_one.id
    assert summary["recent_concern_attempts"]

    batch_breakdown_response = client.get(
        f"/api/teacher/reports/breakdown?batch_id={batch_id}",
        headers=teacher_headers,
    )
    assert batch_breakdown_response.status_code == 200
    batch_breakdown = batch_breakdown_response.json()
    assert batch_breakdown["mode"] == "batch"
    assert batch_breakdown["batch_name"] == approved_student_one["batch"]["name"]
    assert [row["student_id"] for row in batch_breakdown["rows"]] == [student_one.id, student_two.id]
    assert batch_breakdown["rows"][0]["average_score_percent"] == 40
    assert batch_breakdown["rows"][0]["attempt_count"] == 3
    assert batch_breakdown["rows"][0]["latest_attempt_at"]
    assert batch_breakdown["rows"][0]["highest_correct_module"] == {
        "module_id": module_id,
        "module_title": module["title"],
        "count": 6,
    }
    assert batch_breakdown["rows"][0]["highest_incorrect_module"] == {
        "module_id": module_id,
        "module_title": module["title"],
        "count": 9,
    }

    module_breakdown_response = client.get(
        f"/api/teacher/reports/breakdown?module_id={module_id}",
        headers=teacher_headers,
    )
    assert module_breakdown_response.status_code == 200
    module_breakdown = module_breakdown_response.json()
    assert module_breakdown["mode"] == "module"
    assert module_breakdown["module_title"] == module["title"]
    assert module_breakdown["rows"] == [
        {
            "batch_id": approved_student_one["batch"]["id"],
            "batch_name": approved_student_one["batch"]["name"],
            "average_score_percent": 56.0,
            "attempt_count": 5,
            "correct_answers": 14,
            "incorrect_answers": 11,
        },
        {
            "batch_id": approved_student_three["batch"]["id"],
            "batch_name": approved_student_three["batch"]["name"],
            "average_score_percent": 60.0,
            "attempt_count": 1,
            "correct_answers": 3,
            "incorrect_answers": 2,
        },
    ]

    batch_module_breakdown_response = client.get(
        f"/api/teacher/reports/breakdown?batch_id={batch_id}&module_id={module_id}",
        headers=teacher_headers,
    )
    assert batch_module_breakdown_response.status_code == 200
    batch_module_breakdown = batch_module_breakdown_response.json()
    assert batch_module_breakdown["mode"] == "batch_module"
    assert batch_module_breakdown["batch_name"] == approved_student_one["batch"]["name"]
    assert batch_module_breakdown["module_title"] == module["title"]
    assert batch_module_breakdown["rows"] == [
        {
            "student_id": student_one.id,
            "student_name": "Student T One",
            "average_score_percent": 40.0,
            "attempt_count": 3,
            "correct_answers": 6,
            "incorrect_answers": 9,
            "latest_attempt_at": batch_module_breakdown["rows"][0]["latest_attempt_at"],
        },
        {
            "student_id": student_two.id,
            "student_name": "Student T Two",
            "average_score_percent": 80.0,
            "attempt_count": 2,
            "correct_answers": 8,
            "incorrect_answers": 2,
            "latest_attempt_at": batch_module_breakdown["rows"][1]["latest_attempt_at"],
        },
    ]

    empty_breakdown_response = client.get(
        f"/api/teacher/reports/breakdown?batch_id={approved_student_empty['batch']['id']}",
        headers=teacher_headers,
    )
    assert empty_breakdown_response.status_code == 200
    empty_breakdown = empty_breakdown_response.json()
    assert empty_breakdown["mode"] == "batch"
    assert empty_breakdown["batch_name"] == approved_student_empty["batch"]["name"]
    assert empty_breakdown["rows"] == []

    archive_batch_response = client.post(
        f"/api/teacher/batches/{approved_student_three['batch']['id']}/archive",
        headers=teacher_headers,
    )
    assert archive_batch_response.status_code == 200
    assert archive_batch_response.json()["status"] == "archived"

    filtered_summary_response = client.get(
        "/api/teacher/reports/summary",
        headers=teacher_headers,
    )
    assert filtered_summary_response.status_code == 200
    filtered_summary = filtered_summary_response.json()
    assert filtered_summary["registered_student_count"] == 3
    assert filtered_summary["total_attempts"] == 5
    assert filtered_summary["total_students"] == 2

    archived_summary_response = client.get(
        "/api/teacher/reports/summary?include_archived_batches=true",
        headers=teacher_headers,
    )
    assert archived_summary_response.status_code == 200
    archived_summary = archived_summary_response.json()
    assert archived_summary["registered_student_count"] == 3
    assert archived_summary["total_attempts"] == 6
    assert archived_summary["total_students"] == 3

    filtered_module_breakdown_response = client.get(
        f"/api/teacher/reports/breakdown?module_id={module_id}",
        headers=teacher_headers,
    )
    assert filtered_module_breakdown_response.status_code == 200
    filtered_module_breakdown = filtered_module_breakdown_response.json()
    assert filtered_module_breakdown["rows"] == [
        {
            "batch_id": approved_student_one["batch"]["id"],
            "batch_name": approved_student_one["batch"]["name"],
            "average_score_percent": 56.0,
            "attempt_count": 5,
            "correct_answers": 14,
            "incorrect_answers": 11,
        }
    ]

    archived_module_breakdown_response = client.get(
        f"/api/teacher/reports/breakdown?module_id={module_id}&include_archived_batches=true",
        headers=teacher_headers,
    )
    assert archived_module_breakdown_response.status_code == 200
    archived_module_breakdown = archived_module_breakdown_response.json()
    assert archived_module_breakdown["rows"] == [
        {
            "batch_id": approved_student_one["batch"]["id"],
            "batch_name": approved_student_one["batch"]["name"],
            "average_score_percent": 56.0,
            "attempt_count": 5,
            "correct_answers": 14,
            "incorrect_answers": 11,
        },
        {
            "batch_id": approved_student_three["batch"]["id"],
            "batch_name": approved_student_three["batch"]["name"],
            "average_score_percent": 60.0,
            "attempt_count": 1,
            "correct_answers": 3,
            "incorrect_answers": 2,
        },
    ]

    archived_batch_breakdown_response = client.get(
        f"/api/teacher/reports/breakdown?batch_id={approved_student_three['batch']['id']}",
        headers=teacher_headers,
    )
    assert archived_batch_breakdown_response.status_code == 200
    archived_batch_breakdown = archived_batch_breakdown_response.json()
    assert archived_batch_breakdown["mode"] == "batch"
    assert archived_batch_breakdown["rows"] == []

    included_archived_batch_breakdown_response = client.get(
        f"/api/teacher/reports/breakdown?batch_id={approved_student_three['batch']['id']}&include_archived_batches=true",
        headers=teacher_headers,
    )
    assert included_archived_batch_breakdown_response.status_code == 200
    included_archived_batch_breakdown = included_archived_batch_breakdown_response.json()
    assert included_archived_batch_breakdown["mode"] == "batch"
    assert included_archived_batch_breakdown["rows"] == [
        {
            "student_id": student_three.id,
            "student_name": "Student T Three",
            "average_score_percent": 60.0,
            "attempt_count": 1,
            "latest_attempt_at": included_archived_batch_breakdown["rows"][0]["latest_attempt_at"],
            "highest_correct_module": {
                "module_id": module_id,
                "module_title": module["title"],
                "count": 3,
            },
            "highest_incorrect_module": {
                "module_id": module_id,
                "module_title": module["title"],
                "count": 2,
            },
        }
    ]

    all_breakdown_response = client.get(
        "/api/teacher/reports/breakdown",
        headers=teacher_headers,
    )
    assert all_breakdown_response.status_code == 200
    all_breakdown = all_breakdown_response.json()
    assert all_breakdown["mode"] == "all"
    assert all_breakdown["rows"] == [
        {
            "student_id": student_one.id,
            "student_name": "Student T One",
            "batch_id": approved_student_one["batch"]["id"],
            "batch_name": approved_student_one["batch"]["name"],
            "average_score_percent": 40.0,
            "attempt_count": 3,
            "latest_attempt_at": all_breakdown["rows"][0]["latest_attempt_at"],
        },
        {
            "student_id": student_two.id,
            "student_name": "Student T Two",
            "batch_id": approved_student_two["batch"]["id"],
            "batch_name": approved_student_two["batch"]["name"],
            "average_score_percent": 80.0,
            "attempt_count": 2,
            "latest_attempt_at": all_breakdown["rows"][1]["latest_attempt_at"],
        },
        {
            "student_id": approved_student_empty["student"]["id"],
            "student_name": "Student T Empty",
            "batch_id": approved_student_empty["batch"]["id"],
            "batch_name": approved_student_empty["batch"]["name"],
            "average_score_percent": None,
            "attempt_count": 0,
            "latest_attempt_at": None,
        },
    ]

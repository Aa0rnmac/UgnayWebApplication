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
    return approve_response.json()


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

    with SessionLocal() as db:
        student_one = db.query(User).filter(User.username == "student.one").first()
        student_two = db.query(User).filter(User.username == "student.two").first()
        assert student_one is not None
        assert student_two is not None

    student_one_headers = student_headers_factory("student.one")
    student_two_headers = student_headers_factory("student.two")

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

    for _ in range(3):
        low_response = client.post(
            f"/api/modules/{module_id}/activities/{activity_key}/attempts",
            json=low_attempt_payload,
            headers=student_one_headers,
        )
        assert low_response.status_code == 200

    for _ in range(2):
        strong_response = client.post(
            f"/api/modules/{module_id}/activities/{activity_key}/attempts",
            json=strong_attempt_payload,
            headers=student_two_headers,
        )
        assert strong_response.status_code == 200

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
    assert summary["total_attempts"] == 5
    assert summary["total_students"] == 2
    assert summary["weak_items"]
    assert summary["weak_items"][0]["item_key"] == "m1-q1"
    assert summary["students_needing_attention"][0]["student_id"] == student_one.id
    assert summary["recent_concern_attempts"]

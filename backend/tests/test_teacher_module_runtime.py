from __future__ import annotations

from app.models.activity_attempt import ActivityAttempt
from app.models.assessment_report import AssessmentReport
from app.models.teacher_handling_session import TeacherHandlingSession


def _register_and_approve_student(
    client,
    *,
    teacher_headers,
    suffix: str,
    issued_username: str,
):
    submit_response = client.post(
        "/api/registrations",
        data={
            "first_name": "Student",
            "middle_name": "Phase",
            "last_name": suffix,
            "birth_date": "2012-08-20",
            "address": "Quezon City",
            "email": f"{issued_username}@example.com",
            "phone_number": "09123456789",
            "reference_number": f"REF-PHASE2-{suffix}",
        },
        files={"reference_image": ("proof.png", b"proof-image", "image/png")},
    )
    assert submit_response.status_code == 201
    enrollment_id = submit_response.json()["registration"]["enrollment_id"]

    approve_response = client.post(
        f"/api/teacher/enrollments/{enrollment_id}/approve",
        json={
            "batch_code": "BATCH-PHASE2-2026",
            "batch_name": "Phase 2 Batch",
            "issued_username": issued_username,
            "temporary_password": "Student123!",
            "notes": "Approved for Phase 2 coverage.",
            "send_email": False,
        },
        headers=teacher_headers,
    )
    assert approve_response.status_code == 200
    return approve_response.json()["enrollment"]


def _publish_owned_copy(client, *, teacher_headers, source_module_id: int, share: bool = False):
    copy_response = client.post(
        f"/api/teacher/modules/{source_module_id}/copy",
        headers=teacher_headers,
    )
    assert copy_response.status_code == 201
    copied = copy_response.json()

    publish_response = client.patch(
        f"/api/teacher/modules/{copied['id']}",
        json={"is_published": True, "is_shared_pool": share},
        headers=teacher_headers,
    )
    assert publish_response.status_code == 200
    return publish_response.json()


def _submit_attempt(client, *, module: dict, headers: dict[str, str], score_percent: float = 80.0):
    activity = module["activities"][0]
    payload = {
        "right_count": 4,
        "wrong_count": 1,
        "total_items": 5,
        "score_percent": score_percent,
        "improvement_areas": ["Needs smoother transitions"],
        "ai_metadata": {},
        "source": "api",
        "notes": "Phase 2 coverage",
        "items": [
            {
                "item_key": f"{activity['activity_key']}-item-{index}",
                "prompt": f"Prompt {index}",
                "expected_answer": "Expected",
                "student_answer": "Answer",
                "is_correct": index < 4,
                "confidence": 0.88,
                "ai_metadata": {},
            }
            for index in range(5)
        ],
        "completed_lesson_id": module["lessons"][0]["id"] if module["lessons"] else None,
        "mark_module_completed": False,
    }
    response = client.post(
        f"/api/modules/{module['id']}/activities/{activity['activity_key']}/attempts",
        json=payload,
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()


def test_teacher_module_catalog_supports_share_copy_archive_restore(
    client,
    teacher_headers_factory,
):
    teacher_a_headers = teacher_headers_factory("teacher.modules.a")
    teacher_b_headers = teacher_headers_factory("teacher.modules.b")

    teacher_a_catalog = client.get("/api/teacher/modules", headers=teacher_a_headers)
    assert teacher_a_catalog.status_code == 200
    system_template = teacher_a_catalog.json()["system_templates"][0]

    teacher_a_owned = _publish_owned_copy(
        client,
        teacher_headers=teacher_a_headers,
        source_module_id=system_template["id"],
        share=True,
    )
    assert teacher_a_owned["is_shared_pool"] is True
    assert teacher_a_owned["owner_teacher"]["username"] == "teacher.modules.a"

    teacher_b_catalog = client.get("/api/teacher/modules", headers=teacher_b_headers)
    assert teacher_b_catalog.status_code == 200
    shared_pool = teacher_b_catalog.json()["shared_pool"]
    assert any(module["id"] == teacher_a_owned["id"] for module in shared_pool)

    teacher_b_copy_response = client.post(
        f"/api/teacher/modules/{teacher_a_owned['id']}/copy",
        headers=teacher_b_headers,
    )
    assert teacher_b_copy_response.status_code == 201
    teacher_b_copy = teacher_b_copy_response.json()
    assert teacher_b_copy["owner_teacher"]["username"] == "teacher.modules.b"
    assert teacher_b_copy["source_module_id"] == teacher_a_owned["id"]
    assert teacher_b_copy["is_published"] is False

    archive_response = client.post(
        f"/api/teacher/modules/{teacher_b_copy['id']}/archive",
        headers=teacher_b_headers,
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["archived_at"] is not None

    restore_response = client.post(
        f"/api/teacher/modules/{teacher_b_copy['id']}/restore",
        headers=teacher_b_headers,
    )
    assert restore_response.status_code == 200
    restored = restore_response.json()
    assert restored["archived_at"] is None
    assert restored["is_published"] is False
    assert restored["is_shared_pool"] is False


def test_student_module_resolution_and_attempt_attribution_follow_teacher_context(
    client,
    db_session,
    teacher_headers_factory,
    student_headers_factory,
):
    teacher_a_headers = teacher_headers_factory("teacher.runtime.a")
    teacher_b_headers = teacher_headers_factory("teacher.runtime.b")

    approved_student = _register_and_approve_student(
        client,
        teacher_headers=teacher_a_headers,
        suffix="Runtime",
        issued_username="student.runtime",
    )
    student_id = approved_student["student"]["id"]
    student_headers = student_headers_factory("student.runtime")

    teacher_a_catalog = client.get("/api/teacher/modules", headers=teacher_a_headers)
    assert teacher_a_catalog.status_code == 200
    system_templates = teacher_a_catalog.json()["system_templates"]
    teacher_a_owned = _publish_owned_copy(
        client,
        teacher_headers=teacher_a_headers,
        source_module_id=system_templates[0]["id"],
    )
    teacher_b_owned = _publish_owned_copy(
        client,
        teacher_headers=teacher_b_headers,
        source_module_id=system_templates[1]["id"],
    )

    before_session_modules = client.get("/api/modules", headers=student_headers)
    assert before_session_modules.status_code == 200
    before_session_payload = before_session_modules.json()
    assert any(
        module["module_kind"] == "teacher_custom"
        and module["owner_teacher"]["username"] == "teacher.runtime.a"
        for module in before_session_payload
    )
    assert not any(
        module["module_kind"] == "teacher_custom"
        and module["owner_teacher"]["username"] == "teacher.runtime.b"
        for module in before_session_payload
    )

    presence_response = client.post(
        "/api/teacher/presence",
        json={"status": "online"},
        headers=teacher_b_headers,
    )
    assert presence_response.status_code == 200

    start_session_response = client.post(
        "/api/teacher/sessions",
        json={"student_id": student_id},
        headers=teacher_b_headers,
    )
    assert start_session_response.status_code == 201
    active_session = start_session_response.json()
    assert active_session["student"]["id"] == student_id

    during_session_modules = client.get("/api/modules", headers=student_headers)
    assert during_session_modules.status_code == 200
    during_session_payload = during_session_modules.json()
    assert any(
        module["module_kind"] == "teacher_custom"
        and module["owner_teacher"]["username"] == "teacher.runtime.b"
        for module in during_session_payload
    )
    assert not any(
        module["module_kind"] == "teacher_custom"
        and module["owner_teacher"]["username"] == "teacher.runtime.a"
        for module in during_session_payload
    )

    system_module = next(module for module in during_session_payload if module["module_kind"] == "system")
    teacher_b_module = next(
        module
        for module in during_session_payload
        if module["module_kind"] == "teacher_custom"
        and module["owner_teacher"]["username"] == "teacher.runtime.b"
    )

    _submit_attempt(client, module=system_module, headers=student_headers, score_percent=78.0)
    _submit_attempt(client, module=teacher_b_module, headers=student_headers, score_percent=82.0)

    latest_attempts = (
        db_session.query(ActivityAttempt)
        .filter(ActivityAttempt.user_id == student_id)
        .order_by(ActivityAttempt.id.desc())
        .all()
    )
    assert len(latest_attempts) >= 2
    latest_custom_attempt = next(
        attempt for attempt in latest_attempts if attempt.module_id == teacher_b_owned["id"]
    )
    latest_system_attempt = next(
        attempt for attempt in latest_attempts if attempt.module_id == system_module["id"]
    )

    session_row = (
        db_session.query(TeacherHandlingSession)
        .filter(TeacherHandlingSession.id == active_session["id"])
        .first()
    )
    assert session_row is not None
    assert latest_custom_attempt.module_owner_teacher_id == teacher_b_owned["owner_teacher"]["id"]
    assert latest_custom_attempt.handled_by_teacher_id == teacher_b_owned["owner_teacher"]["id"]
    assert latest_custom_attempt.handling_session_id == session_row.id
    assert latest_system_attempt.module_owner_teacher_id is None
    assert latest_system_attempt.handled_by_teacher_id == teacher_b_owned["owner_teacher"]["id"]
    assert latest_system_attempt.handling_session_id == session_row.id

    latest_reports = (
        db_session.query(AssessmentReport)
        .filter(AssessmentReport.user_id == student_id)
        .order_by(AssessmentReport.id.desc())
        .all()
    )
    custom_report = next(report for report in latest_reports if report.module_id == teacher_b_owned["id"])
    system_report = next(report for report in latest_reports if report.module_id == system_module["id"])
    assert custom_report.module_owner_teacher_id == teacher_b_owned["owner_teacher"]["id"]
    assert custom_report.handled_by_teacher_id == teacher_b_owned["owner_teacher"]["id"]
    assert system_report.module_owner_teacher_id is None
    assert system_report.handled_by_teacher_id == teacher_b_owned["owner_teacher"]["id"]

    end_session_response = client.post(
        f"/api/teacher/sessions/{active_session['id']}/end",
        headers=teacher_b_headers,
    )
    assert end_session_response.status_code == 200

    after_session_modules = client.get("/api/modules", headers=student_headers)
    assert after_session_modules.status_code == 200
    after_session_payload = after_session_modules.json()
    teacher_a_module = next(
        module
        for module in after_session_payload
        if module["module_kind"] == "teacher_custom"
        and module["owner_teacher"]["username"] == "teacher.runtime.a"
    )

    _submit_attempt(client, module=teacher_a_module, headers=student_headers, score_percent=76.0)
    self_paced_attempt = (
        db_session.query(ActivityAttempt)
        .filter(ActivityAttempt.user_id == student_id, ActivityAttempt.module_id == teacher_a_module["id"])
        .order_by(ActivityAttempt.id.desc())
        .first()
    )
    assert self_paced_attempt is not None
    assert self_paced_attempt.module_owner_teacher_id == teacher_a_module["owner_teacher"]["id"]
    assert self_paced_attempt.handled_by_teacher_id is None
    assert self_paced_attempt.handling_session_id is None

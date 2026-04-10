from __future__ import annotations


def _submit_registration(
    client,
    *,
    suffix: str,
    issued_username: str,
):
    response = client.post(
        "/api/registrations",
        data={
            "first_name": "Student",
            "middle_name": "Scope",
            "last_name": suffix,
            "birth_date": "2012-05-01",
            "address": "Quezon City",
            "email": f"{issued_username}@example.com",
            "phone_number": "09123456789",
            "reference_number": f"REF-SCOPE-{suffix}",
        },
        files={"reference_image": ("proof.png", b"proof-image", "image/png")},
    )
    assert response.status_code == 201
    return response.json()["registration"]


def _register_and_approve_student(
    client,
    *,
    teacher_headers,
    suffix: str,
    issued_username: str,
    batch_code: str,
    batch_name: str,
):
    registration = _submit_registration(
        client,
        suffix=suffix,
        issued_username=issued_username,
    )
    approve_response = client.post(
        f"/api/teacher/enrollments/{registration['enrollment_id']}/approve",
        json={
            "batch_code": batch_code,
            "batch_name": batch_name,
            "issued_username": issued_username,
            "temporary_password": "Student123!",
            "notes": "Approved for teacher auth scoping coverage.",
            "send_email": False,
        },
        headers=teacher_headers,
    )
    assert approve_response.status_code == 200
    return approve_response.json()["enrollment"]


def _submit_attempt(client, *, module: dict, headers: dict[str, str], score_percent: float = 80.0):
    activity = module["activities"][0]
    response = client.post(
        f"/api/modules/{module['id']}/activities/{activity['activity_key']}/attempts",
        json={
            "right_count": 4,
            "wrong_count": 1,
            "total_items": 5,
            "score_percent": score_percent,
            "improvement_areas": ["Needs smoother transitions"],
            "ai_metadata": {},
            "source": "api",
            "notes": "Teacher auth scoping coverage",
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
        },
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()


def _mark_student_certificate_ready(client, *, student_headers: dict[str, str]):
    modules_response = client.get("/api/modules", headers=student_headers)
    assert modules_response.status_code == 200
    modules = modules_response.json()
    assert len(modules) == 8

    for index, module in enumerate(modules):
        score = 80 if index == 0 else 70
        right = max(0, min(score // 10, 10))
        wrong = 10 - right
        progress_response = client.post(
            f"/api/modules/{module['id']}/progress",
            json={
                "completed_lesson_id": module["lessons"][0]["id"],
                "assessment_id": f"certificate-{module['id']}-{index}",
                "assessment_title": f"Certificate Assessment {module['id']}",
                "assessment_score": score,
                "assessment_right": right,
                "assessment_wrong": wrong,
                "assessment_total": 10,
                "improvement_areas": [],
                "mark_completed": True,
            },
            headers=student_headers,
        )
        assert progress_response.status_code == 200


def test_teacher_auth_scoping_limits_enrollments_batches_and_admin_bypass(
    client,
    teacher_headers_factory,
    admin_headers_factory,
):
    teacher_a_headers = teacher_headers_factory("teacher.scope.owner")
    teacher_b_headers = teacher_headers_factory("teacher.scope.other")
    admin_headers = admin_headers_factory("admin.scope")

    pending_registration = _submit_registration(
        client,
        suffix="PendingShared",
        issued_username="student.scope.pending",
    )

    teacher_a_pending = client.get("/api/teacher/enrollments?status=pending", headers=teacher_a_headers)
    teacher_b_pending = client.get("/api/teacher/enrollments?status=pending", headers=teacher_b_headers)
    assert teacher_a_pending.status_code == 200
    assert teacher_b_pending.status_code == 200
    assert [item["id"] for item in teacher_a_pending.json()] == [pending_registration["enrollment_id"]]
    assert [item["id"] for item in teacher_b_pending.json()] == [pending_registration["enrollment_id"]]

    batch_response = client.post(
        "/api/teacher/batches",
        json={"code": "BATCH-SCOPE-OWNER-2026", "name": "Scope Owner Batch"},
        headers=teacher_a_headers,
    )
    assert batch_response.status_code == 201
    owner_batch = batch_response.json()

    approve_response = client.post(
        f"/api/teacher/enrollments/{pending_registration['enrollment_id']}/approve",
        json={
            "batch_id": owner_batch["id"],
            "issued_username": "student.scope.owner",
            "temporary_password": "Student123!",
            "notes": "Owned by teacher A.",
            "send_email": False,
        },
        headers=teacher_a_headers,
    )
    assert approve_response.status_code == 200
    approved_enrollment = approve_response.json()["enrollment"]

    rejected_registration = _submit_registration(
        client,
        suffix="RejectedByB",
        issued_username="student.scope.reject",
    )
    reject_response = client.post(
        f"/api/teacher/enrollments/{rejected_registration['enrollment_id']}/reject",
        json={
            "internal_note": "Rejected by teacher B.",
            "rejection_reason_code": "incorrect_information",
        },
        headers=teacher_b_headers,
    )
    assert reject_response.status_code == 200
    rejected_enrollment = reject_response.json()["enrollment"]

    teacher_a_approved = client.get("/api/teacher/enrollments?status=approved", headers=teacher_a_headers)
    teacher_b_approved = client.get("/api/teacher/enrollments?status=approved", headers=teacher_b_headers)
    assert teacher_a_approved.status_code == 200
    assert teacher_b_approved.status_code == 200
    assert [item["id"] for item in teacher_a_approved.json()] == [approved_enrollment["id"]]
    assert teacher_b_approved.json() == []

    teacher_a_rejected = client.get("/api/teacher/enrollments?status=rejected", headers=teacher_a_headers)
    teacher_b_rejected = client.get("/api/teacher/enrollments?status=rejected", headers=teacher_b_headers)
    assert teacher_a_rejected.status_code == 200
    assert teacher_b_rejected.status_code == 200
    assert teacher_a_rejected.json() == []
    assert [item["id"] for item in teacher_b_rejected.json()] == [rejected_enrollment["id"]]

    assert client.get(
        f"/api/teacher/enrollments/{approved_enrollment['id']}",
        headers=teacher_b_headers,
    ).status_code == 404
    assert client.get(
        f"/api/teacher/enrollments/{rejected_enrollment['id']}",
        headers=teacher_a_headers,
    ).status_code == 404
    assert client.get(
        f"/api/teacher/enrollments?batch_id={owner_batch['id']}",
        headers=teacher_b_headers,
    ).status_code == 404

    teacher_b_batches = client.get("/api/teacher/batches?status=all", headers=teacher_b_headers)
    assert teacher_b_batches.status_code == 200
    assert teacher_b_batches.json() == []
    assert client.get(
        f"/api/teacher/batches/{owner_batch['id']}/students",
        headers=teacher_b_headers,
    ).status_code == 404
    assert client.post(
        f"/api/teacher/batches/{owner_batch['id']}/archive",
        headers=teacher_b_headers,
    ).status_code == 404

    foreign_registration = _submit_registration(
        client,
        suffix="ForeignBatch",
        issued_username="student.scope.foreign",
    )
    foreign_approve_response = client.post(
        f"/api/teacher/enrollments/{foreign_registration['enrollment_id']}/approve",
        json={
            "batch_id": owner_batch["id"],
            "issued_username": "student.scope.foreign",
            "temporary_password": "Student123!",
            "notes": "Teacher B should not claim teacher A's batch.",
            "send_email": False,
        },
        headers=teacher_b_headers,
    )
    assert foreign_approve_response.status_code == 404
    assert foreign_approve_response.json()["detail"] == "Batch not found."

    admin_enrollment = client.get(
        f"/api/teacher/enrollments/{approved_enrollment['id']}",
        headers=admin_headers,
    )
    admin_rejected = client.get(
        f"/api/teacher/enrollments/{rejected_enrollment['id']}",
        headers=admin_headers,
    )
    admin_batches = client.get("/api/teacher/batches?status=all", headers=admin_headers)
    admin_students = client.get(
        f"/api/teacher/batches/{owner_batch['id']}/students",
        headers=admin_headers,
    )
    assert admin_enrollment.status_code == 200
    assert admin_rejected.status_code == 200
    assert admin_batches.status_code == 200
    assert admin_students.status_code == 200
    assert any(batch["id"] == owner_batch["id"] for batch in admin_batches.json())
    assert [student["username"] for student in admin_students.json()] == ["student.scope.owner"]


def test_temporary_handling_session_grants_foreign_student_view_but_blocks_certificate_decision(
    client,
    teacher_headers_factory,
    student_headers_factory,
):
    teacher_a_headers = teacher_headers_factory("teacher.scope.cert.owner")
    teacher_b_headers = teacher_headers_factory("teacher.scope.cert.temp")

    approved_student = _register_and_approve_student(
        client,
        teacher_headers=teacher_a_headers,
        suffix="CertificateScope",
        issued_username="student.scope.certificate",
        batch_code="BATCH-SCOPE-CERT-2026",
        batch_name="Scope Certificate Batch",
    )
    student_id = approved_student["student"]["id"]
    student_headers = student_headers_factory("student.scope.certificate")
    _mark_student_certificate_ready(client, student_headers=student_headers)

    assert client.get(
        f"/api/teacher/students/{student_id}",
        headers=teacher_b_headers,
    ).status_code == 404
    assert client.get(
        f"/api/teacher/students/{student_id}/certificate",
        headers=teacher_b_headers,
    ).status_code == 404

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

    student_response = client.get(
        f"/api/teacher/students/{student_id}",
        headers=teacher_b_headers,
    )
    certificate_response = client.get(
        f"/api/teacher/students/{student_id}/certificate",
        headers=teacher_b_headers,
    )
    attempts_response = client.get(
        f"/api/teacher/students/{student_id}/activity-attempts",
        headers=teacher_b_headers,
    )
    assert student_response.status_code == 200
    assert certificate_response.status_code == 200
    assert attempts_response.status_code == 200
    assert certificate_response.json()["summary"]["eligible"] is True
    assert attempts_response.json()

    foreign_decision_response = client.post(
        f"/api/teacher/students/{student_id}/certificate/decision",
        json={"decision": "approve", "note": "Temporary takeover should not decide."},
        headers=teacher_b_headers,
    )
    assert foreign_decision_response.status_code == 404
    assert foreign_decision_response.json()["detail"] == "Student not found."

    owner_decision_response = client.post(
        f"/api/teacher/students/{student_id}/certificate/decision",
        json={"decision": "approve", "note": "Primary teacher can decide."},
        headers=teacher_a_headers,
    )
    assert owner_decision_response.status_code == 200
    assert owner_decision_response.json()["record"]["status"] == "approved"

    end_session_response = client.post(
        f"/api/teacher/sessions/{active_session['id']}/end",
        headers=teacher_b_headers,
    )
    assert end_session_response.status_code == 200

    assert client.get(
        f"/api/teacher/students/{student_id}",
        headers=teacher_b_headers,
    ).status_code == 404
    assert client.get(
        f"/api/teacher/students/{student_id}/certificate",
        headers=teacher_b_headers,
    ).status_code == 404


def test_teacher_report_scope_keeps_owned_students_and_handled_foreign_records_only(
    client,
    teacher_headers_factory,
    student_headers_factory,
):
    teacher_a_headers = teacher_headers_factory("teacher.scope.reports.owner")
    teacher_b_headers = teacher_headers_factory("teacher.scope.reports.viewer")

    owned_student = _register_and_approve_student(
        client,
        teacher_headers=teacher_b_headers,
        suffix="OwnedReport",
        issued_username="student.scope.owned",
        batch_code="BATCH-SCOPE-OWNED-2026",
        batch_name="Scope Owned Batch",
    )
    handled_foreign_student = _register_and_approve_student(
        client,
        teacher_headers=teacher_a_headers,
        suffix="HandledForeign",
        issued_username="student.scope.handled",
        batch_code="BATCH-SCOPE-HANDLED-2026",
        batch_name="Scope Handled Batch",
    )
    unrelated_foreign_student = _register_and_approve_student(
        client,
        teacher_headers=teacher_a_headers,
        suffix="UnrelatedForeign",
        issued_username="student.scope.unrelated",
        batch_code="BATCH-SCOPE-UNRELATED-2026",
        batch_name="Scope Unrelated Batch",
    )

    owned_student_headers = student_headers_factory("student.scope.owned")
    handled_student_headers = student_headers_factory("student.scope.handled")
    unrelated_student_headers = student_headers_factory("student.scope.unrelated")

    owned_module = client.get("/api/modules", headers=owned_student_headers).json()[0]
    handled_module = client.get("/api/modules", headers=handled_student_headers).json()[0]
    unrelated_module = client.get("/api/modules", headers=unrelated_student_headers).json()[0]

    owned_attempt = _submit_attempt(
        client,
        module=owned_module,
        headers=owned_student_headers,
        score_percent=79.0,
    )
    unrelated_attempt = _submit_attempt(
        client,
        module=unrelated_module,
        headers=unrelated_student_headers,
        score_percent=61.0,
    )

    presence_response = client.post(
        "/api/teacher/presence",
        json={"status": "online"},
        headers=teacher_b_headers,
    )
    assert presence_response.status_code == 200
    start_session_response = client.post(
        "/api/teacher/sessions",
        json={"student_id": handled_foreign_student["student"]["id"]},
        headers=teacher_b_headers,
    )
    assert start_session_response.status_code == 201
    active_session = start_session_response.json()

    handled_attempt = _submit_attempt(
        client,
        module=handled_module,
        headers=handled_student_headers,
        score_percent=83.0,
    )

    end_session_response = client.post(
        f"/api/teacher/sessions/{active_session['id']}/end",
        headers=teacher_b_headers,
    )
    assert end_session_response.status_code == 200

    report_students_response = client.get("/api/teacher/reports/students", headers=teacher_b_headers)
    summary_response = client.get("/api/teacher/reports/summary", headers=teacher_b_headers)
    breakdown_response = client.get("/api/teacher/reports/breakdown", headers=teacher_b_headers)
    assert report_students_response.status_code == 200
    assert summary_response.status_code == 200
    assert breakdown_response.status_code == 200

    report_student_ids = [row["student_id"] for row in report_students_response.json()["students"]]
    breakdown_student_ids = [row["student_id"] for row in breakdown_response.json()["rows"]]
    assert owned_student["student"]["id"] in report_student_ids
    assert handled_foreign_student["student"]["id"] in report_student_ids
    assert unrelated_foreign_student["student"]["id"] not in report_student_ids
    assert owned_student["student"]["id"] in breakdown_student_ids
    assert handled_foreign_student["student"]["id"] in breakdown_student_ids
    assert unrelated_foreign_student["student"]["id"] not in breakdown_student_ids

    summary = summary_response.json()
    assert summary["registered_student_count"] == 1
    assert summary["total_students"] == 2
    assert summary["total_attempts"] == 2

    handled_attempt_detail = client.get(
        f"/api/teacher/reports/activity-attempts/{handled_attempt['id']}",
        headers=teacher_b_headers,
    )
    owned_attempt_detail = client.get(
        f"/api/teacher/reports/activity-attempts/{owned_attempt['id']}",
        headers=teacher_b_headers,
    )
    unrelated_attempt_detail = client.get(
        f"/api/teacher/reports/activity-attempts/{unrelated_attempt['id']}",
        headers=teacher_b_headers,
    )
    assert handled_attempt_detail.status_code == 200
    assert owned_attempt_detail.status_code == 200
    assert unrelated_attempt_detail.status_code == 404

    handled_student_attempts = client.get(
        f"/api/teacher/reports/students/{handled_foreign_student['student']['id']}/activity-attempts",
        headers=teacher_b_headers,
    )
    unrelated_student_attempts = client.get(
        f"/api/teacher/reports/students/{unrelated_foreign_student['student']['id']}/activity-attempts",
        headers=teacher_b_headers,
    )
    assert handled_student_attempts.status_code == 200
    assert unrelated_student_attempts.status_code == 404
    assert [item["id"] for item in handled_student_attempts.json()] == [handled_attempt["id"]]

    generic_handled_attempt = client.get(
        f"/api/teacher/activity-attempts/{handled_attempt['id']}",
        headers=teacher_b_headers,
    )
    generic_unrelated_attempt = client.get(
        f"/api/teacher/activity-attempts/{unrelated_attempt['id']}",
        headers=teacher_b_headers,
    )
    assert generic_handled_attempt.status_code == 200
    assert generic_unrelated_attempt.status_code == 404

    generate_handled_report = client.post(
        f"/api/teacher/reports/students/{handled_foreign_student['student']['id']}/generate",
        headers=teacher_b_headers,
    )
    generate_unrelated_report = client.post(
        f"/api/teacher/reports/students/{unrelated_foreign_student['student']['id']}/generate",
        headers=teacher_b_headers,
    )
    assert generate_handled_report.status_code == 200
    assert generate_unrelated_report.status_code == 404
    assert generate_unrelated_report.json()["detail"] == "Student not found."

    foreign_batch_id = handled_foreign_student["batch"]["id"]
    foreign_summary = client.get(
        f"/api/teacher/reports/summary?batch_id={foreign_batch_id}",
        headers=teacher_b_headers,
    )
    foreign_breakdown = client.get(
        f"/api/teacher/reports/breakdown?batch_id={foreign_batch_id}",
        headers=teacher_b_headers,
    )
    assert foreign_summary.status_code == 404
    assert foreign_breakdown.status_code == 404

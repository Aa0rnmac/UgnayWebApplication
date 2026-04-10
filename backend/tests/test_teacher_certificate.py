from __future__ import annotations


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
            "middle_name": "C",
            "last_name": suffix,
            "birth_date": "2011-06-15",
            "address": "Quezon City",
            "email": f"{issued_username}@example.com",
            "phone_number": "09123456789",
            "reference_number": f"REF-CERT-{suffix}",
        },
        files={"reference_image": ("proof.png", b"proof-image", "image/png")},
    )
    assert submit_response.status_code == 201
    enrollment_id = submit_response.json()["registration"]["enrollment_id"]

    approve_response = client.post(
        f"/api/teacher/enrollments/{enrollment_id}/approve",
        json={
            "batch_code": "BATCH-CERT-2026",
            "batch_name": "Certificate Batch",
            "issued_username": issued_username,
            "temporary_password": "Student123!",
            "notes": "Approved for certificate coverage.",
            "send_email": False,
        },
        headers=teacher_headers,
    )
    assert approve_response.status_code == 200
    return approve_response.json()["enrollment"]


def _save_module_progress(
    client,
    *,
    module: dict,
    headers: dict[str, str],
    score: int,
    assessment_id: str,
):
    right = max(0, min(score // 10, 10))
    wrong = 10 - right
    response = client.post(
        f"/api/modules/{module['id']}/progress",
        json={
            "completed_lesson_id": module["lessons"][0]["id"],
            "assessment_id": assessment_id,
            "assessment_title": f"Certificate Assessment {assessment_id}",
            "assessment_score": score,
            "assessment_right": right,
            "assessment_wrong": wrong,
            "assessment_total": 10,
            "improvement_areas": [],
            "mark_completed": True,
        },
        headers=headers,
    )
    assert response.status_code == 200


def test_teacher_certificate_summary_uses_best_module_scores_and_persists_decisions(
    client,
    teacher_headers_factory,
    student_headers_factory,
):
    teacher_headers = teacher_headers_factory("teacher.certificate")
    approved_student = _register_and_approve_student(
        client,
        teacher_headers=teacher_headers,
        suffix="Eligible",
        issued_username="student.certificate",
    )
    student_headers = student_headers_factory("student.certificate")

    modules_response = client.get("/api/modules", headers=student_headers)
    assert modules_response.status_code == 200
    modules = modules_response.json()
    assert len(modules) == 8

    for index, module in enumerate(modules):
        _save_module_progress(
            client,
            module=module,
            headers=student_headers,
            score=80 if index == 0 else 70,
            assessment_id=f"module-{module['id']}-best",
        )

    _save_module_progress(
        client,
        module=modules[0],
        headers=student_headers,
        score=60,
        assessment_id=f"module-{modules[0]['id']}-latest",
    )

    summary_response = client.get(
        f"/api/teacher/students/{approved_student['student']['id']}/certificate",
        headers=teacher_headers,
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["summary"]["target_required_modules"] == 12
    assert summary["summary"]["effective_required_modules"] == 8
    assert summary["summary"]["completed_required_modules"] == 8
    assert summary["summary"]["eligible"] is True
    assert summary["summary"]["average_best_score"] == 71.25
    assert summary["record"] is None
    assert summary["template"] is not None
    assert summary["template"]["certificate_reference"].startswith("PREVIEW-")

    first_module = summary["modules"][0]
    assert first_module["latest_score"] == 60.0
    assert first_module["best_score"] == 80.0
    assert first_module["certificate_score_used"] == 80.0
    assert first_module["passed"] is True

    reject_response = client.post(
        f"/api/teacher/students/{approved_student['student']['id']}/certificate/decision",
        json={"decision": "reject", "note": "Needs one final teacher sign-off review."},
        headers=teacher_headers,
    )
    assert reject_response.status_code == 200
    rejected = reject_response.json()
    assert rejected["record"]["status"] == "rejected"
    assert rejected["record"]["decision_note"] == "Needs one final teacher sign-off review."
    assert rejected["record"]["issued_at"] is None
    assert rejected["template"] is not None

    approve_response = client.post(
        f"/api/teacher/students/{approved_student['student']['id']}/certificate/decision",
        json={"decision": "approve", "note": "Certificate approved."},
        headers=teacher_headers,
    )
    assert approve_response.status_code == 200
    approved = approve_response.json()
    assert approved["record"]["status"] == "approved"
    assert approved["record"]["decision_note"] == "Certificate approved."
    assert approved["record"]["issued_at"] is not None
    assert approved["record"]["certificate_reference"].startswith("CERT-")
    assert approved["template"]["certificate_reference"] == approved["record"]["certificate_reference"]


def test_teacher_certificate_blocks_decisions_until_student_is_eligible(
    client,
    teacher_headers_factory,
    student_headers_factory,
):
    teacher_headers = teacher_headers_factory("teacher.certificate.ineligible")
    approved_student = _register_and_approve_student(
        client,
        teacher_headers=teacher_headers,
        suffix="Ineligible",
        issued_username="student.certificate.ineligible",
    )
    student_headers = student_headers_factory("student.certificate.ineligible")

    modules_response = client.get("/api/modules", headers=student_headers)
    assert modules_response.status_code == 200
    modules = modules_response.json()
    assert len(modules) == 8

    _save_module_progress(
        client,
        module=modules[0],
        headers=student_headers,
        score=90,
        assessment_id=f"module-{modules[0]['id']}-only",
    )

    summary_response = client.get(
        f"/api/teacher/students/{approved_student['student']['id']}/certificate",
        headers=teacher_headers,
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["summary"]["eligible"] is False
    assert summary["summary"]["completed_required_modules"] == 1
    assert summary["template"] is None

    approve_response = client.post(
        f"/api/teacher/students/{approved_student['student']['id']}/certificate/decision",
        json={"decision": "approve", "note": "Trying too early."},
        headers=teacher_headers,
    )
    assert approve_response.status_code == 409
    assert approve_response.json()["detail"] == "Student does not currently meet the certificate criteria."

    reject_response = client.post(
        f"/api/teacher/students/{approved_student['student']['id']}/certificate/decision",
        json={"decision": "reject", "note": "Trying too early."},
        headers=teacher_headers,
    )
    assert reject_response.status_code == 409
    assert reject_response.json()["detail"] == "Student does not currently meet the certificate criteria."


def test_student_cannot_access_teacher_certificate_routes(
    client,
    teacher_headers_factory,
    student_headers_factory,
):
    teacher_headers = teacher_headers_factory("teacher.certificate.access")
    approved_student = _register_and_approve_student(
        client,
        teacher_headers=teacher_headers,
        suffix="Access",
        issued_username="student.certificate.access",
    )
    student_headers = student_headers_factory("student.certificate.access")

    summary_response = client.get(
        f"/api/teacher/students/{approved_student['student']['id']}/certificate",
        headers=student_headers,
    )
    assert summary_response.status_code == 403

    decision_response = client.post(
        f"/api/teacher/students/{approved_student['student']['id']}/certificate/decision",
        json={"decision": "approve"},
        headers=student_headers,
    )
    assert decision_response.status_code == 403

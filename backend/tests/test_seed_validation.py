from __future__ import annotations


def test_seeded_module_catalog_exposes_12_slots_and_8_published_modules(
    client,
    teacher_headers_factory,
    student_headers_factory,
):
    teacher_headers = teacher_headers_factory("teacher.seed")
    student_headers = student_headers_factory("student.seed")

    teacher_modules_response = client.get("/api/modules", headers=teacher_headers)
    assert teacher_modules_response.status_code == 200
    teacher_modules = teacher_modules_response.json()
    assert len(teacher_modules) == 12
    assert sum(1 for module in teacher_modules if module["is_published"]) == 8
    assert any(not module["is_published"] for module in teacher_modules[-4:])

    student_modules_response = client.get("/api/modules", headers=student_headers)
    assert student_modules_response.status_code == 200
    student_modules = student_modules_response.json()
    assert len(student_modules) == 8
    assert all(module["is_published"] for module in student_modules)
    assert all(module["activities"] for module in student_modules)

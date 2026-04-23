from __future__ import annotations

from datetime import timedelta

from app.core.datetime_utils import utc_now
from app.services.teacher_invites import build_qr_payload


def test_teacher_invite_expiry_and_revoke(
    client,
    monkeypatch,
    teacher_headers_factory,
    teacher_invite_factory,
):
    monkeypatch.setattr(
        "app.api.routes.auth.send_teacher_initial_credentials_email",
        lambda **_: None,
    )

    expired_invite = teacher_invite_factory(
        invite_code="expired-invite-code",
        passkey="PASSKEY123",
        expires_at=utc_now() - timedelta(days=1),
    )
    expired_response = client.post(
        "/api/auth/teacher-invite/verify-qr",
        json={"qr_payload": build_qr_payload(expired_invite.invite_code)},
    )
    assert expired_response.status_code == 401
    assert "expired" in expired_response.json()["detail"].lower()

    active_invite = teacher_invite_factory(
        invite_code="revocable-invite-code",
        passkey="PASSKEY456",
        expires_at=utc_now() + timedelta(days=3),
        max_use_count=2,
    )
    teacher_headers = teacher_headers_factory("teacher.invite")
    revoke_response = client.post(
        f"/api/auth/teacher-invite/{active_invite.invite_code}/revoke",
        json={"reason": "Invite should no longer be used."},
        headers=teacher_headers,
    )
    assert revoke_response.status_code == 200

    revoked_verify_response = client.post(
        "/api/auth/teacher-invite/verify-qr",
        json={"qr_payload": build_qr_payload(active_invite.invite_code)},
    )
    assert revoked_verify_response.status_code == 401
    assert "revoked" in revoked_verify_response.json()["detail"].lower()


def test_teacher_invite_usage_limit_is_enforced(client, monkeypatch, teacher_invite_factory):
    monkeypatch.setattr(
        "app.api.routes.auth.send_teacher_initial_credentials_email",
        lambda **_: None,
    )

    invite = teacher_invite_factory(
        invite_code="limited-invite-code",
        passkey="PASSKEY789",
        expires_at=utc_now() + timedelta(days=7),
        max_use_count=1,
    )

    verify_qr_response = client.post(
        "/api/auth/teacher-invite/verify-qr",
        json={"qr_payload": build_qr_payload(invite.invite_code)},
    )
    assert verify_qr_response.status_code == 200
    assert verify_qr_response.json()["remaining_uses"] == 1

    verify_passkey_response = client.post(
        "/api/auth/teacher-invite/verify-passkey",
        json={"invite_code": invite.invite_code, "passkey": "PASSKEY789"},
    )
    assert verify_passkey_response.status_code == 200
    onboarding_token = verify_passkey_response.json()["onboarding_token"]

    issue_response = client.post(
        "/api/auth/teacher-invite/issue-credentials",
        json={
            "onboarding_token": onboarding_token,
            "email": "new.teacher@example.com",
        },
    )
    assert issue_response.status_code == 200

    second_issue_response = client.post(
        "/api/auth/teacher-invite/issue-credentials",
        json={
            "onboarding_token": onboarding_token,
            "email": "another.teacher@example.com",
        },
    )
    assert second_issue_response.status_code == 401
    assert "usage limit" in second_issue_response.json()["detail"].lower()

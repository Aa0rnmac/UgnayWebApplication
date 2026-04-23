import base64
import hashlib
import hmac
import json
import secrets
import string
from datetime import timedelta

from app.core.config import settings
from app.core.datetime_utils import as_utc, utc_now
from app.models.teacher_invite import TeacherInvite

INVITE_PREFIX = "UGNAY:TEACHER_INVITE"


def _secret_bytes() -> bytes:
    secret = settings.teacher_invite_signing_secret.strip()
    if not secret:
        raise ValueError("TEACHER_INVITE_SIGNING_SECRET is not configured.")
    if settings.is_production_like and secret == "change-me-teacher-invite-secret":
        raise ValueError("TEACHER_INVITE_SIGNING_SECRET must be changed before production use.")
    return secret.encode("utf-8")


def sign_invite_code(invite_code: str) -> str:
    digest = hmac.new(_secret_bytes(), invite_code.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest


def build_qr_payload(invite_code: str) -> str:
    signature = sign_invite_code(invite_code)
    return f"{INVITE_PREFIX}:{invite_code}:{signature}"


def parse_qr_payload(payload: str) -> str:
    parts = (payload or "").strip().split(":")
    if len(parts) != 4 or f"{parts[0]}:{parts[1]}" != INVITE_PREFIX:
        raise ValueError("Invalid QR payload format.")
    invite_code = parts[2]
    signature = parts[3]
    expected = sign_invite_code(invite_code)
    if not hmac.compare_digest(signature, expected):
        raise ValueError("Invalid or tampered QR payload.")
    return invite_code


def create_onboarding_token(invite_code: str, minutes: int = 10) -> str:
    payload = {
        "invite_code": invite_code,
        "exp": (utc_now() + timedelta(minutes=minutes)).timestamp(),
    }
    payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_json).decode("utf-8").rstrip("=")
    signature = hmac.new(_secret_bytes(), payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{signature}"


def verify_onboarding_token(token: str) -> str:
    try:
        payload_b64, signature = token.split(".", maxsplit=1)
    except ValueError as exc:
        raise ValueError("Invalid onboarding token.") from exc

    expected = hmac.new(_secret_bytes(), payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise ValueError("Invalid onboarding token signature.")

    padded = payload_b64 + "=" * (-len(payload_b64) % 4)
    try:
        payload_json = base64.urlsafe_b64decode(padded.encode("utf-8"))
        payload = json.loads(payload_json.decode("utf-8"))
    except Exception as exc:
        raise ValueError("Invalid onboarding token payload.") from exc

    expires = float(payload.get("exp", 0))
    if utc_now().timestamp() > expires:
        raise ValueError("Onboarding token expired.")

    invite_code = str(payload.get("invite_code", "")).strip()
    if not invite_code:
        raise ValueError("Onboarding token missing invite code.")
    return invite_code


def ensure_invite_is_usable(invite: TeacherInvite | None) -> TeacherInvite:
    if invite is None:
        raise ValueError("Teacher invite is invalid or inactive.")
    if invite.revoked_at is not None:
        raise ValueError("Teacher invite has been revoked.")
    expires_at = as_utc(invite.expires_at)
    if expires_at and expires_at < utc_now():
        raise ValueError("Teacher invite has expired.")
    if invite.max_use_count is not None and invite.use_count >= invite.max_use_count:
        raise ValueError("Teacher invite has reached its usage limit.")
    if invite.status != "active":
        raise ValueError("Teacher invite is invalid or inactive.")
    return invite


def generate_invite_code() -> str:
    return secrets.token_urlsafe(18).replace("-", "").replace("_", "")[:24]


def generate_teacher_passkey(length: int = 14) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_temporary_password(length: int = 12) -> str:
    uppercase = secrets.choice(string.ascii_uppercase)
    lowercase = secrets.choice(string.ascii_lowercase)
    digit = secrets.choice(string.digits)
    symbol = secrets.choice("!@#$%^&*()-_=+[]{}")
    pool = string.ascii_letters + string.digits + "!@#$%^&*()-_=+[]{}"
    remaining = [secrets.choice(pool) for _ in range(max(0, length - 4))]
    chars = [uppercase, lowercase, digit, symbol, *remaining]
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)

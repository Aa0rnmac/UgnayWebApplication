import hashlib
import hmac
import secrets
import string


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
    ).hex()
    return f"{salt}${hashed}"


def verify_password(password: str, stored_value: str) -> bool:
    try:
        salt, expected_hash = stored_value.split("$", maxsplit=1)
    except ValueError:
        return False

    candidate_hash = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
    ).hex()
    return hmac.compare_digest(candidate_hash, expected_hash)


def create_session_token() -> str:
    return secrets.token_urlsafe(32)


def create_temporary_password(length: int = 12) -> str:
    uppercase = secrets.choice(string.ascii_uppercase)
    lowercase = secrets.choice(string.ascii_lowercase)
    digit = secrets.choice(string.digits)
    symbol = secrets.choice("!@#$%^&*")
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    remaining = [secrets.choice(alphabet) for _ in range(max(4, length) - 4)]
    password_chars = [uppercase, lowercase, digit, symbol, *remaining]
    secrets.SystemRandom().shuffle(password_chars)
    return "".join(password_chars)


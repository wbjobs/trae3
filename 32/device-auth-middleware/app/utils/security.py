import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from jose import jwt

from app.utils.config import get_config


def hash_secret(secret: str) -> str:
    salt = secrets.token_hex(8)
    pw_hash = hashlib.sha256((salt + secret).encode()).hexdigest()
    return f"{salt}${pw_hash}"


def verify_secret(secret: str, hashed: str) -> bool:
    salt, pw_hash = hashed.split("$", 1)
    computed = hashlib.sha256((salt + secret).encode()).hexdigest()
    return secrets.compare_digest(computed, pw_hash)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    cfg = get_config()["auth"]
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=cfg["access_token_expire_minutes"])
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, cfg["secret_key"], algorithm=cfg["algorithm"])


def create_temp_token(data: dict, expires_delta: timedelta | None = None) -> str:
    cfg = get_config()["auth"]
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=cfg["temp_token_expire_minutes"])
    )
    to_encode.update({"exp": expire, "type": "temp"})
    return jwt.encode(to_encode, cfg["secret_key"], algorithm=cfg["algorithm"])


def decode_token(token: str) -> dict | None:
    cfg = get_config()["auth"]
    try:
        payload = jwt.decode(token, cfg["secret_key"], algorithms=[cfg["algorithm"]])
        return payload
    except Exception:
        return None

import hashlib
import os
import secrets

from cryptography.fernet import Fernet


def generate_key() -> bytes:
    return Fernet.generate_key()


def encrypt_data(data: bytes, key: bytes) -> bytes:
    f = Fernet(key)
    return f.encrypt(data)


def decrypt_data(token: bytes, key: bytes) -> bytes:
    f = Fernet(key)
    return f.decrypt(token)


def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_bytes(32)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return dk.hex(), salt.hex()


def verify_password(password: str, stored_hash: str, salt_hex: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return secrets.compare_digest(dk.hex(), stored_hash)


def generate_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def _normalize_line_endings(data: bytes) -> bytes:
    return data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def compute_file_hash(
    file_path: str,
    algorithm: str = "sha256",
    normalize_newlines: bool = False,
    chunk_size: int = 8192,
) -> str:
    h = hashlib.new(algorithm)
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            if normalize_newlines:
                chunk = _normalize_line_endings(chunk)
            h.update(chunk)
    return h.hexdigest()


def compute_data_hash(
    data: bytes,
    algorithm: str = "sha256",
    normalize_newlines: bool = False,
) -> str:
    if normalize_newlines:
        data = _normalize_line_endings(data)
    return hashlib.new(algorithm, data).hexdigest()


def compute_text_hash(
    text: str,
    algorithm: str = "sha256",
    encoding: str = "utf-8",
    normalize_newlines: bool = True,
) -> str:
    data = text.encode(encoding)
    if normalize_newlines:
        data = _normalize_line_endings(data)
    return hashlib.new(algorithm, data).hexdigest()


def verify_file_hash(
    file_path: str,
    expected_hash: str,
    algorithm: str = "sha256",
    normalize_newlines: bool = False,
) -> tuple[bool, str]:
    try:
        actual = compute_file_hash(file_path, algorithm, normalize_newlines)
        matched = secrets.compare_digest(actual.lower(), expected_hash.lower())
        return matched, actual
    except OSError as e:
        return False, f"Error: {e}"


def verify_data_hash(
    data: bytes,
    expected_hash: str,
    algorithm: str = "sha256",
    normalize_newlines: bool = False,
) -> tuple[bool, str]:
    actual = compute_data_hash(data, algorithm, normalize_newlines)
    matched = secrets.compare_digest(actual.lower(), expected_hash.lower())
    return matched, actual

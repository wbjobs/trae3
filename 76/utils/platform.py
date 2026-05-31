import os
import sys
from typing import Any


def is_macos() -> bool:
    return sys.platform == "darwin"


def is_windows() -> bool:
    return sys.platform == "win32"


def is_linux() -> bool:
    return sys.platform.startswith("linux")


def normalize_path(path: str) -> str:
    normalized = os.path.normpath(path)
    if is_windows():
        normalized = normalized.replace("\\", "/")
    return normalized


def get_app_safe_path(path: str) -> str:
    if is_macos():
        path = os.path.expanduser(path)
    return os.path.abspath(path)


def safe_makedirs(path: str, exist_ok: bool = True) -> None:
    try:
        os.makedirs(path, exist_ok=exist_ok)
    except OSError:
        pass


def safe_remove(path: str) -> bool:
    try:
        if os.path.isfile(path):
            os.remove(path)
            return True
        elif os.path.isdir(path):
            import shutil
            shutil.rmtree(path)
            return True
    except OSError:
        return False
    return False


def get_file_encoding() -> str:
    if is_windows():
        return "utf-8-sig"
    return "utf-8"


def read_file_safe(file_path: str, binary: bool = False) -> Any:
    encoding = None if binary else get_file_encoding()
    with open(file_path, "rb" if binary else "r", encoding=encoding) as f:
        return f.read()


def write_file_safe(file_path: str, content: Any, binary: bool = False) -> None:
    dir_path = os.path.dirname(file_path)
    if dir_path:
        safe_makedirs(dir_path)
    encoding = None if binary else "utf-8"
    mode = "wb" if binary else "w"
    with open(file_path, mode, encoding=encoding) as f:
        f.write(content)


def get_thread_name() -> str:
    import threading
    current = threading.current_thread()
    return current.name or "Unknown"

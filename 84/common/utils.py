import json
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Optional, Union

from .exceptions import StorageError


def generate_uuid() -> str:
    return str(uuid.uuid4())


def get_timestamp() -> float:
    return datetime.now(timezone.utc).timestamp()


def get_datetime_string() -> str:
    return datetime.now(timezone.utc).isoformat()


def serialize_data(data: Any, format: str = "json") -> Union[str, bytes]:
    if format == "json":
        return json.dumps(data, ensure_ascii=False, default=_json_default)
    elif format == "bytes":
        return json.dumps(data, ensure_ascii=False, default=_json_default).encode("utf-8")
    else:
        raise ValueError(f"Unsupported serialization format: {format}")


def deserialize_data(data: Union[str, bytes], format: str = "json") -> Any:
    if format == "json":
        if isinstance(data, bytes):
            data = data.decode("utf-8")
        return json.loads(data)
    else:
        raise ValueError(f"Unsupported deserialization format: {format}")


def _json_default(obj: Any) -> Any:
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    if isinstance(obj, set):
        return list(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def setup_logger(
    name: str,
    log_file: Optional[str] = None,
    level: int = logging.INFO,
    format_string: Optional[str] = None,
) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.handlers.clear()

    if format_string is None:
        format_string = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    formatter = logging.Formatter(format_string)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    if log_file:
        try:
            log_dir = os.path.dirname(log_file)
            if log_dir and not os.path.exists(log_dir):
                os.makedirs(log_dir, exist_ok=True)
            file_handler = logging.FileHandler(log_file, encoding="utf-8")
            file_handler.setLevel(level)
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        except OSError as e:
            raise StorageError(f"Failed to create log file: {log_file}", storage_path=log_file, details=str(e))

    logger.propagate = False
    return logger


def safe_filename(filename: str) -> str:
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, "_")
    return filename.strip()


def ensure_directory(path: str) -> None:
    if not os.path.exists(path):
        os.makedirs(path, exist_ok=True)


def retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: tuple = (Exception,),
):
    import functools
    import time

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            attempts = 0
            current_delay = delay
            while attempts < max_attempts:
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    attempts += 1
                    if attempts >= max_attempts:
                        raise
                    time.sleep(current_delay)
                    current_delay *= backoff
            return None
        return wrapper
    return decorator

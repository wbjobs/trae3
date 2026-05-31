import logging
import os
import re
from logging.handlers import RotatingFileHandler
from pythonjsonlogger import jsonlogger

from .config import get_config


class RedactingFilter(logging.Filter):
    def __init__(self):
        super().__init__()
        self._sensitive_patterns = [
            re.compile(r'password["\']?\s*[:=]\s*["\']?[^"\',\s]+', re.IGNORECASE),
            re.compile(r'token["\']?\s*[:=]\s*["\']?[^"\',\s]+', re.IGNORECASE),
            re.compile(r'(secret|api[_-]?key)["\']?\s*[:=]\s*["\']?[^"\',\s]+', re.IGNORECASE),
        ]
        self._redundant_patterns = [
            re.compile(r'<.*?>'),
            re.compile(r'\\x[0-9a-fA-F]{2}'),
        ]

    def filter(self, record):
        if isinstance(record.msg, str):
            record.msg = self._redact_sensitive(record.msg)
            record.msg = self._clean_redundant(record.msg)
        if hasattr(record, 'args') and record.args:
            record.args = tuple(
                self._redact_sensitive(str(arg)) if isinstance(arg, str) else arg
                for arg in record.args
            )
        return True

    def _redact_sensitive(self, message: str) -> str:
        for pattern in self._sensitive_patterns:
            message = pattern.sub('[REDACTED]', message)
        return message

    def _clean_redundant(self, message: str) -> str:
        for pattern in self._redundant_patterns:
            message = pattern.sub('', message)
        return message.strip()


class DuplicateFilter(logging.Filter):
    def __init__(self, rate_limit_seconds: int = 60):
        super().__init__()
        self._last_logs = {}
        self._rate_limit = rate_limit_seconds
        import time
        self._time = time

    def filter(self, record):
        key = (record.levelno, record.getMessage()[:100])
        current_time = self._time.time()
        
        if key in self._last_logs:
            if current_time - self._last_logs[key] < self._rate_limit:
                return False
        
        self._last_logs[key] = current_time
        if len(self._last_logs) > 1000:
            self._last_logs.clear()
        
        return True


def setup_logger(name: str = "api-gateway") -> logging.Logger:
    config = get_config()
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, config.logging.level.upper()))
    logger.propagate = False

    if logger.handlers:
        return logger

    logger.addFilter(RedactingFilter())
    logger.addFilter(DuplicateFilter(rate_limit_seconds=30))

    console_handler = logging.StreamHandler()
    console_formatter = logging.Formatter(config.logging.format)
    console_handler.setFormatter(console_formatter)
    console_handler.setLevel(logging.INFO)
    logger.addHandler(console_handler)

    os.makedirs(os.path.dirname(config.logging.file_path), exist_ok=True)
    file_handler = RotatingFileHandler(
        config.logging.file_path,
        maxBytes=config.logging.max_bytes,
        backupCount=config.logging.backup_count,
        encoding="utf-8"
    )
    json_formatter = jsonlogger.JsonFormatter(
        "%(asctime)s %(name)s %(levelname)s %(message)s %(module)s %(funcName)s %(lineno)d"
    )
    file_handler.setFormatter(json_formatter)
    file_handler.setLevel(logging.DEBUG)
    logger.addHandler(file_handler)

    logging.getLogger("paho").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    return logger


def get_logger(name: str = None) -> logging.Logger:
    if name:
        return logging.getLogger(f"api-gateway.{name}")
    return logging.getLogger("api-gateway")


def cleanup_old_logs(log_dir: str = "./logs", keep_days: int = 7) -> None:
    import time
    import glob
    
    cutoff_time = time.time() - (keep_days * 86400)
    
    for log_file in glob.glob(os.path.join(log_dir, "*.log*")):
        try:
            if os.path.getmtime(log_file) < cutoff_time:
                os.remove(log_file)
                logger.info(f"Cleaned up old log file: {log_file}")
        except Exception as e:
            logger.warning(f"Failed to cleanup log file {log_file}: {e}")


logger = setup_logger()

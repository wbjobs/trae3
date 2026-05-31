import logging
import hashlib
import json
from typing import Any

logger = logging.getLogger(__name__)


def compute_hash(data: Any) -> str:
    raw = json.dumps(data, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]


def validate_sediment_params(params: dict) -> bool:
    required = ["river_reach", "start_time", "end_time", "flow_rate"]
    for key in required:
        if key not in params:
            logger.error(f"Missing required parameter: {key}")
            return False
    if params["start_time"] >= params["end_time"]:
        logger.error("start_time must be less than end_time")
        return False
    if params["flow_rate"] <= 0:
        logger.error("flow_rate must be positive")
        return False
    return True


def format_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    elif seconds < 3600:
        return f"{seconds / 60:.1f}min"
    else:
        return f"{seconds / 3600:.2f}h"


def safe_divide(a: float, b: float, default: float = 0.0) -> float:
    try:
        return a / b
    except ZeroDivisionError:
        return default

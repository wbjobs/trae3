from typing import Dict, List, Optional, Set
from enum import Enum
from datetime import datetime
import threading
import fnmatch

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logger import get_logger
from protocols.models import ProtocolMessage, ProtocolType

logger = get_logger(__name__)


class FilterMode(str, Enum):
    WHITELIST = "whitelist"
    BLACKLIST = "blacklist"
    DISABLED = "disabled"


class ProtocolFilterRule:
    def __init__(
        self,
        name: str,
        protocol: Optional[ProtocolType] = None,
        source_pattern: Optional[str] = None,
        topic_pattern: Optional[str] = None,
        target_pattern: Optional[str] = None,
        payload_field: Optional[str] = None,
        payload_value: Optional[str] = None,
        enabled: bool = True
    ):
        self.name = name
        self.protocol = protocol
        self.source_pattern = source_pattern
        self.topic_pattern = topic_pattern
        self.target_pattern = target_pattern
        self.payload_field = payload_field
        self.payload_value = payload_value
        self.enabled = enabled
        self.match_count = 0
        self._lock = threading.RLock()

    def matches(self, message: ProtocolMessage) -> bool:
        if not self.enabled:
            return False

        if self.protocol:
            msg_protocol = message.protocol.value if hasattr(message.protocol, 'value') else str(message.protocol)
            if msg_protocol != self.protocol.value:
                return False

        if self.source_pattern:
            if not fnmatch.fnmatch(message.source or "", self.source_pattern):
                return False

        if self.topic_pattern:
            if not fnmatch.fnmatch(message.topic or "", self.topic_pattern):
                return False

        if self.target_pattern:
            if not fnmatch.fnmatch(message.target or "", self.target_pattern):
                return False

        if self.payload_field and self.payload_value:
            value = message.payload.get(self.payload_field)
            if value is None or not fnmatch.fnmatch(str(value), self.payload_value):
                return False

        with self._lock:
            self.match_count += 1

        return True

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "protocol": self.protocol.value if self.protocol else None,
            "source_pattern": self.source_pattern,
            "topic_pattern": self.topic_pattern,
            "target_pattern": self.target_pattern,
            "payload_field": self.payload_field,
            "payload_value": self.payload_value,
            "enabled": self.enabled,
            "match_count": self.match_count
        }


class ProtocolFilter:
    def __init__(self, mode: FilterMode = FilterMode.DISABLED):
        self._mode = mode
        self._rules: List[ProtocolFilterRule] = []
        self._lock = threading.RLock()
        self._stats = {
            "total_checked": 0,
            "total_allowed": 0,
            "total_blocked": 0
        }

    @property
    def mode(self) -> FilterMode:
        return self._mode

    def set_mode(self, mode: FilterMode) -> None:
        with self._lock:
            self._mode = mode
            logger.info(f"Protocol filter mode set to: {mode.value}")

    def add_rule(self, rule: ProtocolFilterRule) -> None:
        with self._lock:
            for i, existing in enumerate(self._rules):
                if existing.name == rule.name:
                    self._rules[i] = rule
                    logger.info(f"Filter rule updated: {rule.name}")
                    return
            self._rules.append(rule)
            logger.info(f"Filter rule added: {rule.name}")

    def remove_rule(self, name: str) -> bool:
        with self._lock:
            for i, rule in enumerate(self._rules):
                if rule.name == name:
                    del self._rules[i]
                    logger.info(f"Filter rule removed: {name}")
                    return True
        return False

    def allow(self, message: ProtocolMessage) -> bool:
        if self._mode == FilterMode.DISABLED:
            return True

        with self._lock:
            self._stats["total_checked"] += 1

            active_matches = [r for r in self._rules if r.enabled and r.matches(message)]

            if self._mode == FilterMode.WHITELIST:
                allowed = len(active_matches) > 0
            elif self._mode == FilterMode.BLACKLIST:
                allowed = len(active_matches) == 0
            else:
                allowed = True

            if allowed:
                self._stats["total_allowed"] += 1
            else:
                self._stats["total_blocked"] += 1
                protocol = message.protocol.value if hasattr(message.protocol, 'value') else str(message.protocol)
                logger.warning(f"Message blocked by filter: source={message.source}, protocol={protocol}, topic={message.topic}")

            return allowed

    def get_rules(self) -> List[Dict]:
        with self._lock:
            return [r.to_dict() for r in self._rules]

    def enable_rule(self, name: str) -> bool:
        with self._lock:
            for rule in self._rules:
                if rule.name == name:
                    rule.enabled = True
                    return True
        return False

    def disable_rule(self, name: str) -> bool:
        with self._lock:
            for rule in self._rules:
                if rule.name == name:
                    rule.enabled = False
                    return True
        return False

    def get_stats(self) -> Dict:
        with self._lock:
            return {
                "mode": self._mode.value,
                "total_rules": len(self._rules),
                "active_rules": sum(1 for r in self._rules if r.enabled),
                **self._stats
            }


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 3,
        success_threshold: int = 3
    ):
        self.name = name
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._half_open_max_calls = half_open_max_calls
        self._success_threshold = success_threshold
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_calls = 0
        self._last_failure_time: Optional[datetime] = None
        self._last_state_change: datetime = datetime.now()
        self._lock = threading.RLock()
        self._total_calls = 0
        self._total_failures = 0
        self._total_rejected = 0

    @property
    def state(self) -> CircuitState:
        with self._lock:
            if self._state == CircuitState.OPEN:
                if self._last_failure_time:
                    elapsed = (datetime.now() - self._last_failure_time).total_seconds()
                    if elapsed >= self._recovery_timeout:
                        self._transition_to(CircuitState.HALF_OPEN)
            return self._state

    def allow_request(self) -> bool:
        with self._lock:
            self._total_calls += 1
            current_state = self.state

            if current_state == CircuitState.CLOSED:
                return True
            elif current_state == CircuitState.OPEN:
                self._total_rejected += 1
                return False
            elif current_state == CircuitState.HALF_OPEN:
                if self._half_open_calls < self._half_open_max_calls:
                    self._half_open_calls += 1
                    return True
                self._total_rejected += 1
                return False

        return False

    def record_success(self) -> None:
        with self._lock:
            self._success_count += 1
            if self._state == CircuitState.HALF_OPEN:
                if self._success_count >= self._success_threshold:
                    self._transition_to(CircuitState.CLOSED)
            elif self._state == CircuitState.CLOSED:
                self._failure_count = 0

    def record_failure(self) -> None:
        with self._lock:
            self._failure_count += 1
            self._total_failures += 1
            self._last_failure_time = datetime.now()
            self._success_count = 0

            if self._state == CircuitState.HALF_OPEN:
                self._transition_to(CircuitState.OPEN)
            elif self._state == CircuitState.CLOSED:
                if self._failure_count >= self._failure_threshold:
                    self._transition_to(CircuitState.OPEN)

    def _transition_to(self, new_state: CircuitState) -> None:
        old_state = self._state
        self._state = new_state
        self._last_state_change = datetime.now()
        if new_state == CircuitState.CLOSED:
            self._failure_count = 0
            self._success_count = 0
            self._half_open_calls = 0
        elif new_state == CircuitState.HALF_OPEN:
            self._half_open_calls = 0
            self._success_count = 0
        logger.warning(f"Circuit breaker '{self.name}': {old_state.value} -> {new_state.value}")

    def reset(self) -> None:
        with self._lock:
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._success_count = 0
            self._half_open_calls = 0
            self._last_failure_time = None
            logger.info(f"Circuit breaker '{self.name}' reset")

    def get_stats(self) -> Dict:
        with self._lock:
            return {
                "name": self.name,
                "state": self._state.value,
                "failure_count": self._failure_count,
                "success_count": self._success_count,
                "failure_threshold": self._failure_threshold,
                "recovery_timeout": self._recovery_timeout,
                "last_failure_time": self._last_failure_time.isoformat() if self._last_failure_time else None,
                "last_state_change": self._last_state_change.isoformat(),
                "total_calls": self._total_calls,
                "total_failures": self._total_failures,
                "total_rejected": self._total_rejected
            }


class CircuitBreakerRegistry:
    def __init__(self):
        self._breakers: Dict[str, CircuitBreaker] = {}
        self._lock = threading.RLock()

    def get_or_create(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0
    ) -> CircuitBreaker:
        with self._lock:
            if name not in self._breakers:
                self._breakers[name] = CircuitBreaker(
                    name=name,
                    failure_threshold=failure_threshold,
                    recovery_timeout=recovery_timeout
                )
                logger.info(f"Circuit breaker created: {name}")
            return self._breakers[name]

    def remove(self, name: str) -> bool:
        with self._lock:
            if name in self._breakers:
                del self._breakers[name]
                return True
        return False

    def get(self, name: str) -> Optional[CircuitBreaker]:
        return self._breakers.get(name)

    def get_all_stats(self) -> Dict[str, Dict]:
        with self._lock:
            return {name: cb.get_stats() for name, cb in self._breakers.items()}

    def check_all(self) -> Dict[str, bool]:
        with self._lock:
            return {name: cb.allow_request() for name, cb in self._breakers.items()}

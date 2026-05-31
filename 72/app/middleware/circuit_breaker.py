import asyncio
import logging
import time
from typing import Dict, Any, Optional, Callable
from enum import Enum
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitMetrics:
    total_calls: int = 0
    total_failures: int = 0
    total_successes: int = 0
    consecutive_failures: int = 0
    last_failure_time: float = 0
    last_success_time: float = 0
    total_rejected: int = 0
    total_timeouts: int = 0


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 3,
        success_threshold: int = 2,
        timeout: float = 10.0
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self.success_threshold = success_threshold
        self.timeout = timeout
        self.state = CircuitState.CLOSED
        self.metrics = CircuitMetrics()
        self._half_open_calls = 0
        self._half_open_successes = 0
        self._lock = asyncio.Lock()
        self._last_state_change = time.time()

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        async with self._lock:
            if self.state == CircuitState.OPEN:
                if time.time() - self.metrics.last_failure_time >= self.recovery_timeout:
                    self.state = CircuitState.HALF_OPEN
                    self._half_open_calls = 0
                    self._half_open_successes = 0
                    self._last_state_change = time.time()
                    logger.info(f"Circuit [{self.name}] transitioned to HALF_OPEN")
                else:
                    self.metrics.total_rejected += 1
                    raise CircuitBreakerOpenError(
                        f"Circuit [{self.name}] is OPEN, rejecting call"
                    )

            if self.state == CircuitState.HALF_OPEN:
                if self._half_open_calls >= self.half_open_max_calls:
                    self.metrics.total_rejected += 1
                    raise CircuitBreakerOpenError(
                        f"Circuit [{self.name}] HALF_OPEN max calls reached"
                    )
                self._half_open_calls += 1

        try:
            result = await asyncio.wait_for(func(*args, **kwargs), timeout=self.timeout)
            await self._on_success()
            return result
        except asyncio.TimeoutError:
            await self._on_failure(is_timeout=True)
            raise CircuitBreakerTimeoutError(
                f"Circuit [{self.name}] call timed out after {self.timeout}s"
            )
        except CircuitBreakerOpenError:
            raise
        except Exception as e:
            await self._on_failure()
            raise

    async def _on_success(self):
        async with self._lock:
            self.metrics.total_calls += 1
            self.metrics.total_successes += 1
            self.metrics.consecutive_failures = 0
            self.metrics.last_success_time = time.time()

            if self.state == CircuitState.HALF_OPEN:
                self._half_open_successes += 1
                if self._half_open_successes >= self.success_threshold:
                    self.state = CircuitState.CLOSED
                    self._last_state_change = time.time()
                    logger.info(f"Circuit [{self.name}] transitioned to CLOSED (recovered)")

    async def _on_failure(self, is_timeout: bool = False):
        async with self._lock:
            self.metrics.total_calls += 1
            self.metrics.total_failures += 1
            self.metrics.consecutive_failures += 1
            self.metrics.last_failure_time = time.time()
            if is_timeout:
                self.metrics.total_timeouts += 1

            if self.state == CircuitState.HALF_OPEN:
                self.state = CircuitState.OPEN
                self._last_state_change = time.time()
                logger.warning(f"Circuit [{self.name}] HALF_OPEN -> OPEN (failure in half-open)")
            elif self.state == CircuitState.CLOSED:
                if self.metrics.consecutive_failures >= self.failure_threshold:
                    self.state = CircuitState.OPEN
                    self._last_state_change = time.time()
                    logger.warning(
                        f"Circuit [{self.name}] CLOSED -> OPEN "
                        f"(consecutive failures: {self.metrics.consecutive_failures})"
                    )

    def get_status(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_threshold": self.failure_threshold,
            "consecutive_failures": self.metrics.consecutive_failures,
            "total_calls": self.metrics.total_calls,
            "total_failures": self.metrics.total_failures,
            "total_successes": self.metrics.total_successes,
            "total_rejected": self.metrics.total_rejected,
            "total_timeouts": self.metrics.total_timeouts,
            "last_failure_time": self.metrics.last_failure_time,
            "last_success_time": self.metrics.last_success_time,
            "seconds_since_last_state_change": round(time.time() - self._last_state_change, 2)
        }

    async def reset(self):
        async with self._lock:
            self.state = CircuitState.CLOSED
            self.metrics = CircuitMetrics()
            self._half_open_calls = 0
            self._half_open_successes = 0
            self._last_state_change = time.time()
            logger.info(f"Circuit [{self.name}] manually reset to CLOSED")


class CircuitBreakerOpenError(Exception):
    pass


class CircuitBreakerTimeoutError(Exception):
    pass


class CircuitBreakerRegistry:
    def __init__(self):
        self._breakers: Dict[str, CircuitBreaker] = {}

    def get_or_create(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        timeout: float = 10.0
    ) -> CircuitBreaker:
        if name not in self._breakers:
            self._breakers[name] = CircuitBreaker(
                name=name,
                failure_threshold=failure_threshold,
                recovery_timeout=recovery_timeout,
                timeout=timeout
            )
        return self._breakers[name]

    def get(self, name: str) -> Optional[CircuitBreaker]:
        return self._breakers.get(name)

    def get_all_status(self) -> Dict[str, Dict[str, Any]]:
        return {name: cb.get_status() for name, cb in self._breakers.items()}

    async def reset_all(self):
        for cb in self._breakers.values():
            await cb.reset()


circuit_registry = CircuitBreakerRegistry()


push_circuit = circuit_registry.get_or_create("push_service", failure_threshold=5, recovery_timeout=30, timeout=10)
device_circuit = circuit_registry.get_or_create("device_service", failure_threshold=8, recovery_timeout=20, timeout=5)
scheduler_circuit = circuit_registry.get_or_create("scheduler_service", failure_threshold=8, recovery_timeout=20, timeout=5)
message_log_circuit = circuit_registry.get_or_create("message_log_service", failure_threshold=8, recovery_timeout=20, timeout=5)
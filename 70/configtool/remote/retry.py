import time
import random
import threading
from enum import Enum
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple, Type
from configtool.utils import get_logger

logger = get_logger("remote.retry")


class BackoffStrategy(Enum):
    FIXED = "fixed"
    EXPONENTIAL = "exponential"
    LINEAR = "linear"
    JITTER = "jitter"


@dataclass
class RetryPolicy:
    max_retries: int = 3
    backoff_strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL
    initial_delay: float = 1.0
    max_delay: float = 30.0
    jitter: bool = False
    retry_on_status: List[int] = field(default_factory=lambda: [429, 500, 502, 503, 504])
    retry_on_exceptions: List[Type[Exception]] = field(default_factory=lambda: [])


class CircuitBreakerState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 1,
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self._failure_count = 0
        self._state = CircuitBreakerState.CLOSED
        self._last_state_change = time.time()
        self._half_open_calls = 0
        self._lock = threading.RLock()

    def allow_request(self) -> bool:
        with self._lock:
            if self._state == CircuitBreakerState.CLOSED:
                return True
            if self._state == CircuitBreakerState.OPEN:
                if time.time() - self._last_state_change >= self.recovery_timeout:
                    self._state = CircuitBreakerState.HALF_OPEN
                    self._half_open_calls = 0
                    self._last_state_change = time.time()
                    return True
                return False
            if self._state == CircuitBreakerState.HALF_OPEN:
                if self._half_open_calls < self.half_open_max_calls:
                    self._half_open_calls += 1
                    return True
                return False
            return False

    def record_success(self) -> None:
        with self._lock:
            if self._state == CircuitBreakerState.HALF_OPEN:
                self._state = CircuitBreakerState.CLOSED
                self._failure_count = 0
                self._half_open_calls = 0
                self._last_state_change = time.time()
            elif self._state == CircuitBreakerState.CLOSED:
                self._failure_count = 0

    def record_failure(self) -> None:
        with self._lock:
            if self._state == CircuitBreakerState.HALF_OPEN:
                self._state = CircuitBreakerState.OPEN
                self._last_state_change = time.time()
                self._half_open_calls = 0
            elif self._state == CircuitBreakerState.CLOSED:
                self._failure_count += 1
                if self._failure_count >= self.failure_threshold:
                    self._state = CircuitBreakerState.OPEN
                    self._last_state_change = time.time()

    def reset(self) -> None:
        with self._lock:
            self._state = CircuitBreakerState.CLOSED
            self._failure_count = 0
            self._half_open_calls = 0
            self._last_state_change = time.time()

    @property
    def state(self) -> CircuitBreakerState:
        with self._lock:
            return self._state

    @property
    def failure_count(self) -> int:
        with self._lock:
            return self._failure_count


class HealthCheck:
    def __init__(
        self,
        endpoint: str = "/health",
        interval: float = 30.0,
        timeout: float = 5.0,
        consecutive_failures: int = 3,
    ):
        self.endpoint = endpoint
        self.interval = interval
        self.timeout = timeout
        self.consecutive_failures = consecutive_failures
        self.is_healthy = True
        self._failure_count = 0
        self._thread: Optional[threading.Thread] = None
        self._client: Optional[Any] = None
        self._lock = threading.RLock()

    def _set_client(self, client: Any) -> None:
        self._client = client

    def check(self) -> bool:
        if self._client is None:
            return True
        try:
            response = self._client.get(
                self.endpoint,
                timeout=self.timeout,
            )
            healthy = response.success
            with self._lock:
                if healthy:
                    self._failure_count = 0
                    self.is_healthy = True
                else:
                    self._failure_count += 1
                    if self._failure_count >= self.consecutive_failures:
                        self.is_healthy = False
            return healthy
        except Exception as e:
            logger.warning(f"健康检查失败: {e}")
            with self._lock:
                self._failure_count += 1
                if self._failure_count >= self.consecutive_failures:
                    self.is_healthy = False
            return False

    def start_background(self, stop_event: threading.Event) -> None:
        def _run() -> None:
            while not stop_event.is_set():
                try:
                    self.check()
                except Exception as e:
                    logger.error(f"健康检查线程异常: {e}")
                if stop_event.wait(self.interval):
                    break

        self._thread = threading.Thread(target=_run, daemon=True)
        self._thread.start()
        logger.info(f"健康检查后台线程已启动, 端点={self.endpoint}, 间隔={self.interval}s")

    def stop(self) -> None:
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
            logger.info("健康检查后台线程已停止")

    @property
    def failure_count(self) -> int:
        with self._lock:
            return self._failure_count

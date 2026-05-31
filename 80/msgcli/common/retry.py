import time
import threading
from typing import Callable, Any, Optional, Dict, List, Type, Tuple
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timedelta
from functools import wraps
from collections import deque

from .logger import get_logger


class RetryStrategy(Enum):
    FIXED = "fixed"
    EXPONENTIAL = "exponential"
    LINEAR = "linear"


class CircuitBreakerState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class RetryConfig:
    max_retries: int = 3
    initial_delay: float = 1.0
    max_delay: float = 30.0
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL
    backoff_factor: float = 2.0
    jitter: bool = True
    retry_on_exceptions: Tuple[Type[Exception], ...] = (Exception,)
    stop_on_exceptions: Tuple[Type[Exception], ...] = ()


@dataclass
class RetryResult:
    success: bool
    result: Any = None
    exception: Optional[Exception] = None
    retry_count: int = 0
    total_duration: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "retry_count": self.retry_count,
            "total_duration": round(self.total_duration, 2),
            "exception": str(self.exception) if self.exception else None,
        }


@dataclass
class CircuitBreakerConfig:
    failure_threshold: int = 5
    reset_timeout: float = 60.0
    success_threshold: int = 3
    monitored_exceptions: Tuple[Type[Exception], ...] = (Exception,)


class CircuitBreaker:
    def __init__(self, config: CircuitBreakerConfig, name: str = "default"):
        self.config = config
        self.name = name
        self.logger = get_logger(f"CircuitBreaker-{name}")
        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: Optional[datetime] = None
        self._lock = threading.Lock()

    def call(self, func: Callable, *args, **kwargs) -> Any:
        with self._lock:
            if self.state == CircuitBreakerState.OPEN:
                if self._should_reset():
                    self.logger.info(f"Circuit {self.name} moving to HALF_OPEN")
                    self.state = CircuitBreakerState.HALF_OPEN
                    self.success_count = 0
                else:
                    raise CircuitBreakerOpenError(f"Circuit {self.name} is OPEN")

        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure(e)
            raise

    def _should_reset(self) -> bool:
        if self.last_failure_time is None:
            return True
        elapsed = (datetime.now() - self.last_failure_time).total_seconds()
        return elapsed >= self.config.reset_timeout

    def _on_success(self):
        with self._lock:
            if self.state == CircuitBreakerState.HALF_OPEN:
                self.success_count += 1
                if self.success_count >= self.config.success_threshold:
                    self.logger.info(f"Circuit {self.name} closing")
                    self.state = CircuitBreakerState.CLOSED
                    self.failure_count = 0
                    self.success_count = 0
            else:
                self.failure_count = 0

    def _on_failure(self, exception: Exception):
        with self._lock:
            if not isinstance(exception, self.config.monitored_exceptions):
                return

            self.failure_count += 1
            self.last_failure_time = datetime.now()

            if self.state == CircuitBreakerState.HALF_OPEN:
                self.logger.warning(f"Circuit {self.name} re-opening on failure")
                self.state = CircuitBreakerState.OPEN
                self.success_count = 0
            elif self.failure_count >= self.config.failure_threshold:
                self.logger.warning(
                    f"Circuit {self.name} opening after {self.failure_count} failures"
                )
                self.state = CircuitBreakerState.OPEN

    def get_state(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "name": self.name,
                "state": self.state.value,
                "failure_count": self.failure_count,
                "success_count": self.success_count,
                "last_failure": self.last_failure_time.isoformat() if self.last_failure_time else None,
            }


class CircuitBreakerOpenError(Exception):
    pass


class RetryExecutor:
    def __init__(self, config: Optional[RetryConfig] = None):
        self.config = config or RetryConfig()
        self.logger = get_logger("RetryExecutor")

    def _calculate_delay(self, attempt: int) -> float:
        if self.config.strategy == RetryStrategy.FIXED:
            delay = self.config.initial_delay
        elif self.config.strategy == RetryStrategy.LINEAR:
            delay = self.config.initial_delay * (attempt + 1)
        elif self.config.strategy == RetryStrategy.EXPONENTIAL:
            delay = self.config.initial_delay * (self.config.backoff_factor ** attempt)
        else:
            delay = self.config.initial_delay

        delay = min(delay, self.config.max_delay)

        if self.config.jitter:
            import random
            delay = delay * (0.5 + random.random())

        return delay

    def execute(self, func: Callable, *args, **kwargs) -> RetryResult:
        start_time = time.time()
        last_exception = None

        for attempt in range(self.config.max_retries + 1):
            try:
                result = func(*args, **kwargs)
                return RetryResult(
                    success=True,
                    result=result,
                    retry_count=attempt,
                    total_duration=time.time() - start_time,
                )
            except Exception as e:
                last_exception = e

                if isinstance(e, self.config.stop_on_exceptions):
                    self.logger.warning(f"Stopping retry on exception: {e}")
                    break

                if not isinstance(e, self.config.retry_on_exceptions):
                    break

                if attempt < self.config.max_retries:
                    delay = self._calculate_delay(attempt)
                    self.logger.info(
                        f"Attempt {attempt + 1}/{self.config.max_retries} failed: {e}. "
                        f"Retrying in {delay:.2f}s..."
                    )
                    time.sleep(delay)

        return RetryResult(
            success=False,
            exception=last_exception,
            retry_count=self.config.max_retries,
            total_duration=time.time() - start_time,
        )


def retry(config: Optional[RetryConfig] = None):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            executor = RetryExecutor(config or RetryConfig())
            result = executor.execute(func, *args, **kwargs)
            if result.success:
                return result.result
            raise result.exception or Exception("Retry failed")
        return wrapper
    return decorator


class ConnectionPool:
    def __init__(self, 
                 create_func: Callable,
                 max_size: int = 10,
                 min_idle: int = 2,
                 max_idle_time: float = 300.0,
                 retry_config: Optional[RetryConfig] = None):
        self.create_func = create_func
        self.max_size = max_size
        self.min_idle = min_idle
        self.max_idle_time = max_idle_time
        self.retry_config = retry_config or RetryConfig(max_retries=2)
        self.logger = get_logger("ConnectionPool")
        
        self._pool: deque = deque()
        self._active_count = 0
        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)

    def acquire(self, timeout: Optional[float] = None) -> Any:
        start_time = time.time()
        
        with self._condition:
            while True:
                if self._pool:
                    conn, timestamp = self._pool.popleft()
                    if time.time() - timestamp > self.max_idle_time:
                        self.logger.debug("Connection expired, creating new")
                        try:
                            conn.close()
                        except:
                            pass
                        continue
                    self._active_count += 1
                    return conn

                if self._active_count < self.max_size:
                    self._active_count += 1
                    try:
                        return self._create_connection()
                    except:
                        self._active_count -= 1
                        raise

                remaining = None
                if timeout is not None:
                    elapsed = time.time() - start_time
                    remaining = timeout - elapsed
                    if remaining <= 0:
                        raise TimeoutError("Timeout waiting for connection")

                self._condition.wait(remaining)

    def release(self, conn: Any, invalidate: bool = False):
        with self._condition:
            self._active_count -= 1
            
            if invalidate:
                try:
                    conn.close()
                except:
                    pass
            else:
                self._pool.append((conn, time.time()))
                
                while len(self._pool) > self.max_size:
                    old_conn, _ = self._pool.popleft()
                    try:
                        old_conn.close()
                    except:
                        pass

            self._condition.notify()

    def _create_connection(self) -> Any:
        executor = RetryExecutor(self.retry_config)
        result = executor.execute(self.create_func)
        if result.success:
            return result.result
        raise result.exception or Exception("Failed to create connection")

    def close_all(self):
        with self._condition:
            while self._pool:
                conn, _ = self._pool.popleft()
                try:
                    conn.close()
                except:
                    pass
            self._condition.notify_all()

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "pool_size": len(self._pool),
                "active_count": self._active_count,
                "max_size": self.max_size,
            }


class HealthChecker:
    def __init__(self, check_interval: float = 30.0):
        self.check_interval = check_interval
        self.logger = get_logger("HealthChecker")
        self._checks: Dict[str, Callable[[], bool]] = {}
        self._statuses: Dict[str, Dict[str, Any]] = {}
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def register(self, name: str, check_func: Callable[[], bool]):
        self._checks[name] = check_func
        self._statuses[name] = {
            "healthy": True,
            "last_check": None,
            "failures": 0,
        }

    def unregister(self, name: str):
        self._checks.pop(name, None)
        self._statuses.pop(name, None)

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        self.logger.info("Health checker started")

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5.0)
        self.logger.info("Health checker stopped")

    def _run(self):
        while self._running:
            for name, check_func in self._checks.items():
                try:
                    healthy = check_func()
                    self._update_status(name, healthy)
                except Exception as e:
                    self.logger.warning(f"Health check {name} failed: {e}")
                    self._update_status(name, False)
            
            time.sleep(self.check_interval)

    def _update_status(self, name: str, healthy: bool):
        status = self._statuses[name]
        status["healthy"] = healthy
        status["last_check"] = datetime.now().isoformat()
        if healthy:
            status["failures"] = 0
        else:
            status["failures"] += 1

    def get_status(self, name: Optional[str] = None) -> Any:
        if name:
            return self._statuses.get(name)
        return dict(self._statuses)

    def is_healthy(self, name: Optional[str] = None) -> bool:
        if name:
            status = self._statuses.get(name)
            return status["healthy"] if status else False
        return all(s["healthy"] for s in self._statuses.values())

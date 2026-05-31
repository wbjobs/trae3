import time
import random
import logging
from typing import Any, Callable, List, Optional, Tuple, Type, Union
from dataclasses import dataclass, field
from functools import wraps
from enum import Enum

logger = logging.getLogger(__name__)


class BackoffStrategy(Enum):
    FIXED = "fixed"
    LINEAR = "linear"
    EXPONENTIAL = "exponential"
    EXPONENTIAL_JITTER = "exponential_jitter"


@dataclass
class RetryPolicy:
    max_attempts: int = 3
    backoff_strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL_JITTER
    initial_delay: float = 1.0
    max_delay: float = 60.0
    multiplier: float = 2.0
    jitter_range: Tuple[float, float] = (0.5, 1.5)
    retry_on_exceptions: Tuple[Type[Exception], ...] = (Exception,)
    stop_on_exceptions: Tuple[Type[Exception], ...] = ()
    
    def calculate_delay(self, attempt: int) -> float:
        if attempt <= 0:
            return 0.0
        
        delay = self.initial_delay
        
        if self.backoff_strategy == BackoffStrategy.FIXED:
            delay = self.initial_delay
        elif self.backoff_strategy == BackoffStrategy.LINEAR:
            delay = self.initial_delay * attempt
        elif self.backoff_strategy == BackoffStrategy.EXPONENTIAL:
            delay = self.initial_delay * (self.multiplier ** (attempt - 1))
        elif self.backoff_strategy == BackoffStrategy.EXPONENTIAL_JITTER:
            base_delay = self.initial_delay * (self.multiplier ** (attempt - 1))
            jitter = random.uniform(*self.jitter_range)
            delay = base_delay * jitter
        
        return min(delay, self.max_delay)
    
    def should_retry(self, exception: Exception, attempt: int) -> bool:
        if attempt >= self.max_attempts:
            return False
        
        if isinstance(exception, self.stop_on_exceptions):
            return False
        
        if isinstance(exception, self.retry_on_exceptions):
            return True
        
        return False


@dataclass
class RetryResult:
    success: bool
    result: Any = None
    exception: Optional[Exception] = None
    attempts: int = 0
    total_delay: float = 0.0
    history: List[Exception] = field(default_factory=list)


class RetryExecutor:
    def __init__(self, policy: Optional[RetryPolicy] = None):
        self.policy = policy or RetryPolicy()
        self._on_retry_callback: Optional[Callable] = None
        self._on_success_callback: Optional[Callable] = None
        self._on_failure_callback: Optional[Callable] = None
    
    def on_retry(self, callback: Callable[[int, Exception, float], None]):
        self._on_retry_callback = callback
        return self
    
    def on_success(self, callback: Callable[[Any, int], None]):
        self._on_success_callback = callback
        return self
    
    def on_failure(self, callback: Callable[[Exception, int], None]):
        self._on_failure_callback = callback
        return self
    
    def execute(self, func: Callable, *args, **kwargs) -> RetryResult:
        result = RetryResult(success=False)
        attempt = 0
        
        while True:
            attempt += 1
            result.attempts = attempt
            
            try:
                result.result = func(*args, **kwargs)
                result.success = True
                
                if self._on_success_callback:
                    self._on_success_callback(result.result, attempt)
                
                return result
                
            except Exception as e:
                result.history.append(e)
                result.exception = e
                
                if not self.policy.should_retry(e, attempt):
                    if self._on_failure_callback:
                        self._on_failure_callback(e, attempt)
                    return result
                
                delay = self.policy.calculate_delay(attempt)
                result.total_delay += delay
                
                if self._on_retry_callback:
                    self._on_retry_callback(attempt, e, delay)
                
                logger.warning(
                    f"重试 {attempt}/{self.policy.max_attempts}: {type(e).__name__}, "
                    f"等待 {delay:.2f}s"
                )
                
                time.sleep(delay)


def retry(
    max_attempts: int = 3,
    backoff_strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL_JITTER,
    initial_delay: float = 1.0,
    max_delay: float = 60.0,
    retry_on_exceptions: Tuple[Type[Exception], ...] = (Exception,),
    stop_on_exceptions: Tuple[Type[Exception], ...] = ()
):
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            policy = RetryPolicy(
                max_attempts=max_attempts,
                backoff_strategy=backoff_strategy,
                initial_delay=initial_delay,
                max_delay=max_delay,
                retry_on_exceptions=retry_on_exceptions,
                stop_on_exceptions=stop_on_exceptions
            )
            executor = RetryExecutor(policy)
            retry_result = executor.execute(func, *args, **kwargs)
            
            if retry_result.success:
                return retry_result.result
            else:
                raise retry_result.exception
        
        return wrapper
    return decorator


class DeadLetterQueue:
    def __init__(self, max_size: int = 1000):
        self.max_size = max_size
        self._queue: List[Tuple[str, Callable, tuple, dict, Exception]] = []
    
    def add(self, task_id: str, func: Callable, args: tuple, kwargs: dict, error: Exception):
        if len(self._queue) < self.max_size:
            self._queue.append((task_id, func, args, kwargs, error))
            logger.info(f"任务加入死信队列: {task_id}")
        else:
            logger.warning(f"死信队列已满，丢弃任务: {task_id}")
    
    def retry_all(self, policy: Optional[RetryPolicy] = None) -> List[RetryResult]:
        results = []
        executor = RetryExecutor(policy)
        
        failed_items = self._queue.copy()
        self._queue.clear()
        
        for task_id, func, args, kwargs, _ in failed_items:
            logger.info(f"重试死信队列任务: {task_id}")
            result = executor.execute(func, *args, **kwargs)
            if not result.success:
                self._queue.append((task_id, func, args, kwargs, result.exception))
            results.append(result)
        
        return results
    
    def size(self) -> int:
        return len(self._queue)
    
    def clear(self):
        self._queue.clear()
    
    def get_failed_tasks(self) -> List[dict]:
        return [
            {
                "task_id": item[0],
                "error": str(item[4]),
                "error_type": type(item[4]).__name__
            }
            for item in self._queue
        ]


def with_circuit_breaker(
    failure_threshold: int = 5,
    recovery_timeout: int = 30,
    fallback_function: Optional[Callable] = None
):
    from .executor import CircuitBreaker as CB
    
    def decorator(func: Callable) -> Callable:
        breaker = CB(failure_threshold, recovery_timeout)
        
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return breaker.call(func, *args, **kwargs)
            except RuntimeError as e:
                if "Circuit breaker is OPEN" in str(e):
                    if fallback_function:
                        return fallback_function(*args, **kwargs)
                    logger.warning(f"断路器打开，跳过调用: {func.__name__}")
                    return None
                raise
        
        return wrapper
    return decorator

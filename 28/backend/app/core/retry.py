import asyncio
import time
import functools
from typing import TypeVar, Callable, Optional, Tuple, Type, Union

T = TypeVar("T")

RETRIABLE_EXCEPTIONS = (
    ConnectionError,
    TimeoutError,
    OSError,
)


def retry_sync(
    func: Optional[Callable[..., T]] = None,
    max_retries: int = 3,
    retry_delay: float = 1.0,
    backoff_factor: float = 2.0,
    exceptions: Tuple[Type[Exception], ...] = RETRIABLE_EXCEPTIONS,
) -> Union[Callable[..., T], T]:
    def decorator(fn: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs) -> T:
            last_exception = None
            delay = retry_delay
            for attempt in range(max_retries):
                try:
                    return fn(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        time.sleep(delay)
                        delay *= backoff_factor
            raise last_exception
        return wrapper

    if func is not None:
        return decorator(func)
    return decorator


def retry_async(
    func: Optional[Callable[..., T]] = None,
    max_retries: int = 3,
    retry_delay: float = 1.0,
    backoff_factor: float = 2.0,
    exceptions: Tuple[Type[Exception], ...] = RETRIABLE_EXCEPTIONS,
) -> Union[Callable[..., T], T]:
    def decorator(fn: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs) -> T:
            last_exception = None
            delay = retry_delay
            for attempt in range(max_retries):
                try:
                    return await fn(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        await asyncio.sleep(delay)
                        delay *= backoff_factor
            raise last_exception
        return wrapper

    if func is not None:
        return decorator(func)
    return decorator

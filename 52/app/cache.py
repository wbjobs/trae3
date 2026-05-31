from collections import OrderedDict
import threading
import time
from typing import Any, Callable


class TTLCache:
    def __init__(self, maxsize: int = 1000, ttl: int = 60):
        self._cache: "OrderedDict[str, tuple[Any, float]]" = OrderedDict()
        self._maxsize = maxsize
        self._ttl = ttl
        self._lock = threading.RLock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            if key in self._cache:
                value, expiry = self._cache[key]
                if time.time() < expiry:
                    self._cache.move_to_end(key)
                    return value
                else:
                    del self._cache[key]
            return None

    def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        with self._lock:
            expiry = time.time() + (ttl or self._ttl)
            self._cache[key] = (value, expiry)
            self._cache.move_to_end(key)
            while len(self._cache) > self._maxsize:
                self._cache.popitem(last=False)

    def delete(self, key: str) -> None:
        with self._lock:
            self._cache.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def invalidate_pattern(self, prefix: str) -> None:
        with self._lock:
            keys_to_delete = [k for k in self._cache.keys() if k.startswith(prefix)]
            for k in keys_to_delete:
                del self._cache[k]


def cached(cache: TTLCache, key_fn: Callable[..., str] | None = None, ttl: int | None = None):
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            key = key_fn(*args, **kwargs) if key_fn else f"{func.__name__}:{args}:{kwargs}"
            cached_val = cache.get(key)
            if cached_val is not None:
                return cached_val
            result = func(*args, **kwargs)
            cache.set(key, result, ttl)
            return result
        return wrapper
    return decorator


version_cache = TTLCache(maxsize=1000, ttl=300)
device_cache = TTLCache(maxsize=5000, ttl=600)
grayscale_cache = TTLCache(maxsize=1000, ttl=180)
limit_cache = TTLCache(maxsize=10000, ttl=60)

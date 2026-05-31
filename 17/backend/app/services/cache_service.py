import time
import hashlib
import json
import threading
from typing import Any, Dict, List, Optional


DEFAULT_TTLS = {
    "timeseries": 30,
    "statistics": 60,
    "component_list": 300,
}


class _CacheEntry:
    __slots__ = ("value", "expire_at")

    def __init__(self, value: Any, expire_at: float):
        self.value = value
        self.expire_at = expire_at


class CacheService:
    def __init__(self):
        self._store: Dict[str, _CacheEntry] = {}
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0

    @staticmethod
    def make_key(**kwargs) -> str:
        raw = json.dumps(kwargs, sort_keys=True, default=str)
        return hashlib.sha256(raw.encode()).hexdigest()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self._misses += 1
                return None
            if time.time() > entry.expire_at:
                del self._store[key]
                self._misses += 1
                return None
            self._hits += 1
            return entry.value

    def set(self, key: str, value: Any, ttl: int = 60) -> None:
        expire_at = time.time() + ttl
        with self._lock:
            self._store[key] = _CacheEntry(value, expire_at)

    def delete(self, key: str) -> bool:
        with self._lock:
            if key in self._store:
                del self._store[key]
                return True
            return False

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def cleanup_expired(self) -> int:
        now = time.time()
        removed = 0
        with self._lock:
            expired_keys = [k for k, v in self._store.items() if now > v.expire_at]
            for k in expired_keys:
                del self._store[k]
                removed += 1
        return removed

    def get_stats(self) -> Dict[str, Any]:
        total = self._hits + self._misses
        hit_rate = (self._hits / total * 100) if total > 0 else 0.0
        with self._lock:
            size = len(self._store)
        return {
            "size": size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(hit_rate, 2),
        }

    def get_or_set(self, key: str, factory, ttl: int = 60) -> Any:
        cached = self.get(key)
        if cached is not None:
            return cached
        value = factory()
        self.set(key, value, ttl)
        return value


cache_service = CacheService()

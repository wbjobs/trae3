import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
import hashlib
import json
from threading import Lock
from typing import Dict, Any, Optional, Callable
from collections import OrderedDict
import logging

logger = logging.getLogger(__name__)

class LRUCache:
    def __init__(self, capacity: int = 128, ttl: int = 300):
        self.capacity = capacity
        self.ttl = ttl
        self.cache = OrderedDict()
        self.timestamps = {}
        self.lock = Lock()

    def get(self, key: str) -> Optional[Any]:
        with self.lock:
            if key not in self.cache:
                return None
            if time.time() - self.timestamps.get(key, 0) > self.ttl:
                del self.cache[key]
                if key in self.timestamps:
                    del self.timestamps[key]
                return None
            self.cache.move_to_end(key)
            return self.cache[key]

    def set(self, key: str, value: Any) -> None:
        with self.lock:
            if key in self.cache:
                self.cache.move_to_end(key)
            self.cache[key] = value
            self.timestamps[key] = time.time()
            while len(self.cache) > self.capacity:
                oldest_key = next(iter(self.cache))
                del self.cache[oldest_key]
                if oldest_key in self.timestamps:
                    del self.timestamps[oldest_key]

    def clear(self, key_prefix: str = None) -> int:
        with self.lock:
            if key_prefix is None:
                count = len(self.cache)
                self.cache.clear()
                self.timestamps.clear()
                return count
            keys_to_remove = [k for k in self.cache if k.startswith(key_prefix)]
            for k in keys_to_remove:
                del self.cache[k]
                if k in self.timestamps:
                    del self.timestamps[k]
            return len(keys_to_remove)

    def __len__(self) -> int:
        with self.lock:
            return len(self.cache)

class CacheService:
    def __init__(self):
        self.timeseries_cache = LRUCache(capacity=256, ttl=60)
        self.statistics_cache = LRUCache(capacity=128, ttl=300)
        self.heatmap_cache = LRUCache(capacity=64, ttl=120)
        self.metadata_cache = LRUCache(capacity=32, ttl=600)
        self._hit_count = 0
        self._miss_count = 0
        self._lock = Lock()

    def _generate_key(self, prefix: str, *args, **kwargs) -> str:
        key_parts = [prefix] + [str(a) for a in args]
        for k, v in sorted(kwargs.items()):
            key_parts.append(f"{k}={v}")
        key_str = "|".join(key_parts)
        return hashlib.md5(key_str.encode()).hexdigest()

    def get_or_compute(self, cache: LRUCache, key_prefix: str,
                        compute_fn: Callable, *args, **kwargs) -> Any:
        key = self._generate_key(key_prefix, *args, **kwargs)
        cached = cache.get(key)
        if cached is not None:
            with self._lock:
                self._hit_count += 1
            return cached, True
        with self._lock:
            self._miss_count += 1
        result = compute_fn(*args, **kwargs)
        if result.get('success', False):
            cache.set(key, result)
        return result, False

    def get_timeseries(self, compute_fn: Callable, *args, **kwargs):
        return self.get_or_compute(self.timeseries_cache, 'ts', compute_fn, *args, **kwargs)

    def get_statistics(self, compute_fn: Callable, *args, **kwargs):
        return self.get_or_compute(self.statistics_cache, 'stat', compute_fn, *args, **kwargs)

    def get_heatmap(self, compute_fn: Callable, *args, **kwargs):
        return self.get_or_compute(self.heatmap_cache, 'hm', compute_fn, *args, **kwargs)

    def get_metadata(self, compute_fn: Callable, *args, **kwargs):
        return self.get_or_compute(self.metadata_cache, 'meta', compute_fn, *args, **kwargs)

    def invalidate_timeseries(self, pattern: str = None) -> int:
        return self.timeseries_cache.clear(pattern)

    def invalidate_all(self) -> None:
        self.timeseries_cache.clear()
        self.statistics_cache.clear()
        self.heatmap_cache.clear()
        self.metadata_cache.clear()
        logger.info("All caches invalidated")

    @property
    def stats(self) -> Dict:
        total = self._hit_count + self._miss_count
        hit_rate = (self._hit_count / total * 100) if total > 0 else 0
        return {
            'hits': self._hit_count,
            'misses': self._miss_count,
            'hit_rate_pct': round(hit_rate, 2),
            'timeseries_size': len(self.timeseries_cache),
            'statistics_size': len(self.statistics_cache),
            'heatmap_size': len(self.heatmap_cache)
        }

cache_service = CacheService()

import threading
from typing import Any

from core.cache.policy import EvictionPolicy, LRUPolicy, TTLPolicy
from core.cache.store import CacheStore
from utils.config import ConfigManager
from utils.logger import setup_logger
from exceptions import CacheError, CacheFullError, CacheKeyNotFoundError


class LocalCacheService:
    def __init__(self) -> None:
        config = ConfigManager.get()
        self._logger = setup_logger("cache.local", config.logging.level, config.logging.file)
        self._cache_config = config.cache
        self._store = CacheStore(self._cache_config.db_path)
        self._max_size_bytes = self._cache_config.max_size_mb * 1024 * 1024
        self._lock = threading.Lock()

        if self._cache_config.eviction_policy == "lru":
            self._policy: EvictionPolicy = LRUPolicy()
        elif self._cache_config.eviction_policy == "ttl":
            self._policy = TTLPolicy(self._cache_config.ttl_seconds)
        else:
            self._policy = LRUPolicy()

    def put(
        self,
        key: str,
        value: Any,
        category: str = "",
        metadata: dict | None = None,
    ) -> None:
        with self._lock:
            self._ensure_capacity()
            self._store.put(key, value, category=category, metadata=metadata)
            self._logger.debug("缓存写入: %s [%s]", key, category)

    def get(self, key: str) -> Any:
        return self._store.get(key)

    def has(self, key: str) -> bool:
        return self._store.has(key)

    def delete(self, key: str) -> bool:
        result = self._store.delete(key)
        if result:
            self._logger.debug("缓存删除: %s", key)
        return result

    def clear(self) -> int:
        count = self._store.clear()
        self._logger.info("缓存已清空, 共 %d 条", count)
        return count

    def get_by_category(self, category: str) -> dict[str, Any]:
        return self._store.get_by_category(category)

    def get_stats(self) -> dict[str, Any]:
        total_size = self._store.get_total_size()
        entry_count = self._store.get_entry_count()
        return {
            "total_entries": entry_count,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "max_size_mb": self._cache_config.max_size_mb,
            "usage_percent": round(total_size / self._max_size_bytes * 100, 1) if self._max_size_bytes > 0 else 0,
            "eviction_policy": self._cache_config.eviction_policy,
        }

    def cleanup_expired(self) -> int:
        entries = self._store.get_all_entries()
        removed = 0
        for key, entry in entries.items():
            if self._policy.should_evict(entry, 0, 0):
                self._store.evict_by_key(key)
                removed += 1
        if removed > 0:
            self._logger.info("清理了 %d 条过期缓存", removed)
        return removed

    def _ensure_capacity(self) -> None:
        current_size = self._store.get_total_size()
        if current_size < self._max_size_bytes:
            return

        entries = self._store.get_all_entries()
        while current_size >= self._max_size_bytes and entries:
            victim_key = self._policy.select_victim(entries)
            if victim_key is None:
                break
            self._store.evict_by_key(victim_key)
            entries.pop(victim_key, None)
            current_size = self._store.get_total_size()

        self._logger.debug("缓存容量回收完成, 当前: %.2fMB", current_size / (1024 * 1024))

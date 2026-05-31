from abc import ABC, abstractmethod
from collections import OrderedDict
from typing import Any


class EvictionPolicy(ABC):
    @abstractmethod
    def should_evict(self, entry: dict[str, Any], current_size: int, max_size: int) -> bool:
        pass

    @abstractmethod
    def select_victim(self, entries: dict[str, dict[str, Any]]) -> str | None:
        pass


class LRUPolicy(EvictionPolicy):
    def should_evict(self, entry: dict[str, Any], current_size: int, max_size: int) -> bool:
        return current_size > max_size

    def select_victim(self, entries: dict[str, dict[str, Any]]) -> str | None:
        if not entries:
            return None
        sorted_keys = sorted(entries.keys(), key=lambda k: entries[k].get("last_access", 0))
        return sorted_keys[0] if sorted_keys else None


class TTLPolicy(EvictionPolicy):
    def __init__(self, ttl_seconds: int = 86400) -> None:
        self._ttl = ttl_seconds

    def should_evict(self, entry: dict[str, Any], current_size: int, max_size: int) -> bool:
        import time
        created = entry.get("created_at", 0)
        return (time.time() - created) > self._ttl

    def select_victim(self, entries: dict[str, dict[str, Any]]) -> str | None:
        import time
        now = time.time()
        for key, entry in entries.items():
            created = entry.get("created_at", 0)
            if (now - created) > self._ttl:
                return key
        if entries:
            sorted_keys = sorted(entries.keys(), key=lambda k: entries[k].get("created_at", 0))
            return sorted_keys[0]
        return None

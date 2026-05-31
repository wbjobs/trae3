from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class SyncOperation(Enum):
    UPLOAD = "upload"
    DOWNLOAD = "download"
    DELETE_LOCAL = "delete_local"
    DELETE_REMOTE = "delete_remote"


@dataclass
class SyncItem:
    item_id: str
    operation: SyncOperation
    program_id: str
    version_id: str | None = None
    file_path: str | None = None
    data: dict[str, Any] = field(default_factory=dict)
    retry_count: int = 0
    max_retries: int = 5
    created_at: datetime = field(default_factory=datetime.now)
    last_attempt: datetime | None = None
    error_message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "item_id": self.item_id,
            "operation": self.operation.value,
            "program_id": self.program_id,
            "version_id": self.version_id,
            "file_path": self.file_path,
            "data": self.data,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "created_at": self.created_at.isoformat(),
            "last_attempt": self.last_attempt.isoformat() if self.last_attempt else None,
            "error_message": self.error_message,
        }


class SyncQueue:
    def __init__(self) -> None:
        self._items: list[SyncItem] = []

    def enqueue(self, item: SyncItem) -> None:
        self._items.append(item)

    def dequeue(self) -> SyncItem | None:
        if not self._items:
            return None
        return self._items.pop(0)

    def peek(self) -> SyncItem | None:
        if not self._items:
            return None
        return self._items[0]

    def size(self) -> int:
        return len(self._items)

    def is_empty(self) -> bool:
        return len(self._items) == 0

    def clear(self) -> None:
        self._items.clear()

    def remove(self, item_id: str) -> bool:
        for i, item in enumerate(self._items):
            if item.item_id == item_id:
                self._items.pop(i)
                return True
        return False

    def get_all(self) -> list[SyncItem]:
        return list(self._items)

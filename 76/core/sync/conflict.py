from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any


class ConflictStrategy(Enum):
    LOCAL_WINS = "local_wins"
    REMOTE_WINS = "remote_wins"
    MANUAL = "manual"
    MERGE = "merge"


@dataclass
class ConflictInfo:
    program_id: str
    local_version: str
    remote_version: str
    local_modified: datetime
    remote_modified: datetime
    local_data: dict[str, Any]
    remote_data: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "program_id": self.program_id,
            "local_version": self.local_version,
            "remote_version": self.remote_version,
            "local_modified": self.local_modified.isoformat(),
            "remote_modified": self.remote_modified.isoformat(),
            "local_data": self.local_data,
            "remote_data": self.remote_data,
        }


class ConflictResolver:
    def __init__(self, strategy: ConflictStrategy = ConflictStrategy.MANUAL) -> None:
        self._strategy = strategy
        self._pending_conflicts: list[ConflictInfo] = []

    @property
    def strategy(self) -> ConflictStrategy:
        return self._strategy

    @strategy.setter
    def strategy(self, value: ConflictStrategy) -> None:
        self._strategy = value

    def resolve(self, conflict: ConflictInfo) -> ConflictStrategy:
        if self._strategy in (ConflictStrategy.LOCAL_WINS, ConflictStrategy.REMOTE_WINS):
            return self._strategy

        if self._strategy == ConflictStrategy.MERGE:
            return ConflictStrategy.MERGE

        self._pending_conflicts.append(conflict)
        return ConflictStrategy.MANUAL

    def resolve_manually(
        self, conflict: ConflictInfo, choice: ConflictStrategy
    ) -> None:
        if conflict in self._pending_conflicts:
            self._pending_conflicts.remove(conflict)

    def get_pending_conflicts(self) -> list[ConflictInfo]:
        return list(self._pending_conflicts)

    def has_pending(self) -> bool:
        return len(self._pending_conflicts) > 0

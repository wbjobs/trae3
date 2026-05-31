from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class ChangeType(Enum):
    CREATED = "created"
    MODIFIED = "modified"
    DELETED = "deleted"
    RENAMED = "renamed"


@dataclass
class ChangeRecord:
    file_path: str
    change_type: ChangeType
    old_hash: str | None = None
    new_hash: str | None = None
    diff_summary: str | None = None
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "file_path": self.file_path,
            "change_type": self.change_type.value,
            "old_hash": self.old_hash,
            "new_hash": self.new_hash,
            "diff_summary": self.diff_summary,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass
class VersionInfo:
    version_id: str
    program_id: str
    version_number: str
    description: str = ""
    author: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    parent_version: str | None = None
    tags: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "version_id": self.version_id,
            "program_id": self.program_id,
            "version_number": self.version_number,
            "description": self.description,
            "author": self.author,
            "created_at": self.created_at.isoformat(),
            "parent_version": self.parent_version,
            "tags": self.tags,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "VersionInfo":
        data["created_at"] = datetime.fromisoformat(data["created_at"])
        return cls(**data)


@dataclass
class VersionSnapshot:
    version_info: VersionInfo
    file_hashes: dict[str, str] = field(default_factory=dict)
    changes: list[ChangeRecord] = field(default_factory=list)
    size_bytes: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "version_info": self.version_info.to_dict(),
            "file_hashes": self.file_hashes,
            "changes": [c.to_dict() for c in self.changes],
            "size_bytes": self.size_bytes,
        }

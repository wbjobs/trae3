from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class VersionDiff:
    file_path: str
    change_type: str
    old_content: str | None = None
    new_content: str | None = None
    diff_content: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "file_path": self.file_path,
            "change_type": self.change_type,
            "old_content": self.old_content,
            "new_content": self.new_content,
            "diff_content": self.diff_content,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "VersionDiff":
        return cls(**data)


@dataclass
class VersionRecord:
    version_id: str
    program_id: str
    version_number: str
    description: str = ""
    author: str = ""
    parent_version_id: str | None = None
    file_hashes: dict[str, str] = field(default_factory=dict)
    diffs: list[VersionDiff] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "version_id": self.version_id,
            "program_id": self.program_id,
            "version_number": self.version_number,
            "description": self.description,
            "author": self.author,
            "parent_version_id": self.parent_version_id,
            "file_hashes": self.file_hashes,
            "diffs": [d.to_dict() for d in self.diffs],
            "tags": self.tags,
            "created_at": self.created_at.isoformat(),
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "VersionRecord":
        diffs = [VersionDiff.from_dict(d) for d in data.pop("diffs", [])]
        if isinstance(data.get("created_at"), str):
            data["created_at"] = datetime.fromisoformat(data["created_at"])
        return cls(**data, diffs=diffs)

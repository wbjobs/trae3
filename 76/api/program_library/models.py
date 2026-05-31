from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class ProgramFile:
    file_id: str
    file_name: str
    file_path: str
    file_size: int = 0
    file_hash: str = ""
    mime_type: str = ""
    uploaded_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "file_id": self.file_id,
            "file_name": self.file_name,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "file_hash": self.file_hash,
            "mime_type": self.mime_type,
            "uploaded_at": self.uploaded_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProgramFile":
        if isinstance(data.get("uploaded_at"), str):
            data["uploaded_at"] = datetime.fromisoformat(data["uploaded_at"])
        return cls(**data)


@dataclass
class ProgramInfo:
    program_id: str
    name: str
    description: str = ""
    category: str = ""
    author: str = ""
    latest_version: str = ""
    versions: list[str] = field(default_factory=list)
    files: list[ProgramFile] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "program_id": self.program_id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "author": self.author,
            "latest_version": self.latest_version,
            "versions": self.versions,
            "files": [f.to_dict() for f in self.files],
            "tags": self.tags,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProgramInfo":
        files = [ProgramFile.from_dict(f) for f in data.pop("files", [])]
        if isinstance(data.get("created_at"), str):
            data["created_at"] = datetime.fromisoformat(data["created_at"])
        if isinstance(data.get("updated_at"), str):
            data["updated_at"] = datetime.fromisoformat(data["updated_at"])
        return cls(**data, files=files)

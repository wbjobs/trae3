from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from enum import Enum

class ChangeType(Enum):
    ADDED = "added"
    REMOVED = "removed"
    MODIFIED = "modified"
    TYPE_CHANGED = "type_changed"

@dataclass
class ConfigDiff:
    key_path: str
    change_type: ChangeType
    old_value: Any = None
    new_value: Any = None
    description: str = ""

    def __post_init__(self):
        if not self.description:
            if self.change_type == ChangeType.ADDED:
                self.description = f"新增配置项: {self.key_path}"
            elif self.change_type == ChangeType.REMOVED:
                self.description = f"移除配置项: {self.key_path}"
            elif self.change_type == ChangeType.MODIFIED:
                self.description = f"修改配置项: {self.key_path}"
            elif self.change_type == ChangeType.TYPE_CHANGED:
                self.description = f"类型变更: {self.key_path}"

@dataclass
class DiffResult:
    source: str
    target: str
    diffs: List[ConfigDiff] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def total_diffs(self) -> int:
        return len(self.diffs)

    @property
    def added_count(self) -> int:
        return sum(1 for d in self.diffs if d.change_type == ChangeType.ADDED)

    @property
    def removed_count(self) -> int:
        return sum(1 for d in self.diffs if d.change_type == ChangeType.REMOVED)

    @property
    def modified_count(self) -> int:
        return sum(1 for d in self.diffs if d.change_type == ChangeType.MODIFIED)

    @property
    def type_changed_count(self) -> int:
        return sum(1 for d in self.diffs if d.change_type == ChangeType.TYPE_CHANGED)

    def has_changes(self) -> bool:
        return len(self.diffs) > 0

    def filter_by_change_type(self, change_type: ChangeType) -> List[ConfigDiff]:
        return [d for d in self.diffs if d.change_type == change_type]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source": self.source,
            "target": self.target,
            "total_diffs": self.total_diffs,
            "added_count": self.added_count,
            "removed_count": self.removed_count,
            "modified_count": self.modified_count,
            "type_changed_count": self.type_changed_count,
            "diffs": [
                {
                    "key_path": d.key_path,
                    "change_type": d.change_type.value,
                    "old_value": d.old_value,
                    "new_value": d.new_value,
                    "description": d.description,
                }
                for d in self.diffs
            ],
            "metadata": self.metadata,
        }

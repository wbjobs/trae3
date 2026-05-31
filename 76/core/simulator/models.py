from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class SimulationTask:
    task_id: str
    program_id: str
    program_version: str
    parameters: dict[str, Any] = field(default_factory=dict)
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error_message: str | None = None
    priority: int = 0
    timeout: int = 3600

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "program_id": self.program_id,
            "program_version": self.program_version,
            "parameters": self.parameters,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "error_message": self.error_message,
            "priority": self.priority,
            "timeout": self.timeout,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SimulationTask":
        data["status"] = TaskStatus(data["status"])
        data["created_at"] = datetime.fromisoformat(data["created_at"])
        if data.get("started_at"):
            data["started_at"] = datetime.fromisoformat(data["started_at"])
        if data.get("finished_at"):
            data["finished_at"] = datetime.fromisoformat(data["finished_at"])
        return cls(**data)


@dataclass
class SimulationResult:
    task_id: str
    success: bool
    output_data: dict[str, Any] = field(default_factory=dict)
    metrics: dict[str, float] = field(default_factory=dict)
    logs: list[str] = field(default_factory=list)
    duration_seconds: float = 0.0
    completed_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "success": self.success,
            "output_data": self.output_data,
            "metrics": self.metrics,
            "logs": self.logs,
            "duration_seconds": self.duration_seconds,
            "completed_at": self.completed_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SimulationResult":
        data["completed_at"] = datetime.fromisoformat(data["completed_at"])
        return cls(**data)

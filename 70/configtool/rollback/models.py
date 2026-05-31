from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from enum import Enum
from datetime import datetime

class TaskPriority(Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3

class RollbackStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL_SUCCESS = "partial_success"
    SKIPPED = "skipped"

class RollbackType(Enum):
    CONFIG_VERSION = "config_version"
    CONFIG_CENTER = "config_center"
    REMOTE_SERVICE = "remote_service"
    DATABASE = "database"
    FILE = "file"

@dataclass
class ExecutionProgress:
    current_step: int = 0
    total_steps: int = 0
    percentage: float = 0.0
    message: str = ""
    start_time: datetime = field(default_factory=datetime.now)
    elapsed_seconds: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "current_step": self.current_step,
            "total_steps": self.total_steps,
            "percentage": self.percentage,
            "message": self.message,
            "start_time": self.start_time.isoformat(),
            "elapsed_seconds": self.elapsed_seconds,
        }

@dataclass
class RollbackTask:
    task_id: str
    rollback_type: RollbackType
    target: str
    target_version: Optional[str] = None
    current_version: Optional[str] = None
    parameters: Dict[str, Any] = field(default_factory=dict)
    description: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    status: RollbackStatus = RollbackStatus.PENDING
    error_message: str = ""
    priority: TaskPriority = TaskPriority.NORMAL
    dependencies: List[str] = field(default_factory=list)
    timeout_seconds: int = 300
    max_retries: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "rollback_type": self.rollback_type.value,
            "target": self.target,
            "target_version": self.target_version,
            "current_version": self.current_version,
            "parameters": self.parameters,
            "description": self.description,
            "created_at": self.created_at.isoformat(),
            "status": self.status.value,
            "error_message": self.error_message,
            "priority": self.priority.value,
            "dependencies": self.dependencies,
            "timeout_seconds": self.timeout_seconds,
            "max_retries": self.max_retries,
        }

@dataclass
class RollbackResult:
    task: RollbackTask
    status: RollbackStatus
    start_time: datetime = field(default_factory=datetime.now)
    end_time: Optional[datetime] = None
    output: Dict[str, Any] = field(default_factory=dict)
    error_message: str = ""
    rollback_steps: List[Dict[str, Any]] = field(default_factory=list)
    progress: ExecutionProgress = field(default_factory=ExecutionProgress)
    retry_count: int = 0
    priority: TaskPriority = TaskPriority.NORMAL

    @property
    def duration(self) -> float:
        if self.end_time and self.start_time:
            return (self.end_time - self.start_time).total_seconds()
        return 0.0

    @property
    def success(self) -> bool:
        return self.status == RollbackStatus.SUCCESS

    def add_step(
        self,
        step_name: str,
        status: RollbackStatus,
        details: Optional[Dict[str, Any]] = None,
        error: str = "",
    ) -> None:
        self.rollback_steps.append({
            "step_name": step_name,
            "status": status.value,
            "details": details or {},
            "error": error,
            "timestamp": datetime.now().isoformat(),
        })

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task": self.task.to_dict(),
            "status": self.status.value,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration": self.duration,
            "success": self.success,
            "output": self.output,
            "error_message": self.error_message,
            "rollback_steps": self.rollback_steps,
            "progress": self.progress.to_dict(),
            "retry_count": self.retry_count,
            "priority": self.priority.value,
        }

@dataclass
class BatchRollbackResult:
    batch_id: str
    results: List[RollbackResult] = field(default_factory=list)
    start_time: datetime = field(default_factory=datetime.now)
    end_time: Optional[datetime] = None

    @property
    def total_count(self) -> int:
        return len(self.results)

    @property
    def success_count(self) -> int:
        return sum(1 for r in self.results if r.success)

    @property
    def failed_count(self) -> int:
        return sum(1 for r in self.results if not r.success)

    @property
    def all_success(self) -> bool:
        return all(r.success for r in self.results)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "batch_id": self.batch_id,
            "total_count": self.total_count,
            "success_count": self.success_count,
            "failed_count": self.failed_count,
            "all_success": self.all_success,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "results": [r.to_dict() for r in self.results],
        }

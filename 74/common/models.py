import logging
import uuid
import time
from enum import Enum
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    PENDING = "pending"
    DISPATCHED = "dispatched"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


class NodeStatus(Enum):
    ONLINE = "online"
    BUSY = "busy"
    OFFLINE = "offline"
    ERROR = "error"


class TaskPriority(Enum):
    CRITICAL = 0
    HIGH = 1
    NORMAL = 2
    LOW = 3
    BACKGROUND = 4


@dataclass
class Task:
    task_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    task_type: str = ""
    priority: TaskPriority = TaskPriority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    payload: Dict[str, Any] = field(default_factory=dict)
    assigned_node: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    retry_count: int = 0
    error_message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "priority": self.priority.value,
            "status": self.status.value,
            "payload": self.payload,
            "assigned_node": self.assigned_node,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "retry_count": self.retry_count,
            "error_message": self.error_message,
        }


@dataclass
class ComputeNode:
    node_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    host: str = "localhost"
    port: int = 9501
    status: NodeStatus = NodeStatus.OFFLINE
    cpu_cores: int = 0
    memory_gb: float = 0.0
    current_load: float = 0.0
    task_count: int = 0
    last_heartbeat: float = 0.0
    capabilities: list = field(default_factory=list)
    max_tasks: int = 0

    @property
    def is_available(self) -> bool:
        effective_max = self.max_tasks if self.max_tasks > 0 else max(self.cpu_cores, 1)
        load_ok = self.current_load < 0.7
        task_ok = self.task_count < effective_max
        return self.status in (NodeStatus.ONLINE, NodeStatus.BUSY) and load_ok and task_ok

    def to_dict(self) -> dict:
        return {
            "node_id": self.node_id,
            "host": self.host,
            "port": self.port,
            "status": self.status.value,
            "cpu_cores": self.cpu_cores,
            "memory_gb": self.memory_gb,
            "current_load": self.current_load,
            "task_count": self.task_count,
            "last_heartbeat": self.last_heartbeat,
            "capabilities": self.capabilities,
        }


@dataclass
class SedimentResult:
    result_id: str = field(default_factory=lambda: uuid.uuid4().hex[:16])
    task_id: str = ""
    node_id: str = ""
    model_name: str = ""
    parameters: Dict[str, Any] = field(default_factory=dict)
    time_series: list = field(default_factory=list)
    statistics: Dict[str, Any] = field(default_factory=dict)
    computed_at: float = field(default_factory=time.time)
    snapshots: list = field(default_factory=list)
    multi_resolution: Optional[Dict[str, Any]] = None
    converged: bool = False
    total_compute_time: float = 0.0

    def to_dict(self) -> dict:
        return {
            "result_id": self.result_id,
            "task_id": self.task_id,
            "node_id": self.node_id,
            "model_name": self.model_name,
            "parameters": self.parameters,
            "time_series": self.time_series,
            "statistics": self.statistics,
            "computed_at": self.computed_at,
            "snapshots": self.snapshots,
            "multi_resolution": self.multi_resolution,
            "converged": self.converged,
            "total_compute_time": self.total_compute_time,
        }

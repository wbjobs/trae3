import json
import uuid
import time
from pathlib import Path
from typing import Optional, List, Dict, Callable, Any
from dataclasses import dataclass, asdict, field
from datetime import datetime
from enum import Enum
from cache_toolkit.utils.logger import get_logger

logger = get_logger()


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


class TaskType(Enum):
    MIGRATION = "migration"
    INSPECTION = "inspection"
    CLEANUP = "cleanup"
    BACKUP = "backup"


@dataclass
class QueuedTask:
    task_id: str
    task_type: TaskType
    cluster_name: str
    params: dict = field(default_factory=dict)
    status: TaskStatus = TaskStatus.PENDING
    priority: int = 5
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    progress: float = 0.0
    message: str = ""
    result: dict = field(default_factory=dict)
    error: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "task_type": self.task_type.value,
            "cluster_name": self.cluster_name,
            "params": self.params,
            "status": self.status.value,
            "priority": self.priority,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "progress": self.progress,
            "message": self.message,
            "result": self.result,
            "error": self.error,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "QueuedTask":
        return cls(
            task_id=data["task_id"],
            task_type=TaskType(data["task_type"]),
            cluster_name=data["cluster_name"],
            params=data.get("params", {}),
            status=TaskStatus(data.get("status", "pending")),
            priority=data.get("priority", 5),
            created_at=data.get("created_at", datetime.now().isoformat()),
            started_at=data.get("started_at"),
            completed_at=data.get("completed_at"),
            progress=data.get("progress", 0.0),
            message=data.get("message", ""),
            result=data.get("result", {}),
            error=data.get("error"),
            retry_count=data.get("retry_count", 0),
            max_retries=data.get("max_retries", 3),
        )


class TaskQueue:
    def __init__(self, persist_path: Optional[str] = None):
        self._queue: List[QueuedTask] = []
        self._completed: List[QueuedTask] = []
        self._running: Optional[QueuedTask] = None
        self._callbacks: Dict[TaskStatus, List[Callable]] = {}
        self._persist_path = Path(persist_path) if persist_path else None
        self._load()

    def add_task(
        self,
        task_type: TaskType,
        cluster_name: str,
        params: dict,
        priority: int = 5,
        max_retries: int = 3,
    ) -> QueuedTask:
        task = QueuedTask(
            task_id=str(uuid.uuid4())[:12],
            task_type=task_type,
            cluster_name=cluster_name,
            params=params,
            priority=priority,
            max_retries=max_retries,
        )
        self._queue.append(task)
        self._sort_queue()
        self._save()
        logger.info(f"Task {task.task_id} added to queue: {task_type.value}")
        self._trigger_callback(TaskStatus.PENDING, task)
        return task

    def _sort_queue(self):
        self._queue.sort(key=lambda t: (t.priority, t.created_at))

    def get_next_task(self) -> Optional[QueuedTask]:
        if self._running is not None:
            return None
        for task in self._queue:
            if task.status == TaskStatus.PENDING:
                return task
        return None

    def start_task(self, task_id: str) -> bool:
        for task in self._queue:
            if task.task_id == task_id:
                task.status = TaskStatus.RUNNING
                task.started_at = datetime.now().isoformat()
                self._running = task
                self._save()
                self._trigger_callback(TaskStatus.RUNNING, task)
                logger.info(f"Task {task_id} started")
                return True
        return False

    def complete_task(self, task_id: str, result: dict, message: str = ""):
        task = self._find_task(task_id)
        if task:
            task.status = TaskStatus.COMPLETED
            task.completed_at = datetime.now().isoformat()
            task.progress = 1.0
            task.result = result
            task.message = message
            self._move_to_completed(task)
            self._save()
            self._trigger_callback(TaskStatus.COMPLETED, task)
            logger.info(f"Task {task_id} completed: {message}")

    def fail_task(self, task_id: str, error: str, retry: bool = True):
        task = self._find_task(task_id)
        if task:
            if retry and task.retry_count < task.max_retries:
                task.retry_count += 1
                task.status = TaskStatus.PENDING
                task.message = f"Retry {task.retry_count}/{task.max_retries}: {error}"
                self._running = None
                logger.warning(f"Task {task_id} failed, retrying ({task.retry_count}/{task.max_retries})")
            else:
                task.status = TaskStatus.FAILED
                task.completed_at = datetime.now().isoformat()
                task.error = error
                self._move_to_completed(task)
                self._trigger_callback(TaskStatus.FAILED, task)
                logger.error(f"Task {task_id} failed: {error}")
            self._save()

    def update_progress(self, task_id: str, progress: float, message: str = ""):
        task = self._find_task(task_id)
        if task:
            task.progress = max(0.0, min(1.0, progress))
            if message:
                task.message = message
            self._save()

    def cancel_task(self, task_id: str) -> bool:
        task = self._find_task(task_id)
        if task and task.status in (TaskStatus.PENDING, TaskStatus.PAUSED):
            task.status = TaskStatus.CANCELLED
            task.completed_at = datetime.now().isoformat()
            self._move_to_completed(task)
            self._save()
            self._trigger_callback(TaskStatus.CANCELLED, task)
            logger.info(f"Task {task_id} cancelled")
            return True
        return False

    def _find_task(self, task_id: str) -> Optional[QueuedTask]:
        if self._running and self._running.task_id == task_id:
            return self._running
        for task in self._queue:
            if task.task_id == task_id:
                return task
        for task in self._completed:
            if task.task_id == task_id:
                return task
        return None

    def _move_to_completed(self, task: QueuedTask):
        if task in self._queue:
            self._queue.remove(task)
        if self._running is task:
            self._running = None
        self._completed.append(task)
        if len(self._completed) > 1000:
            self._completed = self._completed[-500:]

    def on(self, status: TaskStatus, callback: Callable):
        if status not in self._callbacks:
            self._callbacks[status] = []
        self._callbacks[status].append(callback)

    def _trigger_callback(self, status: TaskStatus, task: QueuedTask):
        for callback in self._callbacks.get(status, []):
            try:
                callback(task)
            except Exception as e:
                logger.error(f"Callback error for {status.value}: {e}")

    def list_queue(self) -> List[QueuedTask]:
        return list(self._queue)

    def list_completed(self, limit: int = 100) -> List[QueuedTask]:
        return list(reversed(self._completed[-limit:]))

    def get_task(self, task_id: str) -> Optional[QueuedTask]:
        return self._find_task(task_id)

    def _save(self):
        if not self._persist_path:
            return
        try:
            self._persist_path.parent.mkdir(parents=True, exist_ok=True)
            data = {
                "queue": [t.to_dict() for t in self._queue],
                "completed": [t.to_dict() for t in self._completed[-100:]],
                "running": self._running.to_dict() if self._running else None,
            }
            with open(self._persist_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"Failed to save task queue: {e}")

    def _load(self):
        if not self._persist_path or not self._persist_path.exists():
            return
        try:
            with open(self._persist_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self._queue = [QueuedTask.from_dict(t) for t in data.get("queue", [])]
            self._completed = [QueuedTask.from_dict(t) for t in data.get("completed", [])]
            running = data.get("running")
            if running:
                task = QueuedTask.from_dict(running)
                task.status = TaskStatus.PENDING
                task.message = "Recovered from crash, pending retry"
                self._queue.append(task)
                self._running = None
            self._sort_queue()
            logger.info(f"Task queue loaded: {len(self._queue)} pending, {len(self._completed)} completed")
        except Exception as e:
            logger.warning(f"Failed to load task queue: {e}")


_global_queue: Optional[TaskQueue] = None


def get_task_queue(persist_path: Optional[str] = None) -> TaskQueue:
    global _global_queue
    if _global_queue is None:
        _global_queue = TaskQueue(persist_path=persist_path)
    return _global_queue

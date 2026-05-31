import asyncio
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
from datetime import datetime

from common.models import Task, TaskStatus, TaskPriority
from common.exceptions import TaskQueueFullError, TaskNotFoundError


class QueueStrategy(str, Enum):
    FIFO = "fifo"
    PRIORITY = "priority"


class TaskQueue:
    def __init__(
        self,
        max_size: int = 1000,
        strategy: QueueStrategy = QueueStrategy.PRIORITY,
    ) -> None:
        self._max_size: int = max_size
        self._strategy: QueueStrategy = strategy
        self._queue: asyncio.PriorityQueue = asyncio.PriorityQueue(maxsize=max_size)
        self._tasks: Dict[UUID, Task] = {}
        self._pending_count: int = 0
        self._running_count: int = 0
        self._completed_count: int = 0
        self._failed_count: int = 0
        self._sequence: int = 0

    async def add_task(self, task: Task) -> None:
        if self._queue.full():
            raise TaskQueueFullError()

        if task.task_id in self._tasks:
            return

        self._tasks[task.task_id] = task
        priority_key = self._get_priority_key(task)
        await self._queue.put((priority_key, task.task_id))
        self._pending_count += 1

    def _get_priority_key(self, task: Task) -> Tuple[int, int]:
        self._sequence += 1
        if self._strategy == QueueStrategy.PRIORITY:
            return (-task.priority.value, self._sequence)
        return (0, self._sequence)

    async def get_task(self, timeout: Optional[float] = None) -> Task:
        try:
            if timeout is not None:
                _, task_id = await asyncio.wait_for(self._queue.get(), timeout=timeout)
            else:
                _, task_id = await self._queue.get()

            task = self._tasks[task_id]
            if task.status == TaskStatus.PENDING:
                task.status = TaskStatus.RUNNING
                task.started_at = datetime.now()
                self._pending_count -= 1
                self._running_count += 1
            return task
        except asyncio.TimeoutError:
            raise TaskNotFoundError("No task available within timeout")

    def complete_task(self, task_id: UUID, result: Any = None) -> None:
        task = self._get_task_by_id(task_id)
        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now()
        task.metadata["result"] = result
        self._running_count -= 1
        self._completed_count += 1

    def fail_task(self, task_id: UUID, error_message: str) -> bool:
        task = self._get_task_by_id(task_id)
        task.retry_count += 1
        task.error_message = error_message

        if task.retry_count < task.max_retries:
            task.status = TaskStatus.PENDING
            task.started_at = None
            task.worker_id = None
            self._sequence += 1
            priority_key = self._get_priority_key(task)
            self._queue.put_nowait((priority_key, task.task_id))
            self._running_count -= 1
            self._pending_count += 1
            return True

        task.status = TaskStatus.FAILED
        task.completed_at = datetime.now()
        self._running_count -= 1
        self._failed_count += 1
        return False

    def get_task_status(self, task_id: UUID) -> TaskStatus:
        task = self._get_task_by_id(task_id)
        return task.status

    def get_task(self, task_id: UUID) -> Optional[Task]:
        return self._tasks.get(task_id)

    def _get_task_by_id(self, task_id: UUID) -> Task:
        if task_id not in self._tasks:
            raise TaskNotFoundError(str(task_id))
        return self._tasks[task_id]

    def get_all_tasks(self) -> List[Task]:
        return list(self._tasks.values())

    def get_tasks_by_status(self, status: TaskStatus) -> List[Task]:
        return [task for task in self._tasks.values() if task.status == status]

    def get_queue_size(self) -> int:
        return self._queue.qsize()

    def get_statistics(self) -> Dict[str, int]:
        return {
            "pending": self._pending_count,
            "running": self._running_count,
            "completed": self._completed_count,
            "failed": self._failed_count,
            "total": len(self._tasks),
            "queue_size": self.get_queue_size(),
        }

    def is_empty(self) -> bool:
        return self._queue.empty()

    def is_full(self) -> bool:
        return self._queue.full()

    def clear(self) -> None:
        self._queue = asyncio.PriorityQueue(maxsize=self._max_size)
        self._tasks.clear()
        self._pending_count = 0
        self._running_count = 0
        self._completed_count = 0
        self._failed_count = 0
        self._sequence = 0

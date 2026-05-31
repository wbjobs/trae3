import asyncio
import logging
import time
from typing import Dict, List, Optional, Callable, Awaitable

from common.models import Task, TaskStatus, TaskPriority

logger = logging.getLogger(__name__)


class PriorityQueue:
    def __init__(self):
        self._queues: Dict[TaskPriority, List[Task]] = {
            p: [] for p in TaskPriority
        }
        self._size = 0

    def push(self, task: Task):
        self._queues[task.priority].append(task)
        self._size += 1
        logger.debug(f"Task {task.task_id} enqueued with priority {task.priority.name}")

    def pop(self) -> Optional[Task]:
        for priority in sorted(TaskPriority, key=lambda p: p.value):
            queue = self._queues[priority]
            if queue:
                self._size -= 1
                return queue.pop(0)
        return None

    def remove(self, task_id: str) -> Optional[Task]:
        for queue in self._queues.values():
            for i, t in enumerate(queue):
                if t.task_id == task_id:
                    self._size -= 1
                    return queue.pop(i)
        return None

    @property
    def size(self) -> int:
        return self._size

    def is_empty(self) -> bool:
        return self._size == 0

    def peek_all(self) -> List[Task]:
        result = []
        for priority in sorted(TaskPriority, key=lambda p: p.value):
            result.extend(self._queues[priority])
        return result


class TaskScheduler:
    def __init__(self, config=None):
        self._config = config
        self._queue = PriorityQueue()
        self._tasks: Dict[str, Task] = {}
        self._running_tasks: Dict[str, Task] = {}
        self._completed: Dict[str, Task] = {}
        self._max_concurrent = (
            config.get("scheduler", "max_concurrent_tasks") if config else 100
        )
        self._task_timeout = (
            config.get("scheduler", "task_timeout") if config else 3600
        )
        self._max_retries = (
            config.get("cluster", "max_retries") if config else 3
        )
        self._on_dispatch: Optional[Callable[[Task], Awaitable[None]]] = None
        self._on_complete: Optional[Callable[[Task], Awaitable[None]]] = None
        self._active = False
        self._dispatch_task: Optional[asyncio.Task] = None
        self._timeout_task: Optional[asyncio.Task] = None

    def set_dispatch_handler(self, handler: Callable[[Task], Awaitable[None]]):
        self._on_dispatch = handler

    def set_complete_handler(self, handler: Callable[[Task], Awaitable[None]]):
        self._on_complete = handler

    def submit(self, task: Task) -> str:
        self._tasks[task.task_id] = task
        self._queue.push(task)
        logger.info(
            f"Task submitted: {task.task_id} type={task.task_type} "
            f"priority={task.priority.name}"
        )
        return task.task_id

    def submit_batch(self, tasks: List[Task]) -> List[str]:
        return [self.submit(t) for t in tasks]

    def cancel(self, task_id: str) -> bool:
        task = self._tasks.get(task_id)
        if not task:
            return False
        if task.status == TaskStatus.RUNNING:
            task.status = TaskStatus.CANCELLED
            self._running_tasks.pop(task_id, None)
            logger.info(f"Task cancelled (was running): {task_id}")
            return True
        if task.status == TaskStatus.PENDING:
            removed = self._queue.remove(task_id)
            if removed:
                removed.status = TaskStatus.CANCELLED
                logger.info(f"Task cancelled (was pending): {task_id}")
                return True
        return False

    def mark_dispatched(self, task_id: str, node_id: str):
        task = self._tasks.get(task_id)
        if task:
            task.status = TaskStatus.DISPATCHED
            task.assigned_node = node_id
            task.started_at = time.time()
            self._running_tasks[task_id] = task
            logger.debug(f"Task {task_id} dispatched to node {node_id}")

    def mark_running(self, task_id: str):
        task = self._tasks.get(task_id)
        if task:
            task.status = TaskStatus.RUNNING
            task.started_at = time.time()
            self._running_tasks[task_id] = task
            logger.debug(f"Task {task_id} is now running on {task.assigned_node}")

    def mark_completed(self, task_id: str, result: dict = None):
        task = self._tasks.pop(task_id, None)
        if task:
            task.status = TaskStatus.COMPLETED
            task.finished_at = time.time()
            task.result = result
            self._running_tasks.pop(task_id, None)
            self._completed[task_id] = task
            logger.info(f"Task completed: {task_id}")

    def mark_failed(self, task_id: str, error: str = ""):
        task = self._tasks.get(task_id)
        if not task:
            return
        task.retry_count += 1
        task.error_message = error
        self._running_tasks.pop(task_id, None)
        task.assigned_node = None

        if task.retry_count < self._max_retries:
            task.status = TaskStatus.PENDING
            task.assigned_node = None
            self._queue.push(task)
            logger.warning(
                f"Task {task_id} failed (attempt {task.retry_count}), re-queued: {error}"
            )
        else:
            task.status = TaskStatus.FAILED
            task.finished_at = time.time()
            self._tasks.pop(task_id, None)
            self._completed[task_id] = task
            logger.error(
                f"Task {task_id} failed permanently after {task.retry_count} attempts: {error}"
            )

    async def _dispatch_loop(self):
        while self._active:
            if self._queue.is_empty():
                await asyncio.sleep(0.5)
                continue
            if len(self._running_tasks) >= self._max_concurrent:
                await asyncio.sleep(1.0)
                continue
            task = self._queue.pop()
            if not task:
                continue
            if not self._on_dispatch:
                task.status = TaskStatus.PENDING
                self._queue.push(task)
                await asyncio.sleep(0.5)
                continue
            try:
                await self._on_dispatch(task)
            except Exception as e:
                logger.error(f"Dispatch error for {task.task_id}: {e}")
                task.status = TaskStatus.PENDING
                task.assigned_node = None
                self._queue.push(task)
            await asyncio.sleep(0.1)

    async def _timeout_loop(self):
        dispatch_timeout = self._task_timeout * 0.5
        while self._active:
            now = time.time()
            expired = []
            for tid, t in list(self._running_tasks.items()):
                if not t.started_at:
                    continue
                elapsed = now - t.started_at
                if t.status == TaskStatus.DISPATCHED and elapsed > dispatch_timeout:
                    expired.append((tid, "dispatch_timeout"))
                elif t.status == TaskStatus.RUNNING and elapsed > self._task_timeout:
                    expired.append((tid, "execution_timeout"))
            for tid, reason in expired:
                task = self._running_tasks.get(tid)
                if task:
                    task.status = TaskStatus.TIMEOUT
                    task.finished_at = now
                    task.error_message = reason
                    self._running_tasks.pop(tid, None)
                    self._tasks.pop(tid, None)
                    self._completed[tid] = task
                    logger.warning(f"Task timed out ({reason}): {tid}")
            await asyncio.sleep(5.0)

    async def start(self):
        self._active = True
        self._dispatch_task = asyncio.create_task(self._dispatch_loop())
        self._timeout_task = asyncio.create_task(self._timeout_loop())
        logger.info("Task scheduler started")

    async def stop(self):
        self._active = False
        for t in [self._dispatch_task, self._timeout_task]:
            if t:
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass
        logger.info("Task scheduler stopped")

    def get_status(self) -> dict:
        return {
            "pending": self._queue.size,
            "running": len(self._running_tasks),
            "completed": len(self._completed),
            "total": len(self._tasks) + len(self._completed),
        }

    def get_task_info(self, task_id: str) -> Optional[dict]:
        task = self._tasks.get(task_id) or self._completed.get(task_id)
        return task.to_dict() if task else None

    def list_tasks(self, status: TaskStatus = None) -> List[dict]:
        tasks = list(self._tasks.values()) + list(self._completed.values())
        if status:
            tasks = [t for t in tasks if t.status == status]
        return [t.to_dict() for t in tasks]

import asyncio
import time
import threading
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Callable, Awaitable, Set
from collections import deque
from concurrent.futures import ThreadPoolExecutor, Future

from config.settings import get_settings
from models.models import InterpolationTask, TaskStatus, TaskResult
from utils.logger import get_logger
from utils.helpers import compute_data_hash

logger = get_logger(__name__)


class TaskScheduler:
    def __init__(
        self,
        max_concurrent_tasks: Optional[int] = None,
        retry_attempts: Optional[int] = None,
        task_timeout: int = 3600,
        check_interval: int = 30,
    ):
        settings = get_settings()
        self.max_concurrent_tasks = max_concurrent_tasks or settings.scheduler.max_concurrent_tasks
        self.retry_attempts = retry_attempts or settings.scheduler.retry_attempts
        self.task_timeout = task_timeout
        self.check_interval = check_interval

        self._pending_queue: deque[InterpolationTask] = deque()
        self._running_tasks: Dict[str, InterpolationTask] = {}
        self._completed_tasks: Dict[str, TaskResult] = {}
        self._failed_tasks: Dict[str, InterpolationTask] = {}
        self._hung_tasks: Set[str] = set()

        self._task_callbacks: Dict[str, Callable[[TaskResult], Awaitable[None]]] = {}
        self._task_futures: Dict[str, asyncio.Future] = {}
        self._task_start_times: Dict[str, float] = {}
        self._task_locks: Dict[str, threading.Lock] = {}

        self._executor = ThreadPoolExecutor(max_workers=self.max_concurrent_tasks)

        self._scheduler_running = False
        self._scheduler_task: Optional[asyncio.Task] = None

        self._node_assignment_callback: Optional[Callable[[InterpolationTask], Optional[str]]] = None
        self._node_status_callback: Optional[Callable[[str], None]] = None

        self._global_lock = threading.Lock()

        logger.info(
            f"TaskScheduler initialized with max_concurrent={self.max_concurrent_tasks}, "
            f"max_retries={self.retry_attempts}, task_timeout={task_timeout}s"
        )

    def set_node_assignment_callback(
        self, callback: Callable[[InterpolationTask], Optional[str]]
    ) -> None:
        self._node_assignment_callback = callback

    def set_node_status_callback(
        self, callback: Callable[[str], None]
    ) -> None:
        self._node_status_callback = callback

    def set_task_callback(
        self, task_id: str, callback: Callable[[TaskResult], Awaitable[None]]
    ) -> None:
        self._task_callbacks[task_id] = callback

    def handle_node_failure(self, node_id: str) -> List[str]:
        affected_tasks = []
        for task_id, task in list(self._running_tasks.items()):
            if task.assigned_node == node_id:
                affected_tasks.append(task_id)
                self._recover_hung_task(task_id, f"Node {node_id} went offline")

        logger.warning(
            f"Node {node_id} failure detected, recovered {len(affected_tasks)} tasks: "
            f"{affected_tasks}"
        )
        return affected_tasks

    def _recover_hung_task(self, task_id: str, reason: str) -> None:
        with self._global_lock:
            if task_id not in self._running_tasks:
                return

            task = self._running_tasks[task_id]
            task.status = TaskStatus.RETRYING
            task.error_message = reason

            if task_id in self._task_futures:
                future = self._task_futures.pop(task_id)
                if not future.done():
                    future.cancel()

            self._hung_tasks.add(task_id)

            if task_id in self._task_start_times:
                self._task_start_times.pop(task_id)

            if task_id in self._task_locks:
                self._task_locks.pop(task_id)

            self._running_tasks.pop(task_id, None)

            if task.retry_count < self.retry_attempts:
                task.retry_count += 1
                task.assigned_node = None
                task.started_at = None
                task.scheduled_at = datetime.utcnow()
                self._pending_queue.append(task)
                logger.info(
                    f"Recovered task {task_id} for retry "
                    f"(attempt {task.retry_count}/{self.retry_attempts})"
                )
            else:
                task.status = TaskStatus.FAILED
                task.failed_at = datetime.utcnow()
                self._failed_tasks[task_id] = task
                logger.error(
                    f"Task {task_id} failed after {task.retry_count} retries "
                    f"due to: {reason}"
                )

            self._hung_tasks.discard(task_id)

    def submit_task(self, task: InterpolationTask) -> str:
        task.status = TaskStatus.QUEUED
        task.scheduled_at = datetime.utcnow()

        if task.input_data_hash is None and task.metadata.get("input_data"):
            task.input_data_hash = compute_data_hash(task.metadata["input_data"])

        self._pending_queue.append(task)
        logger.info(f"Task {task.task_id} queued - priority: {task.priority}, region: {task.region.name}")
        return task.task_id

    def submit_tasks(self, tasks: List[InterpolationTask]) -> List[str]:
        return [self.submit_task(task) for task in tasks]

    def get_pending_tasks(self) -> List[InterpolationTask]:
        return list(self._pending_queue)

    def get_running_tasks(self) -> List[InterpolationTask]:
        return list(self._running_tasks.values())

    def get_task_status(self, task_id: str) -> Optional[TaskStatus]:
        if task_id in self._running_tasks:
            return self._running_tasks[task_id].status
        if task_id in self._completed_tasks:
            return self._completed_tasks[task_id].status
        if task_id in self._failed_tasks:
            return self._failed_tasks[task_id].status
        for task in self._pending_queue:
            if task.task_id == task_id:
                return task.status
        return None

    def get_task_result(self, task_id: str) -> Optional[TaskResult]:
        return self._completed_tasks.get(task_id)

    def cancel_task(self, task_id: str) -> bool:
        for i, task in enumerate(self._pending_queue):
            if task.task_id == task_id:
                task.status = TaskStatus.CANCELLED
                del self._pending_queue[i]
                logger.info(f"Task {task_id} cancelled from pending queue")
                return True

        if task_id in self._running_tasks:
            task = self._running_tasks[task_id]
            task.status = TaskStatus.CANCELLED
            logger.warning(f"Task {task_id} marked for cancellation (may still be running)")
            return True

        return False

    async def start(self) -> None:
        if self._scheduler_running:
            logger.warning("Scheduler is already running")
            return

        self._scheduler_running = True
        self._scheduler_task = asyncio.create_task(self._scheduler_loop())
        logger.info("TaskScheduler started")

    async def stop(self) -> None:
        self._scheduler_running = False
        if self._scheduler_task:
            self._scheduler_task.cancel()
            try:
                await self._scheduler_task
            except asyncio.CancelledError:
                pass

        self._executor.shutdown(wait=True)
        logger.info("TaskScheduler stopped")

    async def _scheduler_loop(self) -> None:
        while self._scheduler_running:
            try:
                await self._process_pending_tasks()
                await self._check_running_tasks()
                await asyncio.sleep(0.1)
            except Exception as e:
                logger.error(f"Scheduler loop error: {e}", exc_info=True)
                await asyncio.sleep(1.0)

    async def _check_running_tasks(self) -> None:
        now = time.time()
        tasks_to_recover = []

        with self._global_lock:
            for task_id, task in list(self._running_tasks.items()):
                if task_id in self._hung_tasks:
                    continue

                start_time = self._task_start_times.get(task_id)
                if start_time is None:
                    continue

                elapsed = now - start_time
                if elapsed > self.task_timeout:
                    tasks_to_recover.append((task_id, f"Task timeout after {elapsed:.1f}s"))
                    continue

                future = self._task_futures.get(task_id)
                if future and future.done():
                    if future.cancelled():
                        tasks_to_recover.append((task_id, "Task future was cancelled"))
                    elif future.exception():
                        tasks_to_recover.append((task_id, f"Task future exception: {future.exception()}"))

        for task_id, reason in tasks_to_recover:
            logger.warning(f"Detected hung task {task_id}: {reason}")
            self._recover_hung_task(task_id, reason)

    async def _process_pending_tasks(self) -> None:
        if len(self._running_tasks) >= self.max_concurrent_tasks:
            return

        if not self._pending_queue:
            return

        sorted_pending = sorted(
            self._pending_queue,
            key=lambda t: (-t.priority, t.scheduled_at or datetime.utcnow()),
        )

        for task in sorted_pending:
            if len(self._running_tasks) >= self.max_concurrent_tasks:
                break

            assigned_node = None
            if self._node_assignment_callback:
                assigned_node = self._node_assignment_callback(task)

            if assigned_node is None and self._node_assignment_callback is not None:
                continue

            self._pending_queue.remove(task)
            await self._execute_task(task, assigned_node)

    async def _execute_task(self, task: InterpolationTask, node_id: Optional[str]) -> None:
        with self._global_lock:
            task.status = TaskStatus.SCHEDULED
            task.assigned_node = node_id
            self._running_tasks[task.task_id] = task
            self._task_locks[task.task_id] = threading.Lock()

        logger.info(f"Task {task.task_id} scheduled on node {node_id}")

        def run_task() -> TaskResult:
            return self._task_runner(task)

        loop = asyncio.get_event_loop()
        future = loop.run_in_executor(self._executor, run_task)

        with self._global_lock:
            self._task_futures[task.task_id] = future
            self._task_start_times[task.task_id] = time.time()

        asyncio.create_task(self._handle_task_completion(task, future))

    def _task_runner(self, task: InterpolationTask) -> TaskResult:
        task.status = TaskStatus.RUNNING
        task.started_at = datetime.utcnow()
        logger.info(f"Task {task.task_id} started execution")

        from .meteorology_calculator import MeteorologyCalculator

        calculator = MeteorologyCalculator()
        start_time = time.time()

        try:
            input_data = task.metadata.get("input_data", [])
            results = calculator.interpolate(
                stations=input_data,
                region=task.region,
                variables=task.variables,
                method=task.interpolation_method,
                grid_resolution=task.grid_resolution,
            )

            execution_time = time.time() - start_time
            task.status = TaskStatus.COMPLETED
            task.completed_at = datetime.utcnow()

            return TaskResult(
                task_id=task.task_id,
                status=TaskStatus.COMPLETED,
                results=results,
                execution_time_seconds=execution_time,
                node_id=task.assigned_node,
                completed_at=datetime.utcnow(),
            )

        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"Task {task.task_id} failed: {e}", exc_info=True)

            return TaskResult(
                task_id=task.task_id,
                status=TaskStatus.FAILED,
                error=str(e),
                execution_time_seconds=execution_time,
                node_id=task.assigned_node,
                completed_at=datetime.utcnow(),
            )

    async def _handle_task_completion(
        self, task: InterpolationTask, future: asyncio.Future
    ) -> None:
        task_id = task.task_id

        try:
            with self._global_lock:
                if task_id in self._hung_tasks:
                    logger.info(
                        f"Task {task_id} was recovered while running, ignoring completion"
                    )
                    return

            result = await future

            with self._global_lock:
                if result.status == TaskStatus.COMPLETED:
                    self._completed_tasks[task_id] = result
                    logger.info(
                        f"Task {task_id} completed successfully in "
                        f"{result.execution_time_seconds:.2f}s"
                    )
                else:
                    task.status = TaskStatus.FAILED
                    task.failed_at = datetime.utcnow()
                    task.error_message = result.error

                    if task.retry_count < self.retry_attempts:
                        await self._retry_task(task)
                    else:
                        self._failed_tasks[task_id] = task
                        logger.error(
                            f"Task {task_id} failed after {task.retry_count} retries: {result.error}"
                        )

            if task_id in self._task_callbacks:
                callback = self._task_callbacks.pop(task_id)
                await callback(result)

        except asyncio.CancelledError:
            with self._global_lock:
                if task_id not in self._hung_tasks:
                    task.status = TaskStatus.CANCELLED
                    logger.info(f"Task {task_id} was cancelled")
        except Exception as e:
            logger.error(f"Error handling task completion for {task_id}: {e}", exc_info=True)
        finally:
            with self._global_lock:
                self._task_futures.pop(task_id, None)
                self._task_start_times.pop(task_id, None)
                self._task_locks.pop(task_id, None)
                self._running_tasks.pop(task_id, None)

    async def _retry_task(self, task: InterpolationTask) -> None:
        task.retry_count += 1
        task.status = TaskStatus.RETRYING
        task.failed_at = None
        task.error_message = None

        logger.info(
            f"Task {task.task_id} retrying (attempt {task.retry_count}/{self.retry_attempts})"
        )

        await asyncio.sleep(get_settings().scheduler.retry_delay)
        self._pending_queue.append(task)

    def get_statistics(self) -> Dict[str, int]:
        return {
            "pending": len(self._pending_queue),
            "running": len(self._running_tasks),
            "completed": len(self._completed_tasks),
            "failed": len(self._failed_tasks),
        }

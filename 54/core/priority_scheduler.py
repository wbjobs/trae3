import asyncio
import time
import threading
import heapq
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Callable, Awaitable, Set, Tuple, Any
from dataclasses import dataclass, field
from enum import IntEnum
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from config.settings import get_settings
from models.models import InterpolationTask, TaskStatus, TaskResult
from utils.logger import get_logger
from utils.helpers import compute_data_hash

logger = get_logger(__name__)


class PriorityLevel(IntEnum):
    CRITICAL = 1
    HIGH = 2
    NORMAL = 5
    LOW = 8
    BACKGROUND = 10


@dataclass(order=True)
class ScheduledTask:
    priority: int
    enqueue_time: float
    task_id: str = field(compare=False)
    task: InterpolationTask = field(compare=False)
    estimated_runtime: float = field(default=60.0, compare=False)


class PriorityScheduler:
    def __init__(
        self,
        max_concurrent_tasks: Optional[int] = None,
        retry_attempts: Optional[int] = None,
        task_timeout: int = 3600,
        enable_preemption: bool = True,
        fairness_weight: float = 0.3,
    ):
        settings = get_settings()
        self.max_concurrent_tasks = max_concurrent_tasks or settings.scheduler.max_concurrent_tasks
        self.retry_attempts = retry_attempts or settings.scheduler.retry_attempts
        self.task_timeout = task_timeout
        self.enable_preemption = enable_preemption
        self.fairness_weight = fairness_weight

        self._priority_queue: List[ScheduledTask] = []
        self._running_tasks: Dict[str, InterpolationTask] = {}
        self._completed_tasks: Dict[str, TaskResult] = {}
        self._failed_tasks: Dict[str, InterpolationTask] = {}
        self._hung_tasks: Set[str] = set()

        self._user_task_counts: Dict[str, int] = defaultdict(int)
        self._priority_task_counts: Dict[int, int] = defaultdict(int)

        self._task_callbacks: Dict[str, Callable[[TaskResult], Awaitable[None]]] = {}
        self._task_futures: Dict[str, asyncio.Future] = {}
        self._task_start_times: Dict[str, float] = {}

        self._executor = ThreadPoolExecutor(max_workers=self.max_concurrent_tasks)

        self._scheduler_running = False
        self._scheduler_task: Optional[asyncio.Task] = None

        self._node_assignment_callback: Optional[Callable[[InterpolationTask], Optional[str]]] = None

        self._global_lock = threading.Lock()
        self._queue_lock = threading.Lock()

        self._preemption_history: List[Tuple[str, str, float]] = []

        logger.info(
            f"PriorityScheduler initialized - max_concurrent={self.max_concurrent_tasks}, "
            f"preemption={enable_preemption}, fairness_weight={fairness_weight}"
        )

    def set_node_assignment_callback(
        self, callback: Callable[[InterpolationTask], Optional[str]]
    ) -> None:
        self._node_assignment_callback = callback

    def set_task_callback(
        self, task_id: str, callback: Callable[[TaskResult], Awaitable[None]]
    ) -> None:
        self._task_callbacks[task_id] = callback

    def submit_task(
        self,
        task: InterpolationTask,
        user_id: str = "default",
        estimated_runtime: float = 60.0,
    ) -> str:
        task.status = TaskStatus.QUEUED
        task.scheduled_at = datetime.utcnow()

        if task.input_data_hash is None and task.metadata.get("input_data"):
            task.input_data_hash = compute_data_hash(task.metadata["input_data"])

        effective_priority = self._calculate_effective_priority(task, user_id)

        scheduled_task = ScheduledTask(
            priority=effective_priority,
            enqueue_time=time.time(),
            task_id=task.task_id,
            task=task,
            estimated_runtime=estimated_runtime,
        )

        with self._queue_lock:
            heapq.heappush(self._priority_queue, scheduled_task)

        self._user_task_counts[user_id] += 1
        self._priority_task_counts[task.priority] += 1

        logger.info(
            f"Task {task.task_id} queued - original_priority={task.priority}, "
            f"effective_priority={effective_priority}, user={user_id}, "
            f"region={task.region.name}"
        )
        return task.task_id

    def _calculate_effective_priority(self, task: InterpolationTask, user_id: str) -> int:
        base_priority = task.priority

        user_task_count = self._user_task_counts[user_id]
        fairness_penalty = user_task_count * self.fairness_weight

        wait_time = (datetime.utcnow() - (task.scheduled_at or datetime.utcnow())).total_seconds()
        aging_bonus = min(wait_time / 60, 5)

        size_factor = min(task.region.area / 10.0, 2.0)
        size_penalty = size_factor * 0.5

        effective_priority = int(
            base_priority + fairness_penalty + size_penalty - aging_bonus
        )
        effective_priority = max(0, min(10, effective_priority))

        return effective_priority

    def get_pending_tasks(self) -> List[InterpolationTask]:
        with self._queue_lock:
            return [st.task for st in self._priority_queue]

    def get_running_tasks(self) -> List[InterpolationTask]:
        return list(self._running_tasks.values())

    def get_task_status(self, task_id: str) -> Optional[TaskStatus]:
        if task_id in self._running_tasks:
            return self._running_tasks[task_id].status
        if task_id in self._completed_tasks:
            return self._completed_tasks[task_id].status
        if task_id in self._failed_tasks:
            return self._failed_tasks[task_id].status

        with self._queue_lock:
            for st in self._priority_queue:
                if st.task_id == task_id:
                    return st.task.status
        return None

    def get_task_result(self, task_id: str) -> Optional[TaskResult]:
        return self._completed_tasks.get(task_id)

    def cancel_task(self, task_id: str) -> bool:
        with self._queue_lock:
            for i, st in enumerate(self._priority_queue):
                if st.task_id == task_id:
                    st.task.status = TaskStatus.CANCELLED
                    self._priority_queue.pop(i)
                    heapq.heapify(self._priority_queue)
                    logger.info(f"Task {task_id} cancelled from priority queue")
                    return True

        if task_id in self._running_tasks:
            task = self._running_tasks[task_id]
            task.status = TaskStatus.CANCELLED
            logger.warning(f"Task {task_id} marked for cancellation (may still be running)")
            return True

        return False

    def check_preemption(self, new_task: ScheduledTask) -> Optional[str]:
        if not self.enable_preemption:
            return None

        if len(self._running_tasks) < self.max_concurrent_tasks:
            return None

        lowest_priority_task = max(
            self._running_tasks.values(),
            key=lambda t: t.priority
        )

        if new_task.priority < lowest_priority_task.priority:
            logger.info(
                f"Preempting task {lowest_priority_task.task_id} "
                f"(priority={lowest_priority_task.priority}) for "
                f"task {new_task.task_id} (priority={new_task.priority})"
            )
            return lowest_priority_task.task_id

        return None

    def preempt_task(self, task_id: str) -> bool:
        if task_id not in self._running_tasks:
            return False

        task = self._running_tasks[task_id]
        task.status = TaskStatus.QUEUED
        task.assigned_node = None

        if task_id in self._task_futures:
            future = self._task_futures.pop(task_id)
            if not future.done():
                future.cancel()

        self._running_tasks.pop(task_id, None)
        self._task_start_times.pop(task_id, None)

        scheduled_task = ScheduledTask(
            priority=task.priority,
            enqueue_time=time.time(),
            task_id=task.task_id,
            task=task,
        )

        with self._queue_lock:
            heapq.heappush(self._priority_queue, scheduled_task)

        self._preemption_history.append(
            (task_id, "preempted", time.time())
        )

        logger.info(f"Task {task_id} preempted and returned to queue")
        return True

    async def start(self) -> None:
        if self._scheduler_running:
            logger.warning("PriorityScheduler is already running")
            return

        self._scheduler_running = True
        self._scheduler_task = asyncio.create_task(self._scheduler_loop())
        logger.info("PriorityScheduler started")

    async def stop(self) -> None:
        self._scheduler_running = False
        if self._scheduler_task:
            self._scheduler_task.cancel()
            try:
                await self._scheduler_task
            except asyncio.CancelledError:
                pass

        self._executor.shutdown(wait=True)
        logger.info("PriorityScheduler stopped")

    async def _scheduler_loop(self) -> None:
        while self._scheduler_running:
            try:
                await self._process_priority_queue()
                await self._check_running_tasks()
                await self._update_priorities()
                await asyncio.sleep(0.1)
            except Exception as e:
                logger.error(f"Scheduler loop error: {e}", exc_info=True)
                await asyncio.sleep(1.0)

    async def _process_priority_queue(self) -> None:
        if len(self._running_tasks) >= self.max_concurrent_tasks:
            return

        with self._queue_lock:
            if not self._priority_queue:
                return

            next_task = heapq.heappop(self._priority_queue)

        preempted_task_id = self.check_preemption(next_task)
        if preempted_task_id:
            self.preempt_task(preempted_task_id)

        assigned_node = None
        if self._node_assignment_callback:
            assigned_node = self._node_assignment_callback(next_task.task)

        if assigned_node is None and self._node_assignment_callback is not None:
            with self._queue_lock:
                heapq.heappush(self._priority_queue, next_task)
            return

        await self._execute_task(next_task.task, assigned_node)

    async def _update_priorities(self) -> None:
        now = time.time()
        updated_tasks = []

        with self._queue_lock:
            while self._priority_queue:
                st = heapq.heappop(self._priority_queue)
                wait_time = now - st.enqueue_time

                if wait_time > 120:
                    new_priority = max(0, st.priority - 1)
                    if new_priority != st.priority:
                        st.priority = new_priority
                        logger.debug(
                            f"Aging task {st.task_id} - priority updated to {new_priority}"
                        )

                updated_tasks.append(st)

            for st in updated_tasks:
                heapq.heappush(self._priority_queue, st)

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

            self._running_tasks.pop(task_id, None)

            if task.retry_count < self.retry_attempts:
                task.retry_count += 1
                task.assigned_node = None
                task.started_at = None
                task.scheduled_at = datetime.utcnow()

                scheduled_task = ScheduledTask(
                    priority=task.priority,
                    enqueue_time=time.time(),
                    task_id=task.task_id,
                    task=task,
                )

                with self._queue_lock:
                    heapq.heappush(self._priority_queue, scheduled_task)

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

    async def _execute_task(self, task: InterpolationTask, node_id: Optional[str]) -> None:
        with self._global_lock:
            task.status = TaskStatus.SCHEDULED
            task.assigned_node = node_id
            self._running_tasks[task.task_id] = task

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

        from core.meteorology_calculator import MeteorologyCalculator

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
                self._running_tasks.pop(task_id, None)

                user_id = task.metadata.get("user_id", "default")
                if self._user_task_counts[user_id] > 0:
                    self._user_task_counts[user_id] -= 1

    async def _retry_task(self, task: InterpolationTask) -> None:
        task.retry_count += 1
        task.status = TaskStatus.RETRYING
        task.failed_at = None
        task.error_message = None

        logger.info(
            f"Task {task.task_id} retrying (attempt {task.retry_count}/{self.retry_attempts})"
        )

        await asyncio.sleep(get_settings().scheduler.retry_delay)

        scheduled_task = ScheduledTask(
            priority=task.priority,
            enqueue_time=time.time(),
            task_id=task.task_id,
            task=task,
        )

        with self._queue_lock:
            heapq.heappush(self._priority_queue, scheduled_task)

    def get_statistics(self) -> Dict[str, Any]:
        with self._queue_lock:
            pending_by_priority = defaultdict(int)
            for st in self._priority_queue:
                pending_by_priority[st.priority] += 1

        return {
            "pending": len(self._priority_queue),
            "pending_by_priority": dict(pending_by_priority),
            "running": len(self._running_tasks),
            "completed": len(self._completed_tasks),
            "failed": len(self._failed_tasks),
            "preemptions": len(self._preemption_history),
            "user_task_counts": dict(self._user_task_counts),
        }

    def get_queue_snapshot(self, limit: int = 10) -> List[Dict[str, Any]]:
        with self._queue_lock:
            snapshot = []
            temp_queue = []
            for _ in range(min(limit, len(self._priority_queue))):
                st = heapq.heappop(self._priority_queue)
                snapshot.append({
                    "task_id": st.task_id,
                    "priority": st.priority,
                    "enqueue_time": st.enqueue_time,
                    "region": st.task.region.name,
                    "variables": st.task.variables,
                })
                temp_queue.append(st)

            for st in temp_queue:
                heapq.heappush(self._priority_queue, st)

            return snapshot

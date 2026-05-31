import asyncio
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, List, Optional
from uuid import UUID
from datetime import datetime, timedelta

from common.models import Task, TaskResult, WorkerNode, TaskStatus
from common.exceptions import (
    SchedulerError,
    WorkerUnavailableError,
    TaskNotFoundError,
    TaskExecutionError,
)
from task_dispatcher.task_queue import TaskQueue


class LoadBalancerStrategy(str, Enum):
    ROUND_ROBIN = "round_robin"
    LEAST_LOAD = "least_load"
    LEAST_CONNECTIONS = "least_connections"
    RESOURCE_AWARE = "resource_aware"


class Scheduler:
    def __init__(
        self,
        task_queue: TaskQueue,
        load_balancer_strategy: LoadBalancerStrategy = LoadBalancerStrategy.LEAST_LOAD,
        health_check_interval: float = 30.0,
        task_timeout: float = 3600.0,
    ) -> None:
        self._task_queue: TaskQueue = task_queue
        self._load_balancer_strategy: LoadBalancerStrategy = load_balancer_strategy
        self._health_check_interval: float = health_check_interval
        self._task_timeout: float = task_timeout
        self._workers: Dict[str, WorkerNode] = {}
        self._worker_tasks: Dict[str, List[UUID]] = {}
        self._running_tasks: Dict[UUID, asyncio.Task] = {}
        self._round_robin_index: int = 0
        self._health_check_task: Optional[asyncio.Task] = None
        self._dispatch_task: Optional[asyncio.Task] = None
        self._is_running: bool = False
        self._task_handlers: Dict[str, Callable[[Task], Coroutine[Any, Any, Any]]] = {}

    def register_worker(self, worker: WorkerNode) -> None:
        self._workers[worker.node_id] = worker
        self._worker_tasks[worker.node_id] = []

    def unregister_worker(self, worker_id: str) -> None:
        if worker_id in self._workers:
            del self._workers[worker_id]
        if worker_id in self._worker_tasks:
            del self._worker_tasks[worker_id]

    def register_task_handler(
        self,
        task_type: str,
        handler: Callable[[Task], Coroutine[Any, Any, Any]],
    ) -> None:
        self._task_handlers[task_type] = handler

    def start(self) -> None:
        if self._is_running:
            return
        self._is_running = True
        self._health_check_task = asyncio.create_task(self._health_check_loop())
        self._dispatch_task = asyncio.create_task(self._dispatch_loop())

    async def stop(self) -> None:
        self._is_running = False
        if self._health_check_task:
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass
        if self._dispatch_task:
            self._dispatch_task.cancel()
            try:
                await self._dispatch_task
            except asyncio.CancelledError:
                pass
        for task in self._running_tasks.values():
            task.cancel()

    async def _health_check_loop(self) -> None:
        while self._is_running:
            try:
                await self._check_workers_health()
                await self._check_running_tasks_timeout()
                await asyncio.sleep(self._health_check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                raise SchedulerError(f"Health check failed: {str(e)}")

    async def _check_workers_health(self) -> None:
        for worker in self._workers.values():
            worker.last_health_check = datetime.now()
            try:
                await self._check_single_worker_health(worker)
                worker.is_healthy = True
            except Exception:
                worker.is_healthy = False

    async def _check_single_worker_health(self, worker: WorkerNode) -> None:
        return

    async def _check_running_tasks_timeout(self) -> None:
        now = datetime.now()
        timeout_threshold = timedelta(seconds=self._task_timeout)
        tasks_to_fail: List[UUID] = []

        for task_id, worker_id in self._get_running_task_worker_map().items():
            task = self._task_queue.get_task(task_id)
            if task and task.started_at:
                if now - task.started_at > timeout_threshold:
                    tasks_to_fail.append(task_id)

        for task_id in tasks_to_fail:
            self._task_queue.fail_task(task_id, "Task execution timeout")

    def _get_running_task_worker_map(self) -> Dict[UUID, str]:
        result: Dict[UUID, str] = {}
        for worker_id, task_ids in self._worker_tasks.items():
            for task_id in task_ids:
                result[task_id] = worker_id
        return result

    async def _dispatch_loop(self) -> None:
        while self._is_running:
            try:
                task = await self._task_queue.get_task(timeout=1.0)
                worker = self._select_worker(task)
                if worker:
                    await self._assign_task(task, worker)
                else:
                    self._task_queue._pending_count += 1
                    self._task_queue._running_count -= 1
                    task.status = TaskStatus.PENDING
                    task.started_at = None
                    await asyncio.sleep(0.5)
            except TaskNotFoundError:
                await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                break
            except Exception as e:
                raise SchedulerError(f"Dispatch error: {str(e)}")

    def _select_worker(self, task: Task) -> Optional[WorkerNode]:
        healthy_workers = [w for w in self._workers.values() if w.is_healthy]
        if not healthy_workers:
            return None

        if self._load_balancer_strategy == LoadBalancerStrategy.ROUND_ROBIN:
            return self._select_round_robin(healthy_workers)
        elif self._load_balancer_strategy == LoadBalancerStrategy.LEAST_LOAD:
            return self._select_least_load(healthy_workers)
        elif self._load_balancer_strategy == LoadBalancerStrategy.LEAST_CONNECTIONS:
            return self._select_least_connections(healthy_workers)
        elif self._load_balancer_strategy == LoadBalancerStrategy.RESOURCE_AWARE:
            return self._select_resource_aware(healthy_workers, task)
        return self._select_least_load(healthy_workers)

    def _select_round_robin(self, workers: List[WorkerNode]) -> WorkerNode:
        worker = workers[self._round_robin_index % len(workers)]
        self._round_robin_index += 1
        return worker

    def _select_least_load(self, workers: List[WorkerNode]) -> WorkerNode:
        return min(workers, key=lambda w: w.current_load)

    def _select_least_connections(self, workers: List[WorkerNode]) -> WorkerNode:
        return min(workers, key=lambda w: len(self._worker_tasks.get(w.node_id, [])))

    def _select_resource_aware(self, workers: List[WorkerNode], task: Task) -> WorkerNode:
        def score(worker: WorkerNode) -> float:
            task_count = len(self._worker_tasks.get(worker.node_id, []))
            load_score = worker.current_load * 0.5
            task_score = (task_count / max(worker.cpu_cores, 1)) * 0.3
            memory_score = (1 - worker.memory_gb / 32.0) * 0.2
            return load_score + task_score + memory_score

        return min(workers, key=score)

    async def _assign_task(self, task: Task, worker: WorkerNode) -> None:
        task.worker_id = worker.node_id
        worker.current_load += 10.0
        self._worker_tasks[worker.node_id].append(task.task_id)

        handler = self._task_handlers.get(task.task_type)
        if handler:
            async_task = asyncio.create_task(self._execute_task(task, worker, handler))
            self._running_tasks[task.task_id] = async_task
        else:
            self._task_queue.fail_task(task.task_id, f"No handler for task type: {task.task_type}")

    async def _execute_task(
        self,
        task: Task,
        worker: WorkerNode,
        handler: Callable[[Task], Coroutine[Any, Any, Any]],
    ) -> None:
        try:
            result_data = await handler(task)
            result = TaskResult(
                task_id=task.task_id,
                status=TaskStatus.COMPLETED,
                worker_id=worker.node_id,
                data=result_data,
                started_at=task.started_at,
                completed_at=datetime.now(),
                execution_time_seconds=(datetime.now() - task.started_at).total_seconds() if task.started_at else 0,
            )
            self._task_queue.complete_task(task.task_id, result)
        except Exception as e:
            error_msg = str(e)
            will_retry = self._task_queue.fail_task(task.task_id, error_msg)
            if not will_retry:
                TaskResult(
                    task_id=task.task_id,
                    status=TaskStatus.FAILED,
                    worker_id=worker.node_id,
                    error_message=error_msg,
                    started_at=task.started_at,
                    completed_at=datetime.now(),
                    execution_time_seconds=(datetime.now() - task.started_at).total_seconds() if task.started_at else 0,
                )
        finally:
            worker.current_load = max(0, worker.current_load - 10.0)
            if task.task_id in self._running_tasks:
                del self._running_tasks[task.task_id]
            if worker.node_id in self._worker_tasks and task.task_id in self._worker_tasks[worker.node_id]:
                self._worker_tasks[worker.node_id].remove(task.task_id)

    def get_worker_status(self, worker_id: str) -> Dict[str, Any]:
        if worker_id not in self._workers:
            raise WorkerUnavailableError(worker_id)
        worker = self._workers[worker_id]
        tasks = self._worker_tasks.get(worker_id, [])
        return {
            "worker": worker,
            "current_tasks": len(tasks),
            "task_ids": tasks,
        }

    def get_all_workers_status(self) -> Dict[str, Dict[str, Any]]:
        return {wid: self.get_worker_status(wid) for wid in self._workers}

    def get_scheduler_statistics(self) -> Dict[str, Any]:
        queue_stats = self._task_queue.get_statistics()
        return {
            **queue_stats,
            "workers_count": len(self._workers),
            "healthy_workers": sum(1 for w in self._workers.values() if w.is_healthy),
            "running_tasks": len(self._running_tasks),
            "is_running": self._is_running,
            "load_balancer_strategy": self._load_balancer_strategy,
        }

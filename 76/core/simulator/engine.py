import os
import queue
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Callable

from utils.config import ConfigManager
from utils.logger import setup_logger
from utils.platform import is_macos, safe_makedirs
from core.simulator.models import SimulationResult, SimulationTask, TaskStatus
from exceptions import SimulatorError, SimulatorTaskNotFoundError, SimulatorTimeoutError


class SimulationEngine:
    def __init__(self) -> None:
        config = ConfigManager.get()
        self._logger = setup_logger("simulator.engine", config.logging.level, config.logging.file)
        self._max_concurrent = config.simulator.max_concurrent_tasks
        self._default_timeout = config.simulator.default_timeout
        self._workspace = config.simulator.workspace
        self._executor = ThreadPoolExecutor(max_workers=self._max_concurrent)
        self._tasks: dict[str, SimulationTask] = {}
        self._results: dict[str, SimulationResult] = {}
        self._futures: dict[str, Future] = {}
        self._lock = threading.RLock()
        self._callbacks: dict[str, list[Callable]] = {}
        self._shutdown = False
        self._callback_queue: queue.Queue | None = None
        self._callback_thread: threading.Thread | None = None
        if is_macos():
            self._callback_queue = queue.Queue()
            self._callback_thread = threading.Thread(target=self._callback_loop, daemon=True)
            self._callback_thread.start()
        safe_makedirs(self._workspace)

    def submit_task(
        self,
        program_id: str,
        program_version: str,
        parameters: dict | None = None,
        timeout: int | None = None,
        priority: int = 0,
    ) -> SimulationTask:
        task_id = str(uuid.uuid4())
        task = SimulationTask(
            task_id=task_id,
            program_id=program_id,
            program_version=program_version,
            parameters=parameters or {},
            timeout=timeout or self._default_timeout,
            priority=priority,
        )

        with self._lock:
            if self._shutdown:
                raise SimulatorError("引擎已关闭，无法提交新任务")
            self._tasks[task_id] = task
            self._callbacks[task_id] = []

        future = self._executor.submit(self._execute_task, task)
        with self._lock:
            self._futures[task_id] = future

        def _done_handler(f: Future) -> None:
            try:
                self._safe_on_task_done(task_id, f)
            except Exception as e:
                self._logger.error("任务完成回调处理错误: %s", e)

        future.add_done_callback(_done_handler)

        self._logger.info("任务已提交: %s (程序: %s v%s)", task_id, program_id, program_version)
        return task

    def cancel_task(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise SimulatorTaskNotFoundError(f"任务不存在: {task_id}")
            if task.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED):
                return False
            future = self._futures.get(task_id)
            if future and not future.done():
                was_cancelled = future.cancel()
                if was_cancelled:
                    task.status = TaskStatus.CANCELLED
                    task.finished_at = datetime.now()
                    self._logger.info("任务已取消: %s", task_id)
                    return True
        return False

    def pause_task(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise SimulatorTaskNotFoundError(f"任务不存在: {task_id}")
            if task.status != TaskStatus.RUNNING:
                return False
            task.status = TaskStatus.PAUSED
            self._logger.info("任务已暂停: %s", task_id)
        return True

    def resume_task(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise SimulatorTaskNotFoundError(f"任务不存在: {task_id}")
            if task.status != TaskStatus.PAUSED:
                return False
            task.status = TaskStatus.RUNNING
            self._logger.info("任务已恢复: %s", task_id)
        return True

    def get_task(self, task_id: str) -> SimulationTask:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise SimulatorTaskNotFoundError(f"任务不存在: {task_id}")
            return task

    def get_result(self, task_id: str) -> SimulationResult | None:
        with self._lock:
            return self._results.get(task_id)

    def list_tasks(self, status: TaskStatus | None = None) -> list[SimulationTask]:
        with self._lock:
            tasks = list(self._tasks.values())
        if status is not None:
            tasks = [t for t in tasks if t.status == status]
        return tasks

    def on_task_complete(self, task_id: str, callback: Callable) -> None:
        with self._lock:
            if task_id not in self._callbacks:
                self._callbacks[task_id] = []
            self._callbacks[task_id].append(callback)

    def shutdown(self, wait: bool = True) -> None:
        self._logger.info("仿真引擎关闭中...")
        with self._lock:
            self._shutdown = True
        try:
            self._executor.shutdown(wait=wait)
        except Exception as e:
            self._logger.warning("关闭执行器时出错: %s", e)
        if self._callback_queue:
            self._callback_queue.put(None)
        if self._callback_thread and self._callback_thread.is_alive():
            self._callback_thread.join(timeout=5)
        self._logger.info("仿真引擎已关闭")

    def _execute_task(self, task: SimulationTask) -> SimulationResult:
        task_id = task.task_id
        start_time = 0.0
        result: SimulationResult | None = None
        logs: list[str] = []
        output_data: dict = {}
        metrics: dict = {}

        with self._lock:
            task.status = TaskStatus.RUNNING
            task.started_at = datetime.now()

        self._logger.info("任务开始执行: %s", task_id)

        try:
            workspace_dir = os.path.join(self._workspace, task_id)
            safe_makedirs(workspace_dir)

            start_time = time.time()

            for step_name, step_params in task.parameters.get("steps", {}).items():
                should_continue = True
                while should_continue:
                    with self._lock:
                        if task.status == TaskStatus.PAUSED:
                            time.sleep(0.1)
                            continue
                        if task.status == TaskStatus.CANCELLED:
                            raise SimulatorError("任务已被取消")
                    should_continue = False

                step_result = self._run_simulation_step(step_name, step_params, workspace_dir)
                output_data[step_name] = step_result["output"]
                metrics[step_name] = step_result["metrics"]
                logs.extend(step_result.get("logs", []))

            duration = time.time() - start_time
            result = SimulationResult(
                task_id=task_id,
                success=True,
                output_data=output_data,
                metrics=metrics,
                logs=logs,
                duration_seconds=round(duration, 3),
            )

            with self._lock:
                task.status = TaskStatus.COMPLETED
                task.finished_at = datetime.now()

            self._logger.info("任务完成: %s (耗时 %.3fs)", task_id, duration)

        except SimulatorError as se:
            with self._lock:
                task.status = TaskStatus.FAILED
                task.finished_at = datetime.now()
                task.error_message = str(se)

            result = SimulationResult(
                task_id=task_id,
                success=False,
                logs=logs,
            )

        except Exception as e:
            with self._lock:
                task.status = TaskStatus.FAILED
                task.finished_at = datetime.now()
                task.error_message = str(e)

            result = SimulationResult(
                task_id=task_id,
                success=False,
                logs=logs,
            )
            self._logger.error("任务执行失败: %s - %s", task_id, e)

        finally:
            with self._lock:
                if result is not None:
                    self._results[task_id] = result

        return result if result is not None else SimulationResult(
            task_id=task_id,
            success=False,
            logs=logs,
        )

    def _run_simulation_step(
        self, step_name: str, params: dict, workspace_dir: str
    ) -> dict:
        self._logger.debug("执行仿真步骤: %s", step_name)
        return {
            "output": {"step": step_name, "status": "completed"},
            "metrics": {"execution_time": 0.0, "memory_usage": 0.0},
            "logs": [f"[{step_name}] 步骤执行完成"],
        }

    def _safe_on_task_done(self, task_id: str, future: Future) -> None:
        try:
            result = None
            try:
                result = future.result()
            except Exception as e:
                self._logger.warning("获取任务结果异常: %s - %s", task_id, e)
            with self._lock:
                callbacks = self._callbacks.pop(task_id, [])
            for cb in callbacks:
                try:
                    if result is not None:
                        if self._callback_queue is not None:
                            self._callback_queue.put((cb, result))
                        else:
                            cb(result)
                except Exception as e:
                    self._logger.error("回调执行错误: %s", e)
        except Exception as e:
            self._logger.error("任务完成处理异常: %s", e)

    def _callback_loop(self) -> None:
        assert self._callback_queue is not None
        while not self._shutdown or not self._callback_queue.qsize() > 0:
            try:
                item = self._callback_queue.get(timeout=1.0)
                if item is None:
                    break
                cb, result = item
                try:
                    cb(result)
                except Exception as e:
                    self._logger.error("回调执行错误: %s", e)
            except queue.Empty:
                continue
            except Exception as e:
                self._logger.error("回调循环错误: %s", e)
                time.sleep(0.1)

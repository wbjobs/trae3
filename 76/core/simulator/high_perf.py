import multiprocessing
import queue
import threading
import time
import uuid
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime
from typing import Callable

from utils.config import ConfigManager
from utils.logger import setup_logger
from utils.platform import is_macos, safe_makedirs
from core.simulator.models import SimulationResult, SimulationTask, TaskStatus
from exceptions import SimulatorError, SimulatorTaskNotFoundError, SimulatorTimeoutError


def _worker_process(task_data: dict) -> dict:
    try:
        task_id = task_data["task_id"]
        parameters = task_data.get("parameters", {})
        workspace_dir = task_data.get("workspace_dir", "")
        start_time = time.time()

        output_data: dict = {}
        metrics: dict = {}
        logs: list[str] = []

        for step_name, step_params in parameters.get("steps", {}).items():
            step_result = _execute_step(step_name, step_params, workspace_dir)
            output_data[step_name] = step_result["output"]
            metrics[step_name] = step_result["metrics"]
            logs.extend(step_result.get("logs", []))

        duration = time.time() - start_time

        return {
            "task_id": task_id,
            "success": True,
            "output_data": output_data,
            "metrics": metrics,
            "logs": logs,
            "duration_seconds": round(duration, 3),
            "error": None,
        }

    except Exception as e:
        return {
            "task_id": task_data.get("task_id", "unknown"),
            "success": False,
            "output_data": {},
            "metrics": {},
            "logs": [],
            "duration_seconds": 0,
            "error": str(e),
        }


def _execute_step(step_name: str, params: dict, workspace_dir: str) -> dict:
    import math

    complexity = params.get("complexity", 1.0)
    iterations = int(1000 * complexity)

    result = 0.0
    for i in range(iterations):
        result += math.sin(i * 0.01) * math.cos(i * 0.02)

    return {
        "output": {"step": step_name, "status": "completed", "result": result},
        "metrics": {
            "execution_time": 0.0,
            "memory_usage": 0.0,
            "iterations": iterations,
        },
        "logs": [f"[{step_name}] 步骤执行完成, 计算结果: {result:.6f}"],
    }


class HighPerformanceSimulator:
    def __init__(self, use_multiprocessing: bool = True) -> None:
        config = ConfigManager.get()
        self._logger = setup_logger(
            "simulator.hp", config.logging.level, config.logging.file
        )
        self._max_workers = max(1, min(
            config.simulator.max_concurrent_tasks,
            multiprocessing.cpu_count() - 1,
        ))
        self._use_multiprocessing = use_multiprocessing and self._max_workers > 1
        self._workspace = config.simulator.workspace
        self._tasks: dict[str, SimulationTask] = {}
        self._results: dict[str, SimulationResult] = {}
        self._lock = threading.RLock()
        self._shutdown = False

        if self._use_multiprocessing:
            self._executor = ProcessPoolExecutor(max_workers=self._max_workers)
            self._logger.info(
                "高性能仿真器启动 (多进程模式, %d 工作进程)", self._max_workers
            )
        else:
            self._executor = None
            self._logger.info("高性能仿真器启动 (单进程模式)")

        safe_makedirs(self._workspace)

    @property
    def max_workers(self) -> int:
        return self._max_workers

    def submit_batch(
        self,
        tasks: list[tuple[str, str, dict]],
        priority: int = 0,
    ) -> list[SimulationTask]:
        created_tasks: list[SimulationTask] = []
        futures = []

        with self._lock:
            if self._shutdown:
                raise SimulatorError("仿真器已关闭")

            for program_id, version, params in tasks:
                task_id = str(uuid.uuid4())
                task = SimulationTask(
                    task_id=task_id,
                    program_id=program_id,
                    program_version=version,
                    parameters=params,
                    priority=priority,
                )
                task.status = TaskStatus.RUNNING
                task.started_at = datetime.now()
                self._tasks[task_id] = task
                created_tasks.append(task)

                workspace_dir = safe_makedirs(
                    os.path.join(self._workspace, task_id)
                )

                if self._use_multiprocessing:
                    task_data = {
                        "task_id": task_id,
                        "parameters": params,
                        "workspace_dir": workspace_dir,
                    }
                    future = self._executor.submit(_worker_process, task_data)
                    futures.append((task_id, future))
                else:
                    result = _worker_process({
                        "task_id": task_id,
                        "parameters": params,
                        "workspace_dir": workspace_dir,
                    })
                    self._handle_result(task_id, result)

        if self._use_multiprocessing:
            threading.Thread(
                target=self._wait_for_futures,
                args=(futures,),
                daemon=True,
            ).start()

        self._logger.info("批量提交 %d 个仿真任务", len(created_tasks))
        return created_tasks

    def submit_task(
        self,
        program_id: str,
        version: str,
        parameters: dict,
        priority: int = 0,
    ) -> SimulationTask:
        return self.submit_batch(
            [(program_id, version, parameters)], priority
        )[0]

    def get_result(self, task_id: str) -> SimulationResult | None:
        with self._lock:
            return self._results.get(task_id)

    def get_task(self, task_id: str) -> SimulationTask:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise SimulatorTaskNotFoundError(f"任务不存在: {task_id}")
            return task

    def list_tasks(self, status: TaskStatus | None = None) -> list[SimulationTask]:
        with self._lock:
            tasks = list(self._tasks.values())
        if status is not None:
            tasks = [t for t in tasks if t.status == status]
        return tasks

    def wait_all(self, timeout: float | None = None) -> list[SimulationResult]:
        start = time.time()
        while True:
            with self._lock:
                pending = any(
                    t.status in (TaskStatus.PENDING, TaskStatus.RUNNING)
                    for t in self._tasks.values()
                )
                if not pending:
                    return list(self._results.values())
            if timeout and (time.time() - start) > timeout:
                raise SimulatorTimeoutError("等待超时")
            time.sleep(0.1)

    def shutdown(self, wait: bool = True) -> None:
        with self._lock:
            self._shutdown = True
        if self._executor:
            self._executor.shutdown(wait=wait)
        self._logger.info("高性能仿真器已关闭")

    def _wait_for_futures(self, futures: list[tuple[str, Any]]) -> None:
        for task_id, future in as_completed([f for _, f in futures]):
            try:
                result = future.result()
                self._handle_result(result["task_id"], result)
            except Exception as e:
                self._logger.error("任务执行错误: %s", e)

    def _handle_result(self, task_id: str, result_data: dict) -> None:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return

            result = SimulationResult(
                task_id=task_id,
                success=result_data["success"],
                output_data=result_data["output_data"],
                metrics=result_data["metrics"],
                logs=result_data["logs"],
                duration_seconds=result_data["duration_seconds"],
            )

            if result_data["success"]:
                task.status = TaskStatus.COMPLETED
            else:
                task.status = TaskStatus.FAILED
                task.error_message = result_data.get("error", "未知错误")

            task.finished_at = datetime.now()
            self._results[task_id] = result

        self._logger.debug(
            "任务完成: %s (%.3fs)", task_id[:8], result_data["duration_seconds"]
        )


import os

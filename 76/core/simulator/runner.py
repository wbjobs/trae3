import json
import os
from datetime import datetime
from typing import Any

from utils.config import ConfigManager
from utils.logger import setup_logger
from core.simulator.models import SimulationResult, SimulationTask, TaskStatus
from exceptions import SimulatorError


class SimulationRunner:
    def __init__(self) -> None:
        config = ConfigManager.get()
        self._logger = setup_logger("simulator.runner", config.logging.level, config.logging.file)
        self._workspace = config.simulator.workspace
        os.makedirs(self._workspace, exist_ok=True)

    def save_task(self, task: SimulationTask) -> str:
        task_dir = os.path.join(self._workspace, task.task_id)
        os.makedirs(task_dir, exist_ok=True)
        task_file = os.path.join(task_dir, "task.json")
        with open(task_file, "w", encoding="utf-8") as f:
            json.dump(task.to_dict(), f, ensure_ascii=False, indent=2)
        self._logger.debug("任务已保存: %s", task.task_id)
        return task_file

    def load_task(self, task_id: str) -> SimulationTask:
        task_file = os.path.join(self._workspace, task_id, "task.json")
        if not os.path.exists(task_file):
            raise SimulatorError(f"任务文件不存在: {task_file}")
        with open(task_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return SimulationTask.from_dict(data)

    def save_result(self, result: SimulationResult) -> str:
        result_dir = os.path.join(self._workspace, result.task_id)
        os.makedirs(result_dir, exist_ok=True)
        result_file = os.path.join(result_dir, "result.json")
        with open(result_file, "w", encoding="utf-8") as f:
            json.dump(result.to_dict(), f, ensure_ascii=False, indent=2)
        self._logger.debug("结果已保存: %s", result.task_id)
        return result_file

    def load_result(self, task_id: str) -> SimulationResult:
        result_file = os.path.join(self._workspace, task_id, "result.json")
        if not os.path.exists(result_file):
            raise SimulatorError(f"结果文件不存在: {result_file}")
        with open(result_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return SimulationResult.from_dict(data)

    def list_saved_tasks(self) -> list[dict[str, Any]]:
        tasks = []
        if not os.path.exists(self._workspace):
            return tasks
        for entry in os.listdir(self._workspace):
            task_file = os.path.join(self._workspace, entry, "task.json")
            if os.path.isfile(task_file):
                try:
                    with open(task_file, "r", encoding="utf-8") as f:
                        tasks.append(json.load(f))
                except (json.JSONDecodeError, OSError) as e:
                    self._logger.warning("加载任务失败: %s - %s", entry, e)
        return tasks

    def cleanup_completed(self, older_than_days: int = 7) -> int:
        import shutil
        from datetime import timedelta

        cutoff = datetime.now() - timedelta(days=older_than_days)
        removed = 0

        if not os.path.exists(self._workspace):
            return removed

        for entry in os.listdir(self._workspace):
            task_file = os.path.join(self._workspace, entry, "task.json")
            if not os.path.isfile(task_file):
                continue
            try:
                with open(task_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if data.get("status") not in ("completed", "failed", "cancelled"):
                    continue
                finished = data.get("finished_at")
                if finished:
                    finished_dt = datetime.fromisoformat(finished)
                    if finished_dt < cutoff:
                        shutil.rmtree(os.path.join(self._workspace, entry))
                        removed += 1
            except (json.JSONDecodeError, OSError, ValueError):
                continue

        self._logger.info("清理了 %d 个过期任务", removed)
        return removed

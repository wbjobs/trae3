import asyncio
import logging
import time
from typing import Dict, Any, Optional

from common.models import Task, TaskStatus, SedimentResult
from common.utils import validate_sediment_params
from sediment.models import create_model, list_models

logger = logging.getLogger(__name__)


class OverloadError(Exception):
    pass


class ComputeEngine:
    def __init__(self, node_id: str, config=None):
        self.node_id = node_id
        self._config = config
        self._max_iterations = (
            config.get("sediment", "max_iterations") if config else 1000
        )
        self._convergence_threshold = (
            config.get("sediment", "convergence_threshold") if config else 1e-6
        )
        self._max_concurrent = max(
            config.get("sediment", "max_concurrent_tasks") if config else 4, 1
        )
        self._active_tasks: Dict[str, asyncio.Task] = {}
        self._running = False
        self._semaphore: Optional[asyncio.Semaphore] = None

    async def start(self):
        self._running = True
        self._semaphore = asyncio.Semaphore(self._max_concurrent)
        logger.info(
            f"Compute engine started on node {self.node_id} "
            f"(max_concurrent={self._max_concurrent})"
        )

    async def stop(self):
        self._running = False
        for tid, task in list(self._active_tasks.items()):
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._active_tasks.clear()
        logger.info(f"Compute engine stopped on node {self.node_id}")

    async def execute(self, task: Task) -> SedimentResult:
        if not self._semaphore:
            raise RuntimeError("Compute engine not started")

        if self._semaphore._value <= 0:
            logger.warning(
                f"Node {self.node_id} overloaded, rejecting task {task.task_id} "
                f"(active={len(self._active_tasks)}, max={self._max_concurrent})"
            )
            raise OverloadError(
                f"Node {self.node_id} at capacity "
                f"({len(self._active_tasks)}/{self._max_concurrent})"
            )

        payload = task.payload
        model_name = payload.get("model", "yang_sediment")
        params = payload.get("parameters", {})
        initial_state = payload.get("initial_state", {})
        time_steps = payload.get("time_steps", 100)

        if not validate_sediment_params(params):
            raise ValueError(f"Invalid sediment parameters for task {task.task_id}")

        logger.info(
            f"Starting computation: task={task.task_id} model={model_name} steps={time_steps}"
        )

        model = create_model(model_name, params)

        async with self._semaphore:
            coro = asyncio.get_event_loop().run_in_executor(
                None, self._run_sync, model, initial_state, time_steps, enable_snapshot
            )
            atask = asyncio.ensure_future(coro)
            self._active_tasks[task.task_id] = atask

            try:
                result_data = await atask
            except asyncio.CancelledError:
                logger.warning(f"Task {task.task_id} was cancelled")
                raise
            finally:
                self._active_tasks.pop(task.task_id, None)

        if not result_data or "time_series" not in result_data:
            raise RuntimeError(f"Computation produced no results for task {task.task_id}")

        result = SedimentResult(
            task_id=task.task_id,
            node_id=self.node_id,
            model_name=model_name,
            parameters=params,
            time_series=result_data.get("time_series", []),
            statistics=result_data.get("statistics", {}),
        )
        result.snapshots = result_data.get("snapshots", [])
        result.multi_resolution = result_data.get("multi_resolution", None)
        result.converged = result_data.get("converged", False)
        result.total_compute_time = result_data.get("total_time", 0)

        logger.info(
            f"Computation complete: task={task.task_id} steps={len(result.time_series)} "
            f"final_concentration={result.statistics.get('final_concentration', 'N/A')} "
            f"converged={result.converged}"
        )
        return result

    @staticmethod
    def _run_sync(model, initial_state, time_steps, enable_snapshot=False) -> dict:
        if enable_snapshot:
            return model.evolve(initial_state, time_steps, enable_snapshot=True)
        return model.evolve(initial_state, time_steps)

    @staticmethod
    def _compute_statistics(time_series: list) -> dict:
        if not time_series:
            return {}

        concentrations = [ts.get("concentration", 0) for ts in time_series]
        transport_rates = [ts.get("transport_rate", 0) for ts in time_series]
        bed_changes = [ts.get("bed_change", 0) for ts in time_series]

        return {
            "total_steps": len(time_series),
            "final_concentration": concentrations[-1],
            "max_concentration": max(concentrations),
            "avg_concentration": sum(concentrations) / len(concentrations),
            "final_transport_rate": transport_rates[-1],
            "total_bed_change": sum(bed_changes),
            "max_bed_change": max(abs(bc) for bc in bed_changes),
            "final_depth": time_series[-1].get("depth", 0),
        }

    @property
    def active_task_count(self) -> int:
        return len(self._active_tasks)

    def get_status(self) -> dict:
        return {
            "node_id": self.node_id,
            "running": self._running,
            "active_tasks": len(self._active_tasks),
            "available_models": list_models(),
        }

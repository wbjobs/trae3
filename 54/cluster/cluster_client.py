import asyncio
import json
import time
from typing import List, Optional, Dict, Any, Callable
from dataclasses import dataclass

import httpx

from config.settings import get_settings
from models.models import (
    InterpolationTask,
    TaskResult,
    NodeInfo,
    NodeStatus,
    TaskStatus,
)
from utils.logger import get_logger
from utils.helpers import retry_with_backoff

logger = get_logger(__name__)


@dataclass
class ClusterJobStatus:
    job_id: str
    status: TaskStatus
    node_id: Optional[str] = None
    progress: float = 0.0
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    error_message: Optional[str] = None
    result_url: Optional[str] = None


class ClusterClient:
    def __init__(
        self,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: int = 30,
    ):
        settings = get_settings()
        self.api_url = api_url or settings.cluster.api_url
        self.api_key = api_key or settings.cluster.api_key
        self.timeout = timeout
        self.poll_interval = settings.cluster.poll_interval
        self.task_timeout = settings.cluster.task_timeout

        self._client = httpx.AsyncClient(
            base_url=self.api_url,
            timeout=self.timeout,
            headers={"Authorization": f"Bearer {self.api_key}"},
        )

        self._job_callbacks: Dict[str, Callable[[ClusterJobStatus], None]] = {}
        self._polling_task: Optional[asyncio.Task] = None
        self._running = False

        logger.info(f"ClusterClient initialized - API: {self.api_url}")

    async def close(self) -> None:
        self._running = False
        if self._polling_task:
            self._polling_task.cancel()
            try:
                await self._polling_task
            except asyncio.CancelledError:
                pass

        await self._client.aclose()
        logger.info("ClusterClient closed")

    async def start_polling(self) -> None:
        if self._running:
            logger.warning("ClusterClient polling is already running")
            return

        self._running = True
        self._polling_task = asyncio.create_task(self._polling_loop())
        logger.info("ClusterClient polling started")

    async def stop_polling(self) -> None:
        self._running = False
        if self._polling_task:
            self._polling_task.cancel()
            try:
                await self._polling_task
            except asyncio.CancelledError:
                pass
        logger.info("ClusterClient polling stopped")

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    async def submit_task(self, task: InterpolationTask) -> Optional[str]:
        try:
            payload = {
                "task_id": task.task_id,
                "region": task.region.model_dump(),
                "variables": task.variables,
                "grid_resolution": task.grid_resolution,
                "interpolation_method": task.interpolation_method,
                "priority": task.priority,
                "input_data": task.metadata.get("input_data", []),
                "metadata": task.metadata,
            }

            response = await self._client.post(
                "/api/v1/jobs/submit",
                json=payload,
            )
            response.raise_for_status()

            result = response.json()
            job_id = result.get("job_id")

            logger.info(f"Task {task.task_id} submitted to cluster as job {job_id}")
            return job_id

        except httpx.HTTPError as e:
            logger.error(f"Failed to submit task {task.task_id}: {e}")
            raise

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    async def submit_tasks(
        self, tasks: List[InterpolationTask]
    ) -> Dict[str, Optional[str]]:
        results = {}
        for task in tasks:
            try:
                job_id = await self.submit_task(task)
                results[task.task_id] = job_id
            except Exception as e:
                logger.error(f"Failed to submit task {task.task_id}: {e}")
                results[task.task_id] = None

        return results

    @retry_with_backoff(max_attempts=3, initial_delay=0.5)
    async def get_job_status(self, job_id: str) -> Optional[ClusterJobStatus]:
        try:
            response = await self._client.get(f"/api/v1/jobs/{job_id}/status")
            response.raise_for_status()

            data = response.json()
            return ClusterJobStatus(
                job_id=data.get("job_id", job_id),
                status=TaskStatus(data.get("status", TaskStatus.PENDING)),
                node_id=data.get("node_id"),
                progress=float(data.get("progress", 0.0)),
                start_time=data.get("start_time"),
                end_time=data.get("end_time"),
                error_message=data.get("error_message"),
                result_url=data.get("result_url"),
            )

        except httpx.HTTPError as e:
            logger.error(f"Failed to get status for job {job_id}: {e}")
            raise

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    async def get_job_result(self, job_id: str) -> Optional[TaskResult]:
        try:
            response = await self._client.get(f"/api/v1/jobs/{job_id}/result")
            response.raise_for_status()

            data = response.json()

            from models.models import InterpolationResult, GridPoint

            results = []
            for r in data.get("results", []):
                grid_points = [
                    GridPoint(latitude=gp["latitude"], longitude=gp["longitude"])
                    for gp in r.get("grid_points", [])
                ]

                interp_result = InterpolationResult(
                    result_id=r.get("result_id", ""),
                    task_id=r.get("task_id", ""),
                    variable=r["variable"],
                    grid_points=grid_points,
                    values=r["values"],
                    uncertainties=r.get("uncertainties"),
                    interpolation_method=r.get("interpolation_method", ""),
                    input_station_count=r.get("input_station_count", 0),
                    quality_score=r.get("quality_score"),
                    metadata=r.get("metadata", {}),
                )
                results.append(interp_result)

            return TaskResult(
                task_id=data.get("task_id", ""),
                status=TaskStatus(data.get("status", TaskStatus.COMPLETED)),
                results=results,
                error=data.get("error"),
                execution_time_seconds=data.get("execution_time_seconds"),
                node_id=data.get("node_id"),
                completed_at=data.get("completed_at"),
            )

        except httpx.HTTPError as e:
            logger.error(f"Failed to get result for job {job_id}: {e}")
            raise

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    async def cancel_job(self, job_id: str) -> bool:
        try:
            response = await self._client.post(f"/api/v1/jobs/{job_id}/cancel")
            response.raise_for_status()

            logger.info(f"Job {job_id} cancelled")
            return True

        except httpx.HTTPError as e:
            logger.error(f"Failed to cancel job {job_id}: {e}")
            raise

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    async def list_nodes(self) -> List[NodeInfo]:
        try:
            response = await self._client.get("/api/v1/nodes")
            response.raise_for_status()

            data = response.json()
            nodes = []
            for n in data.get("nodes", []):
                node = NodeInfo(
                    node_id=n["node_id"],
                    status=NodeStatus(n.get("status", NodeStatus.OFFLINE)),
                    host=n["host"],
                    port=n["port"],
                    cpu_cores=n.get("cpu_cores", 1),
                    memory_gb=n.get("memory_gb", 1.0),
                    gpu_available=n.get("gpu_available", False),
                    current_task=n.get("current_task"),
                    tasks_completed=n.get("tasks_completed", 0),
                    tasks_failed=n.get("tasks_failed", 0),
                    capabilities=n.get("capabilities", []),
                )
                nodes.append(node)

            return nodes

        except httpx.HTTPError as e:
            logger.error(f"Failed to list nodes: {e}")
            raise

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    async def get_node_info(self, node_id: str) -> Optional[NodeInfo]:
        try:
            response = await self._client.get(f"/api/v1/nodes/{node_id}")
            response.raise_for_status()

            n = response.json()
            return NodeInfo(
                node_id=n["node_id"],
                status=NodeStatus(n.get("status", NodeStatus.OFFLINE)),
                host=n["host"],
                port=n["port"],
                cpu_cores=n.get("cpu_cores", 1),
                memory_gb=n.get("memory_gb", 1.0),
                gpu_available=n.get("gpu_available", False),
                current_task=n.get("current_task"),
                tasks_completed=n.get("tasks_completed", 0),
                tasks_failed=n.get("tasks_failed", 0),
                capabilities=n.get("capabilities", []),
            )

        except httpx.HTTPError as e:
            if e.response and e.response.status_code == 404:
                return None
            logger.error(f"Failed to get node info for {node_id}: {e}")
            raise

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    async def get_cluster_stats(self) -> Dict[str, Any]:
        try:
            response = await self._client.get("/api/v1/stats")
            response.raise_for_status()
            return response.json()

        except httpx.HTTPError as e:
            logger.error(f"Failed to get cluster stats: {e}")
            raise

    async def wait_for_completion(
        self,
        job_id: str,
        timeout: Optional[int] = None,
        poll_interval: Optional[float] = None,
    ) -> Optional[TaskResult]:
        timeout = timeout or self.task_timeout
        poll_interval = poll_interval or self.poll_interval

        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                status = await self.get_job_status(job_id)
                if not status:
                    await asyncio.sleep(poll_interval)
                    continue

                if status.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED):
                    if status.status == TaskStatus.COMPLETED:
                        return await self.get_job_result(job_id)
                    else:
                        logger.warning(
                            f"Job {job_id} ended with status {status.status}: "
                            f"{status.error_message}"
                        )
                        return None

                logger.debug(
                    f"Job {job_id} status: {status.status}, "
                    f"progress: {status.progress:.1%}"
                )
                await asyncio.sleep(poll_interval)

            except Exception as e:
                logger.error(f"Error waiting for job {job_id}: {e}")
                await asyncio.sleep(poll_interval)

        logger.error(f"Job {job_id} timed out after {timeout}s")
        return None

    def set_job_callback(
        self, job_id: str, callback: Callable[[ClusterJobStatus], None]
    ) -> None:
        self._job_callbacks[job_id] = callback

    async def _polling_loop(self) -> None:
        while self._running:
            try:
                job_ids = list(self._job_callbacks.keys())
                if not job_ids:
                    await asyncio.sleep(self.poll_interval)
                    continue

                for job_id in job_ids:
                    try:
                        status = await self.get_job_status(job_id)
                        if status and job_id in self._job_callbacks:
                            callback = self._job_callbacks[job_id]
                            try:
                                callback(status)
                            except Exception as e:
                                logger.error(f"Error in job callback for {job_id}: {e}")

                            if status.status in (
                                TaskStatus.COMPLETED,
                                TaskStatus.FAILED,
                                TaskStatus.CANCELLED,
                            ):
                                del self._job_callbacks[job_id]

                    except Exception as e:
                        logger.error(f"Error polling job {job_id}: {e}")

                await asyncio.sleep(self.poll_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Polling loop error: {e}", exc_info=True)
                await asyncio.sleep(1.0)

    async def submit_and_wait(
        self,
        task: InterpolationTask,
        timeout: Optional[int] = None,
    ) -> Optional[TaskResult]:
        job_id = await self.submit_task(task)
        if not job_id:
            return None

        return await self.wait_for_completion(job_id, timeout=timeout)

    async def execute_task(
        self,
        task: InterpolationTask,
        result_callback: Optional[Callable[[TaskResult], None]] = None,
    ) -> str:
        job_id = await self.submit_task(task)
        if not job_id:
            raise RuntimeError(f"Failed to submit task {task.task_id}")

        if result_callback:
            async def status_callback(status: ClusterJobStatus) -> None:
                if status.status == TaskStatus.COMPLETED:
                    try:
                        result = await self.get_job_result(job_id)
                        if result and result_callback:
                            result_callback(result)
                    except Exception as e:
                        logger.error(f"Error processing result for job {job_id}: {e}")

            self.set_job_callback(job_id, status_callback)

        return job_id

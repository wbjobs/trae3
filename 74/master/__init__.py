import asyncio
import logging
import signal
import sys
import time
from typing import Optional

from common.config import load_config
from common.models import Task, TaskStatus, TaskPriority, ComputeNode, SedimentResult
from scheduler import TaskScheduler
from node_manager import NodeManager
from storage import StorageManager

logger = logging.getLogger(__name__)


class ClusterMaster:
    def __init__(self, config_path: str = None):
        self._config = load_config(config_path)
        self._scheduler = TaskScheduler(self._config)
        self._node_manager = NodeManager(self._config)
        self._storage = StorageManager(self._config)
        self._running = False
        self._shutdown_event = asyncio.Event()

    async def initialize(self):
        await self._storage.initialize()
        self._scheduler.set_dispatch_handler(self._on_task_dispatch)
        self._scheduler.set_complete_handler(self._on_task_complete)
        logger.info("Cluster master initialized")

    async def _on_task_dispatch(self, task: Task):
        node = self._node_manager.select_node_for_task(task.payload)
        if not node:
            logger.warning(f"No available node for task {task.task_id}, re-queuing")
            task.status = TaskStatus.PENDING
            task.assigned_node = None
            self._scheduler._queue.push(task)
            return

        self._scheduler.mark_dispatched(task.task_id, node.node_id)
        load_increment = 1.0 / max(node.cpu_cores, 1)
        node.task_count += 1
        node.current_load = min(node.current_load + load_increment, 1.0)

        logger.info(
            f"Task {task.task_id} dispatched to node {node.node_id} "
            f"(load={node.current_load:.2f})"
        )

    async def _on_task_complete(self, task: Task):
        if task.assigned_node:
            node = self._node_manager.registry.get_node(task.assigned_node)
            if node:
                load_decrement = 1.0 / max(node.cpu_cores, 1)
                node.task_count = max(node.task_count - 1, 0)
                node.current_load = max(node.current_load - load_decrement, 0.0)

        self._storage.record_task_history(task.to_dict())
        logger.info(f"Task {task.task_id} completed, history recorded")

    def submit_task(
        self,
        task_type: str,
        payload: dict,
        priority: TaskPriority = TaskPriority.NORMAL,
    ) -> str:
        task = Task(
            task_type=task_type,
            priority=priority,
            payload=payload,
        )
        return self._scheduler.submit(task)

    def submit_sediment_task(
        self,
        river_reach: str,
        model: str,
        parameters: dict,
        initial_state: dict,
        time_steps: int = 100,
        priority: TaskPriority = TaskPriority.NORMAL,
    ) -> str:
        payload = {
            "model": model,
            "parameters": parameters,
            "initial_state": initial_state,
            "time_steps": time_steps,
            "river_reach": river_reach,
            "flow_rate": parameters.get("flow_rate", 1.0),
            "start_time": parameters.get("start_time", time.time()),
            "end_time": parameters.get("end_time", time.time() + 86400),
        }
        return self.submit_task("sediment_compute", payload, priority)

    async def handle_result(self, result: SedimentResult):
        await self._storage.save_result(result)
        self._scheduler.mark_completed(result.task_id, result.to_dict())
        logger.info(f"Result saved for task {result.task_id}")

    async def handle_failure(self, task_id: str, error: str):
        self._scheduler.mark_failed(task_id, error)

    async def register_worker(self, node: ComputeNode) -> str:
        return self._node_manager.register_node(node)

    async def worker_heartbeat(self, node_id: str, load: float, task_count: int):
        self._node_manager.update_heartbeat(node_id, load, task_count)

    async def start(self):
        await self.initialize()
        await self._node_manager.start()
        await self._scheduler.start()
        self._running = True
        logger.info(
            f"Cluster master started on "
            f"{self._config.get('cluster', 'master_host')}:{self._config.get('cluster', 'master_port')}"
        )

    async def stop(self):
        self._running = False
        await self._scheduler.stop()
        await self._node_manager.stop()
        await self._storage.flush()
        await self._storage.close()
        self._shutdown_event.set()
        logger.info("Cluster master stopped")

    def get_cluster_status(self) -> dict:
        return {
            "master": "running" if self._running else "stopped",
            "scheduler": self._scheduler.get_status(),
            "cluster": self._node_manager.get_cluster_status(),
            "storage": self._storage.get_pool_status(),
        }


class ClusterWorker:
    def __init__(self, node_id: str, host: str, port: int, config_path: str = None):
        self._config = load_config(config_path)
        self._node = ComputeNode(
            node_id=node_id,
            host=host,
            port=port,
        )
        self._master_host = self._config.get("cluster", "master_host")
        self._master_port = self._config.get("cluster", "master_port")
        self._running = False
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._compute_engine = None

    async def start(self):
        from sediment import ComputeEngine

        self._compute_engine = ComputeEngine(self._node.node_id, self._config)
        await self._compute_engine.start()
        self._running = True
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        logger.info(
            f"Worker {self._node.node_id} started at "
            f"{self._node.host}:{self._node.port}"
        )

    async def stop(self):
        self._running = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
        if self._compute_engine:
            await self._compute_engine.stop()
        logger.info(f"Worker {self._node.node_id} stopped")

    async def execute_task(self, task: Task) -> SedimentResult:
        if not self._compute_engine:
            raise RuntimeError("Compute engine not initialized")
        result = await self._compute_engine.execute(task)
        return result

    async def _heartbeat_loop(self):
        while self._running:
            load = self._compute_engine.active_task_count / max(1, self._node.cpu_cores)
            task_count = self._compute_engine.active_task_count
            logger.debug(
                f"Heartbeat: load={load:.2f} tasks={task_count}"
            )
            await asyncio.sleep(self._config.get("cluster", "heartbeat_interval"))

    def get_status(self) -> dict:
        return {
            "node": self._node.to_dict(),
            "running": self._running,
            "compute_engine": self._compute_engine.get_status() if self._compute_engine else None,
        }

import threading
import time
from datetime import datetime
from typing import Dict, List, Optional, Callable
from queue import Queue, Empty

from common.models import ComputeNode, NodeStatus, Task, TaskStatus, Heartbeat, ResourceUsage
from common.exceptions import (
    NodeNotFoundException,
    NodeOfflineException,
    InsufficientResourcesException,
    TaskExecutionException,
)


class NodeAgent:
    def __init__(self, node: ComputeNode, node_registry, resource_monitor,
                 heartbeat_interval: int = 10, task_executor=None):
        self._node = node
        self._node_registry = node_registry
        self._resource_monitor = resource_monitor
        self._heartbeat_interval = heartbeat_interval
        self._task_executor = task_executor
        self._running = False
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._task_executor_thread: Optional[threading.Thread] = None
        self._task_queue: "Queue[Task]" = Queue()
        self._active_tasks: Dict[str, Task] = {}
        self._lock = threading.RLock()
        self._task_callbacks: List[Callable[[Task], None]] = []

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._running = True
            self._register_with_registry()
            self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
            self._heartbeat_thread.start()
            self._task_executor_thread = threading.Thread(target=self._task_execution_loop, daemon=True)
            self._task_executor_thread.start()
            self._node.status = NodeStatus.IDLE

    def stop(self) -> None:
        with self._lock:
            if not self._running:
                return
            self._running = False
            self._node.status = NodeStatus.OFFLINE
            if self._heartbeat_thread:
                self._heartbeat_thread.join(timeout=5)
                self._heartbeat_thread = None
            if self._task_executor_thread:
                self._task_executor_thread.join(timeout=5)
                self._task_executor_thread = None
            self._unregister_from_registry()

    def submit_task(self, task: Task) -> Task:
        with self._lock:
            if self._node.status == NodeStatus.OFFLINE:
                raise NodeOfflineException(self._node.node_id)
            self._check_resources(task)
            task.node_id = self._node.node_id
            task.status = TaskStatus.PENDING
            self._task_queue.put(task)
            self._node.status = NodeStatus.BUSY
            return task

    def cancel_task(self, task_id: str) -> bool:
        with self._lock:
            if task_id in self._active_tasks:
                task = self._active_tasks[task_id]
                task.status = TaskStatus.CANCELLED
                task.completed_at = datetime.now()
                del self._active_tasks[task_id]
                self._update_task_queue(task_id)
                self._notify_task_callbacks(task)
                return True
            return False

    def get_active_tasks(self) -> List[Task]:
        with self._lock:
            return list(self._active_tasks.values())

    def get_task_status(self, task_id: str) -> Optional[Task]:
        with self._lock:
            if task_id in self._active_tasks:
                return self._active_tasks[task_id]
            return None

    def collect_resources(self) -> ResourceUsage:
        usage = ResourceUsage()
        usage.timestamp = datetime.now()
        try:
            import psutil
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            net_io = psutil.net_io_counters()
            usage.cpu_usage = cpu_percent
            usage.memory_usage = memory.percent
            usage.memory_total = memory.total
            usage.memory_used = memory.used
            usage.disk_usage = disk.percent
            if not hasattr(self, '_last_net_io'):
                self._last_net_io = net_io
                self._last_net_time = time.time()
            else:
                time_diff = time.time() - self._last_net_time
                if time_diff > 0:
                    bytes_in_diff = net_io.bytes_recv - self._last_net_io.bytes_recv
                    bytes_out_diff = net_io.bytes_sent - self._last_net_io.bytes_sent
                    usage.network_in = (bytes_in_diff / time_diff) / (1024 * 1024)
                    usage.network_out = (bytes_out_diff / time_diff) / (1024 * 1024)
                    usage.network_bandwidth = usage.network_in + usage.network_out
                self._last_net_io = net_io
                self._last_net_time = time.time()
        except ImportError:
            pass
        try:
            import GPUtil
            gpus = GPUtil.getGPUs()
            if gpus:
                usage.gpu_usage = gpus[0].load * 100
                usage.gpu_memory_usage = gpus[0].memoryUtil * 100
        except ImportError:
            pass
        return usage

    def send_heartbeat(self) -> None:
        with self._lock:
            resource_usage = self.collect_resources()
            self._resource_monitor.record_usage(self._node.node_id, resource_usage)
            self._node.resource_usage = resource_usage
            load_score = self._resource_monitor.calculate_load_score(self._node.node_id)
            active_task_ids = list(self._active_tasks.keys())
            if not self._active_tasks and self._task_queue.empty():
                self._node.status = NodeStatus.IDLE
            heartbeat = Heartbeat(
                node_id=self._node.node_id,
                timestamp=datetime.now(),
                resource_usage=resource_usage,
                status=self._node.status,
                active_tasks=active_task_ids,
                load_score=load_score,
            )
            self._node.load_score = load_score
            try:
                self._node_registry.update_heartbeat(heartbeat)
            except NodeNotFoundException:
                self._register_with_registry()
            except Exception:
                pass

    def add_task_callback(self, callback: Callable[[Task], None]) -> None:
        self._task_callbacks.append(callback)

    def remove_task_callback(self, callback: Callable[[Task], None]) -> None:
        if callback in self._task_callbacks:
            self._task_callbacks.remove(callback)

    def _register_with_registry(self) -> None:
        try:
            self._node_registry.register_node(self._node)
        except Exception:
            pass

    def _unregister_from_registry(self) -> None:
        try:
            self._node_registry.unregister_node(self._node.node_id)
        except Exception:
            pass

    def _check_resources(self, task: Task) -> None:
        usage = self._node.resource_usage
        available_cpu = 100.0 - usage.cpu_usage
        available_memory = usage.memory_total - usage.memory_used
        available_gpu = 100.0 - usage.gpu_usage
        if task.cpu_required > available_cpu:
            raise InsufficientResourcesException(
                self._node.node_id, "CPU", task.cpu_required, available_cpu
            )
        if task.memory_required > available_memory:
            raise InsufficientResourcesException(
                self._node.node_id, "Memory", task.memory_required, available_memory
            )
        if task.gpu_required > available_gpu:
            raise InsufficientResourcesException(
                self._node.node_id, "GPU", task.gpu_required, available_gpu
            )

    def _execute_task(self, task: Task) -> None:
        with self._lock:
            task.status = TaskStatus.RUNNING
            task.started_at = datetime.now()
            self._active_tasks[task.task_id] = task
        self._notify_task_callbacks(task)
        try:
            if self._task_executor:
                result = self._task_executor(task)
                with self._lock:
                    task.status = TaskStatus.COMPLETED
                    task.result = result
                    task.progress = 100.0
                    task.completed_at = datetime.now()
                    self._node.completed_tasks += 1
            else:
                time.sleep(0.1)
                with self._lock:
                    task.status = TaskStatus.COMPLETED
                    task.progress = 100.0
                    task.completed_at = datetime.now()
                    self._node.completed_tasks += 1
        except Exception as e:
            with self._lock:
                task.status = TaskStatus.FAILED
                task.error = str(e)
                task.completed_at = datetime.now()
                self._node.failed_tasks += 1
            raise TaskExecutionException(task.task_id, str(e)) from e
        finally:
            with self._lock:
                if task.task_id in self._active_tasks:
                    del self._active_tasks[task.task_id]
                if not self._active_tasks and self._task_queue.empty():
                    self._node.status = NodeStatus.IDLE
            self._notify_task_callbacks(task)

    def _heartbeat_loop(self) -> None:
        while self._running:
            try:
                self.send_heartbeat()
            except Exception:
                pass
            time.sleep(self._heartbeat_interval)

    def _task_execution_loop(self) -> None:
        while self._running:
            try:
                task = self._task_queue.get(timeout=1)
                if task.status == TaskStatus.CANCELLED:
                    continue
                self._execute_task(task)
            except Empty:
                continue
            except Exception:
                pass

    def _update_task_queue(self, task_id: str) -> None:
        remaining_tasks: List[Task] = []
        while not self._task_queue.empty():
            try:
                task = self._task_queue.get_nowait()
                if task.task_id != task_id:
                    remaining_tasks.append(task)
            except Empty:
                break
        for task in remaining_tasks:
            self._task_queue.put(task)

    def _notify_task_callbacks(self, task: Task) -> None:
        for callback in self._task_callbacks:
            try:
                callback(task)
            except Exception:
                pass

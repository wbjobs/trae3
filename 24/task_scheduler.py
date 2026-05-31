import json
import time
import threading
import queue
import signal
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass
from concurrent.futures import ProcessPoolExecutor, as_completed, ThreadPoolExecutor
from multiprocessing import Manager, Lock as ProcessLock
import logging
import os
import sys

from config import MAX_WORKERS
from database import Database, db as global_db
from mesh_generator import MeshGenerator, Node, Element
from parameter_import import ParameterImporter
from fem_solver import solve_task


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class TaskInfo:
    task_id: int
    name: str
    status: str
    progress: float
    grid_id: int
    priority: int
    created_at: str
    started_at: Optional[str]
    completed_at: Optional[str]


class TaskQueue:
    def __init__(self, maxsize: int = 10000):
        self._queue = queue.PriorityQueue(maxsize=maxsize)
        self._lock = threading.Lock()
        self._processing = set()

    def put(self, priority: int, task_id: int) -> bool:
        with self._lock:
            if task_id in self._processing:
                return False
            self._queue.put((-priority, time.time(), task_id))
            return True

    def get(self, timeout: float = None) -> Optional[int]:
        try:
            _, _, task_id = self._queue.get(timeout=timeout)
            with self._lock:
                self._processing.add(task_id)
            return task_id
        except queue.Empty:
            return None

    def qsize(self) -> int:
        return self._queue.qsize()

    def empty(self) -> bool:
        return self._queue.empty()

    def mark_done(self, task_id: int):
        with self._lock:
            self._processing.discard(task_id)

    def is_processing(self, task_id: int) -> bool:
        with self._lock:
            return task_id in self._processing


class DatabaseConnectionPool:
    def __init__(self, max_connections: int = 5):
        self._connections = []
        self._lock = threading.Lock()
        self._max_connections = max_connections

    def get_connection(self) -> Database:
        with self._lock:
            if self._connections:
                return self._connections.pop()
            return Database()

    def release_connection(self, conn: Database):
        with self._lock:
            if len(self._connections) < self._max_connections:
                self._connections.append(conn)


db_pool = DatabaseConnectionPool(max_connections=MAX_WORKERS)


def _execute_task_process(task_id: int, db_path: str) -> tuple:
    db = None
    try:
        db = Database(db_path)

        task = db.get_task(task_id)
        if not task or task['status'] != 'pending':
            return task_id, False, "Task not pending"

        grid_id = task['grid_id']
        grid_info = db.get_grid(grid_id)
        if not grid_info:
            return task_id, False, f"Grid {grid_id} not found"

        if not os.path.exists(grid_info['grid_data_path']):
            return task_id, False, f"Grid data file not found: {grid_info['grid_data_path']}"

        mesh_gen = MeshGenerator()
        nodes, elements, _ = mesh_gen.load_mesh(grid_info['grid_data_path'])

        boundary_conditions = db.get_boundary_conditions(grid_id)

        param_importer = ParameterImporter()
        hydro_params = {
            'hydraulic_conductivity': param_importer.get_hydraulic_conductivity(grid_id),
            'porosity': param_importer.get_porosity(grid_id),
            'specific_storage': param_importer.get_specific_storage(grid_id)
        }

        solver_config = json.loads(task['solver_config']) if task['solver_config'] else {}

        db.update_task_status(task_id, 'running', progress=10)

        result_path = solve_task(
            task_id=task_id,
            grid_id=grid_id,
            nodes=nodes,
            elements=elements,
            boundary_conditions=boundary_conditions,
            hydro_params=hydro_params,
            solver_config=solver_config,
            db_conn=db
        )

        return task_id, True, result_path

    except Exception as e:
        try:
            if db is None:
                db = Database(db_path)
            db.update_task_status(task_id, 'failed', error_message=str(e))
        except:
            pass
        return task_id, False, str(e)


class TaskScheduler:
    def __init__(self, max_workers: int = None, use_processes: bool = False):
        self.max_workers = max_workers or MAX_WORKERS
        self.use_processes = use_processes
        self.task_queue = TaskQueue()
        self.running = False
        self.worker_threads = []
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._semaphore = threading.Semaphore(self.max_workers)
        self._db_path = global_db.db_path

        self._load_pending_tasks()

    def _load_pending_tasks(self):
        try:
            pending_tasks = global_db.get_pending_tasks()
            for task in pending_tasks:
                self.task_queue.put(task['priority'], task['id'])
            logger.info(f"Loaded {len(pending_tasks)} pending tasks from database")
        except Exception as e:
            logger.error(f"Failed to load pending tasks: {e}")

    def create_task(self, name: str, grid_id: int, description: str = '',
                    priority: int = 0, solver_config: Dict = None) -> int:
        with self._lock:
            task_id = global_db.insert_task(
                name=name,
                description=description,
                grid_id=grid_id,
                priority=priority,
                solver_config=solver_config
            )
            self.task_queue.put(priority, task_id)
        logger.info(f"Created task {task_id}: {name}")
        return task_id

    def create_batch_tasks(self, tasks: List[Dict]) -> List[int]:
        task_ids = []
        for task_info in tasks:
            task_id = self.create_task(
                name=task_info['name'],
                grid_id=task_info['grid_id'],
                description=task_info.get('description', ''),
                priority=task_info.get('priority', 0),
                solver_config=task_info.get('solver_config')
            )
            task_ids.append(task_id)
        return task_ids

    def _execute_task_thread(self, task_id: int) -> bool:
        if not self._semaphore.acquire(blocking=False):
            logger.debug(f"Semaphore full, deferring task {task_id}")
            self.task_queue.mark_done(task_id)
            self.task_queue.put(0, task_id)
            return False

        db = None
        try:
            db = db_pool.get_connection()

            task = db.get_task(task_id)
            if not task or task['status'] != 'pending':
                logger.debug(f"Task {task_id} not pending, skipping")
                return False

            grid_id = task['grid_id']
            grid_info = db.get_grid(grid_id)
            if not grid_info:
                raise ValueError(f"Grid {grid_id} not found")

            if not os.path.exists(grid_info['grid_data_path']):
                raise FileNotFoundError(f"Grid data not found: {grid_info['grid_data_path']}")

            mesh_gen = MeshGenerator()
            nodes, elements, _ = mesh_gen.load_mesh(grid_info['grid_data_path'])

            boundary_conditions = db.get_boundary_conditions(grid_id)

            param_importer = ParameterImporter()
            hydro_params = {
                'hydraulic_conductivity': param_importer.get_hydraulic_conductivity(grid_id),
                'porosity': param_importer.get_porosity(grid_id),
                'specific_storage': param_importer.get_specific_storage(grid_id)
            }

            solver_config = json.loads(task['solver_config']) if task['solver_config'] else {}

            logger.info(f"Starting task {task_id}: {task['name']}")
            db.update_task_status(task_id, 'running', progress=10)

            result_path = solve_task(
                task_id=task_id,
                grid_id=grid_id,
                nodes=nodes,
                elements=elements,
                boundary_conditions=boundary_conditions,
                hydro_params=hydro_params,
                solver_config=solver_config,
                db_conn=db
            )

            logger.info(f"Completed task {task_id}: {task['name']}, result: {result_path}")
            return True

        except Exception as e:
            logger.error(f"Task {task_id} failed: {str(e)}", exc_info=True)
            try:
                if db is None:
                    db = db_pool.get_connection()
                db.update_task_status(task_id, 'failed', error_message=str(e))
            except:
                pass
            return False
        finally:
            if db is not None:
                db_pool.release_connection(db)
            self.task_queue.mark_done(task_id)
            self._semaphore.release()

    def _worker(self):
        while not self._stop_event.is_set():
            try:
                task_id = self.task_queue.get(timeout=1)
                if task_id is not None:
                    self._execute_task_thread(task_id)
            except Exception as e:
                logger.error(f"Worker error: {str(e)}", exc_info=True)
                if 'task_id' in locals():
                    self.task_queue.mark_done(task_id)

    def start(self):
        if self.running:
            logger.warning("Scheduler is already running")
            return

        self.running = True
        self._stop_event.clear()

        logger.info(f"Starting task scheduler with {self.max_workers} workers")
        for i in range(self.max_workers):
            t = threading.Thread(target=self._worker, name=f"Worker-{i}", daemon=True)
            t.start()
            self.worker_threads.append(t)

    def stop(self, wait: bool = True):
        logger.info("Stopping task scheduler...")
        self._stop_event.set()
        self.running = False

        if wait:
            for t in self.worker_threads:
                t.join(timeout=10)
            self.worker_threads = []

        logger.info("Task scheduler stopped")

    def get_task_status(self, task_id: int) -> Optional[TaskInfo]:
        task = global_db.get_task(task_id)
        if not task:
            return None
        return TaskInfo(
            task_id=task['id'],
            name=task['name'],
            status=task['status'],
            progress=task['progress'],
            grid_id=task['grid_id'],
            priority=task['priority'],
            created_at=task['created_at'],
            started_at=task['started_at'],
            completed_at=task['completed_at']
        )

    def get_all_tasks(self) -> List[TaskInfo]:
        tasks = global_db.get_all_tasks()
        return [
            TaskInfo(
                task_id=t['id'],
                name=t['name'],
                status=t['status'],
                progress=t['progress'],
                grid_id=t['grid_id'],
                priority=t['priority'],
                created_at=t['created_at'],
                started_at=t['started_at'],
                completed_at=t['completed_at']
            ) for t in tasks
        ]

    def get_queue_size(self) -> int:
        return self.task_queue.qsize()

    def get_active_tasks_count(self) -> int:
        return self.max_workers - self._semaphore._value

    def wait_for_task(self, task_id: int, timeout: float = None) -> bool:
        start_time = time.time()
        while True:
            task = global_db.get_task(task_id)
            if not task:
                return False
            if task['status'] in ['completed', 'failed']:
                return task['status'] == 'completed'
            if timeout and time.time() - start_time > timeout:
                return False
            time.sleep(0.5)

    def wait_for_all(self, timeout: float = None) -> bool:
        start_time = time.time()
        while True:
            if self.task_queue.empty() and self.get_active_tasks_count() == 0:
                return True
            if timeout and time.time() - start_time > timeout:
                return False
            time.sleep(0.5)


class ProcessTaskScheduler:
    def __init__(self, max_workers: int = None):
        self.max_workers = max_workers or MAX_WORKERS
        self._db_path = global_db.db_path
        logger.info(f"Process scheduler initialized with {self.max_workers} workers")

    def run_tasks_parallel(self, task_ids: List[int]) -> Dict[int, bool]:
        results = {}
        timeout = 3600 * 24

        with ProcessPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_task = {}
            for task_id in task_ids:
                future = executor.submit(_execute_task_process, task_id, self._db_path)
                future_to_task[future] = task_id

            for future in as_completed(future_to_task, timeout=timeout):
                task_id = future_to_task[future]
                try:
                    tid, success, info = future.result()
                    results[tid] = success
                    if success:
                        logger.info(f"Task {tid} completed successfully")
                    else:
                        logger.error(f"Task {tid} failed: {info}")
                except Exception as e:
                    results[task_id] = False
                    logger.error(f"Task {task_id} raised exception: {str(e)}")

        return results

    def run_pending_tasks(self) -> Dict[int, bool]:
        pending_tasks = global_db.get_pending_tasks()
        task_ids = [t['id'] for t in pending_tasks]
        logger.info(f"Running {len(task_ids)} pending tasks")
        return self.run_tasks_parallel(task_ids)


scheduler = TaskScheduler()


def run_scheduler_foreground():
    scheduler.start()
    try:
        while True:
            active = scheduler.get_active_tasks_count()
            queued = scheduler.get_queue_size()
            print(f"\rActive: {active}/{scheduler.max_workers}, Queued: {queued}", end='', flush=True)
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...")
        scheduler.stop()

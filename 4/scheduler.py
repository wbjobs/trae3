import sys
import time
import traceback
import os
import threading
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from multiprocessing import cpu_count

from config import SimulationConfig
from grid import BoundaryLayerGrid
from solver import BoundaryLayerSolver, warmup_jit
from database import SimulationDatabase
from exporter import ResultExporter


_jit_warmed = False


def _ensure_jit_warmup():
    global _jit_warmed
    if not _jit_warmed:
        warmup_jit()
        _jit_warmed = True


def _worker_compute(config_dict: dict, task_name: str) -> Dict[str, Any]:
    try:
        _ensure_jit_warmup()
        config = SimulationConfig.from_dict(config_dict)
        grid = BoundaryLayerGrid(config.grid)
        solver = BoundaryLayerSolver(grid, config)
        solver.initialize()
        use_parallel = config.parallel.num_workers > 1
        results = solver.solve(use_parallel=use_parallel, progress=False)
        results["grid_info"] = grid.info()
        results["_status"] = "success"
        results["_task_name"] = task_name
        return results
    except Exception as e:
        tb = traceback.format_exc()
        return {
            "_status": "error",
            "_error": str(e),
            "_traceback": tb,
            "_task_name": task_name,
        }


@dataclass
class TaskItem:
    task_id: int
    config: SimulationConfig
    status: str = "queued"
    priority: int = 0


class ProgressTracker:
    def __init__(self, total: int, prefix: str = ""):
        self.total = total
        self.prefix = prefix
        self.completed = 0
        self.failed = 0
        self.t_start = time.time()
        self._lock = threading.Lock()

    def report(self, task_name: str, success: bool, elapsed: float = 0.0):
        with self._lock:
            if success:
                self.completed += 1
            else:
                self.failed += 1
            done = self.completed + self.failed
            pct = done / self.total * 100.0
            elapsed_total = time.time() - self.t_start
            rate = done / elapsed_total if elapsed_total > 0 else 0
            eta = (self.total - done) / rate if rate > 0 else 0
            bar_len = 30
            filled = int(bar_len * done / self.total)
            bar = "█" * filled + "░" * (bar_len - filled)
            status_char = "✓" if success else "✗"
            msg = (f"\r  {self.prefix}[{bar}] {pct:5.1f}% "
                   f"({done}/{self.total}) {status_char} {task_name[:20]:20s} "
                   f"{rate:.1f} tasks/s ETA {eta:.0f}s")
            sys.stdout.write(msg)
            sys.stdout.flush()
            if done == self.total:
                sys.stdout.write("\n")


class TaskScheduler:
    def __init__(self, db_path: str = "boundary_layer_sim.db",
                 output_dir: str = "output",
                 max_workers: Optional[int] = None):
        self.db = SimulationDatabase(db_path)
        self.exporter = ResultExporter(output_dir)
        available_cpus = cpu_count()
        self.max_workers = max_workers if max_workers else min(4, available_cpus)
        self.task_queue: List[TaskItem] = []
        self._db_lock = threading.Lock()
        self._export_lock = threading.Lock()

    def submit(self, config: SimulationConfig, priority: int = 0) -> int:
        with self._db_lock:
            task_id = self.db.insert_task(config.task_name, config.to_json())
        item = TaskItem(task_id=task_id, config=config, status="queued", priority=priority)
        self.task_queue.append(item)
        return task_id

    def submit_batch(self, configs: List[SimulationConfig], priority: int = 0) -> List[int]:
        task_ids = []
        for cfg in configs:
            tid = self.submit(cfg, priority=priority)
            task_ids.append(tid)
        return task_ids

    def _sort_queue(self):
        self.task_queue.sort(key=lambda x: (-x.priority, x.task_id))

    def _update_task_status(self, task_id: int, status: str, **kwargs):
        with self._db_lock:
            self.db.update_task_status(task_id, status, **kwargs)

    def _insert_result(self, task_id: int, results: Dict[str, Any]):
        with self._db_lock:
            self.db.insert_results(task_id, results)

    def _export_results(self, task_name: str, results: Dict[str, Any]) -> Dict[str, str]:
        with self._export_lock:
            return self.exporter.export_all(task_name, results)

    def _process_completed_task(self, item: TaskItem, results: Dict[str, Any]) -> Dict[str, Any]:
        task_id = item.task_id
        config = item.config

        if results.get("_status") == "error":
            error_msg = results.get("_error", "Unknown error")
            with self._db_lock:
                self.db.update_task_status(task_id, "failed", error_message=error_msg)
            return {"task_id": task_id, "error": error_msg}

        iterations = results.get("iterations", 0)
        res_hist = results.get("residual_history", [])
        final_res = float(res_hist[-1]) if len(res_hist) > 0 else 0.0

        self._insert_result(task_id, results)

        with self._db_lock:
            self.db.update_task_status(
                task_id, "completed",
                iterations=iterations,
                final_residual=final_res,
            )

        task_name = results.get("_task_name", config.task_name)
        exported = self._export_results(task_name, results)

        results["exported_files"] = exported
        results["task_id"] = task_id
        return results

    def run_sequential(self) -> List[Dict[str, Any]]:
        self._sort_queue()
        results_list = []
        total = len(self.task_queue)
        tracker = ProgressTracker(total, prefix="Tasks ")

        print("\n[Scheduler] Warming up JIT compilation...")
        _ensure_jit_warmup()
        print("[Scheduler] JIT ready.\n")

        while self.task_queue:
            item = self.task_queue.pop(0)
            task_id = item.task_id
            config = item.config

            self._update_task_status(task_id, "running")

            t0 = time.time()
            results = _worker_compute(config.to_dict(), config.task_name)
            elapsed = time.time() - t0

            processed = self._process_completed_task(item, results)
            processed["elapsed_seconds"] = elapsed
            results_list.append(processed)

            success = results.get("_status") == "success"
            tracker.report(config.task_name, success, elapsed)

        return results_list

    def run_parallel(self) -> List[Dict[str, Any]]:
        self._sort_queue()
        results_list = []
        if not self.task_queue:
            return results_list

        tasks_to_run = []
        while self.task_queue:
            tasks_to_run.append(self.task_queue.pop(0))

        num_workers = min(self.max_workers, len(tasks_to_run))
        total = len(tasks_to_run)
        tracker = ProgressTracker(total, prefix="Tasks ")

        print(f"\n[Scheduler] Warming up JIT in main process...")
        _ensure_jit_warmup()
        print(f"[Scheduler] Launching {num_workers} workers for {total} tasks\n")

        for item in tasks_to_run:
            self._update_task_status(item.task_id, "running")

        with ProcessPoolExecutor(max_workers=num_workers) as executor:
            future_map = {}
            for item in tasks_to_run:
                future = executor.submit(
                    _worker_compute, item.config.to_dict(), item.config.task_name
                )
                future_map[future] = item

            for future in as_completed(future_map):
                item = future_map[future]
                try:
                    results = future.result()
                    processed = self._process_completed_task(item, results)
                    results_list.append(processed)
                    success = results.get("_status") == "success"
                    tracker.report(item.config.task_name, success)
                except Exception as e:
                    with self._db_lock:
                        self.db.update_task_status(item.task_id, "failed", error_message=str(e))
                    results_list.append({"task_id": item.task_id, "error": str(e)})
                    tracker.report(item.config.task_name, False)

        return results_list

    def run(self, mode: str = "sequential") -> List[Dict[str, Any]]:
        if mode == "sequential":
            return self.run_sequential()
        elif mode == "parallel":
            return self.run_parallel()
        else:
            raise ValueError(f"Unknown run mode: {mode}")

    def get_task_status(self, task_id: int) -> Optional[Dict[str, Any]]:
        with self._db_lock:
            return self.db.get_task(task_id)

    def list_tasks(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._db_lock:
            return self.db.list_tasks(status)

    def export_task_results(self, task_id: int) -> Optional[Dict[str, str]]:
        with self._db_lock:
            results = self.db.get_results(task_id)
            task = self.db.get_task(task_id)
        if results is None or task is None:
            return None
        return self._export_results(task["task_name"], results)

    def close(self):
        with self._db_lock:
            self.db.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

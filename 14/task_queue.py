import os
import time
import logging
import threading
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
import config
from grid_mesh import GridMesh
from turbulence_solver import TurbulenceSolver
from meteo_importer import MeteoImporter

logger = logging.getLogger(__name__)


def _estimate_memory_mb(nx, ny, nz):
    bytes_per_float64 = 8
    n_cells = nx * ny * nz
    field_count = 18
    return n_cells * bytes_per_float64 * field_count / (1024 * 1024)


def _execute_single_task(task_dict, meteo_params, result_dir, lightweight=True):
    task_id = task_dict["id"]
    task_name = task_dict["task_name"]
    try:
        logger.info("[Task %d] Starting: %s", task_id, task_name)

        grid = GridMesh(
            nx=task_dict.get("grid_nx", config.GRID_DEFAULT_NX),
            ny=task_dict.get("grid_ny", config.GRID_DEFAULT_NY),
            nz=task_dict.get("grid_nz", config.GRID_DEFAULT_NZ),
            roughness_length=meteo_params.get("roughness_length", 0.01),
        )
        grid.generate()

        solver_cfg = {
            "method": task_dict.get("solver_method", config.SOLVER_METHOD),
            "turbulence_model": task_dict.get("turbulence_model", config.TURBULENCE_MODEL),
            "max_iterations": task_dict.get("max_iterations", config.SOLVER_MAX_ITER),
            "tolerance": task_dict.get("tolerance", config.SOLVER_TOLERANCE),
            "dt": task_dict.get("dt", config.SOLVER_DT),
            "t_end": task_dict.get("t_end", config.SOLVER_T_END),
        }

        def on_monitor(summary):
            progress = summary.get("progress", 0)
            eta = summary.get("eta_seconds", 0)
            step = summary.get("step", 0)
            logger.debug(
                "[Task %d] progress=%.1f%% step=%d eta=%.1fs",
                task_id, progress * 100, step, eta,
            )

        solver = TurbulenceSolver(grid, meteo_params, solver_cfg)
        solver.monitor.add_callback(on_monitor)
        result = solver.solve(monitor_interval=2.0)

        result_path = os.path.join(result_dir, f"task_{task_id}_result.pkl")
        if lightweight:
            solver.save_lightweight_result(result_path)
        else:
            solver.save_result(result_path)

        history = result.get("history", [])
        summary = {
            "total_steps": result["metadata"]["total_steps"],
            "final_time": result["metadata"]["final_time"],
            "converged": result["metadata"]["converged"],
            "avg_wind_speed": history[-1]["avg_wind_speed"] if history else 0,
            "avg_tke": history[-1]["avg_tke"] if history else 0,
            "result_path": result_path,
        }
        logger.info("[Task %d] Completed: steps=%d, converged=%s",
                     task_id, summary["total_steps"], summary["converged"])
        return task_id, "completed", None, result_path, history

    except Exception as e:
        tb = traceback.format_exc()
        logger.error("[Task %d] Failed: %s\n%s", task_id, e, tb)
        return task_id, "failed", str(e), None, []


class TaskQueue:
    def __init__(self, db=None, max_workers=None):
        self.db = db or DatabaseManager()
        cpu_count = os.cpu_count() or 4
        self.max_workers = min(max_workers or cpu_count, max(cpu_count - 1, 1))
        self.result_dir = config.RESULT_DIR
        self._running_count = 0
        self._lock = threading.Lock()
        self._max_memory_mb = self._detect_available_memory()
        self._lightweight = True

    def _detect_available_memory(self):
        try:
            import psutil
            mem = psutil.virtual_memory()
            return mem.available / (1024 * 1024) * 0.5
        except ImportError:
            return 4096.0

    def _compute_concurrency(self, tasks):
        if not tasks:
            return 0

        max_per_task = 0
        for t in tasks:
            nx = t.get("grid_nx", config.GRID_DEFAULT_NX)
            ny = t.get("grid_ny", config.GRID_DEFAULT_NY)
            nz = t.get("grid_nz", config.GRID_DEFAULT_NZ)
            mem = _estimate_memory_mb(nx, ny, nz)
            if mem > max_per_task:
                max_per_task = mem

        if max_per_task > 0:
            mem_limited = max(1, int(self._max_memory_mb / max_per_task))
        else:
            mem_limited = self.max_workers

        available_slots = max(0, self.max_workers - self._running_count)
        return min(available_slots, mem_limited, len(tasks))

    def submit_task(self, task_name, params_id, grid_config=None, solver_config=None):
        grid_config = grid_config or {}
        solver_config = solver_config or {}
        task_id = self.db.create_task(task_name, params_id, grid_config, solver_config)
        logger.info("Task submitted: id=%d, name=%s", task_id, task_name)
        return task_id

    def submit_batch(self, task_specs):
        task_ids = []
        for spec in task_specs:
            tid = self.submit_task(
                spec["task_name"],
                spec["params_id"],
                spec.get("grid_config", {}),
                spec.get("solver_config", {}),
            )
            task_ids.append(tid)
        logger.info("Batch submitted: %d tasks", len(task_ids))
        return task_ids

    def process_pending(self):
        pending = self.db.fetch_pending_tasks()
        if not pending:
            logger.debug("No pending tasks")
            return []

        task_meteo = {}
        for task in pending:
            params = self.db.get_meteo_params(task["params_id"])
            if params is None:
                self.db.update_task_status(task["id"], "failed",
                                           error_message="Meteo params not found")
                continue
            serializable_params = {}
            for k, v in params.items():
                serializable_params[k] = str(v) if hasattr(v, 'isoformat') else v
            task_meteo[task["id"]] = serializable_params

        valid_tasks = [t for t in pending if t["id"] in task_meteo]
        n_concurrent = self._compute_concurrency(valid_tasks)

        if n_concurrent <= 0:
            logger.info("All %d worker slots occupied or memory limited, waiting",
                         self.max_workers)
            return []

        tasks_to_run = valid_tasks[:n_concurrent]

        logger.info("Processing %d/%d pending tasks (workers=%d, memory_budget=%.0fMB, concurrent=%d)",
                     len(tasks_to_run), len(valid_tasks),
                     self.max_workers, self._max_memory_mb, n_concurrent)

        for task in tasks_to_run:
            self.db.update_task_status(task["id"], "running")

        if len(tasks_to_run) == 1:
            results = self._execute_sequential(tasks_to_run, task_meteo)
        else:
            results = self._execute_parallel(tasks_to_run, task_meteo)

        return results

    def _execute_sequential(self, tasks, task_meteo):
        results = []
        os.makedirs(self.result_dir, exist_ok=True)

        with self._lock:
            self._running_count += 1

        try:
            for task in tasks:
                tid, status, err, rpath, history = _execute_single_task(
                    task, task_meteo[task["id"]], self.result_dir,
                    lightweight=self._lightweight,
                )
                self.db.update_task_status(tid, status, error_message=err, result_path=rpath)
                self._store_step_results(tid, history)
                results.append({"task_id": tid, "status": status})
        finally:
            with self._lock:
                self._running_count -= 1

        return results

    def _execute_parallel(self, tasks, task_meteo):
        results = []
        os.makedirs(self.result_dir, exist_ok=True)
        n_workers = min(len(tasks), self.max_workers)

        with self._lock:
            self._running_count += n_workers

        try:
            with ProcessPoolExecutor(max_workers=n_workers) as executor:
                future_map = {}
                for task in tasks:
                    future = executor.submit(
                        _execute_single_task,
                        task,
                        task_meteo[task["id"]],
                        self.result_dir,
                        self._lightweight,
                    )
                    future_map[future] = task["id"]

                for future in as_completed(future_map):
                    task_id = future_map[future]
                    try:
                        tid, status, err, rpath, history = future.result()
                        self.db.update_task_status(
                            tid, status, error_message=err, result_path=rpath
                        )
                        self._store_step_results(tid, history)
                        results.append({"task_id": tid, "status": status})
                    except Exception as e:
                        logger.error("Task %d raised exception: %s", task_id, e)
                        self.db.update_task_status(
                            task_id, "failed", error_message=str(e)
                        )
                        results.append({"task_id": task_id, "status": "failed"})
        finally:
            with self._lock:
                self._running_count -= n_workers

        return results

    def _store_step_results(self, task_id, history):
        if not history:
            return
        report_interval = max(1, len(history) // 50)
        batch = []
        for i, h in enumerate(history):
            if i % report_interval == 0 or i == len(history) - 1:
                batch.append((task_id, h["step"], h["time"], h))

        if not batch:
            return

        for item in batch:
            try:
                task_id_i, step_i, time_i, summary_i = item
                self.db.insert_result(task_id_i, step_i, time_i, summary_i)
            except Exception as e:
                logger.warning("Failed to store step result for task %d: %s", task_id_i, e)

    def run_daemon(self, poll_interval=None, max_cycles=None):
        poll_interval = poll_interval or config.TASK_QUEUE_POLL_INTERVAL
        cycle = 0
        logger.info("Task queue daemon started (poll=%.1fs, max_workers=%d, mem_budget=%.0fMB)",
                     poll_interval, self.max_workers, self._max_memory_mb)
        while True:
            cycle += 1
            try:
                results = self.process_pending()
                if results:
                    for r in results:
                        logger.info("  Task %d: %s", r["task_id"], r["status"])
            except Exception as e:
                logger.error("Daemon cycle error: %s", e)

            if max_cycles and cycle >= max_cycles:
                logger.info("Daemon reached max cycles (%d), stopping", max_cycles)
                break
            time.sleep(poll_interval)

    def get_task_status(self, task_id):
        try:
            sql = "SELECT id, task_name, status, error_message, result_path FROM sim_tasks WHERE id = %s;"
            with self.db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, (task_id,))
                    row = cur.fetchone()
            if row is None:
                return None
            return {
                "id": row[0], "task_name": row[1], "status": row[2],
                "error_message": row[3], "result_path": row[4],
            }
        except Exception as e:
            logger.error("Failed to get task status: %s", e)
            return None

import time
import threading
from typing import Callable, Optional, Dict, List, Any
from datetime import datetime, timedelta
from collections import deque
from cache_toolkit.utils.logger import get_logger

logger = get_logger()


class Task:
    def __init__(
        self,
        task_id: str,
        func: Callable,
        args: tuple = (),
        kwargs: Optional[dict] = None,
        interval: Optional[float] = None,
        cron: Optional[str] = None,
        run_once: bool = False,
    ):
        self.task_id = task_id
        self.func = func
        self.args = args
        self.kwargs = kwargs or {}
        self.interval = interval
        self.cron = cron
        self.run_once = run_once
        self.last_run: Optional[datetime] = None
        self.next_run: Optional[datetime] = None
        self.running = False
        self.success_count = 0
        self.failure_count = 0
        self.last_error: Optional[str] = None
        self._calculate_next_run()

    def _calculate_next_run(self):
        if self.run_once and self.last_run:
            self.next_run = None
            return

        if self.interval:
            base = self.last_run or datetime.now()
            self.next_run = base + timedelta(seconds=self.interval)
        else:
            self.next_run = None

    def should_run(self) -> bool:
        if self.running:
            return False
        if self.next_run is None:
            return False
        return datetime.now() >= self.next_run

    def execute(self) -> Any:
        self.running = True
        self.last_run = datetime.now()
        try:
            result = self.func(*self.args, **self.kwargs)
            self.success_count += 1
            self.last_error = None
            return result
        except Exception as e:
            self.failure_count += 1
            self.last_error = str(e)
            logger.error(f"Task {self.task_id} failed: {e}")
            raise
        finally:
            self.running = False
            self._calculate_next_run()

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "interval": self.interval,
            "cron": self.cron,
            "last_run": self.last_run.isoformat() if self.last_run else None,
            "next_run": self.next_run.isoformat() if self.next_run else None,
            "running": self.running,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "last_error": self.last_error,
        }


class Scheduler:
    def __init__(self, max_workers: int = 4):
        self._tasks: Dict[str, Task] = {}
        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._max_workers = max_workers
        self._results: deque = deque(maxlen=1000)

    def add_task(
        self,
        task_id: str,
        func: Callable,
        args: tuple = (),
        kwargs: Optional[dict] = None,
        interval: Optional[float] = None,
        cron: Optional[str] = None,
        run_once: bool = False,
    ) -> Task:
        with self._lock:
            if task_id in self._tasks:
                raise ValueError(f"Task {task_id} already exists")

            task = Task(
                task_id=task_id,
                func=func,
                args=args,
                kwargs=kwargs,
                interval=interval,
                cron=cron,
                run_once=run_once,
            )
            self._tasks[task_id] = task
            logger.info(f"Task {task_id} added to scheduler")
            return task

    def remove_task(self, task_id: str) -> bool:
        with self._lock:
            if task_id in self._tasks:
                del self._tasks[task_id]
                logger.info(f"Task {task_id} removed from scheduler")
                return True
            return False

    def get_task(self, task_id: str) -> Optional[Task]:
        with self._lock:
            return self._tasks.get(task_id)

    def list_tasks(self) -> List[Task]:
        with self._lock:
            return list(self._tasks.values())

    def run_once(self, task_id: str) -> Any:
        with self._lock:
            task = self._tasks.get(task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")
        return task.execute()

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="Scheduler")
        self._thread.start()
        logger.info("Scheduler started")

    def stop(self, wait: bool = True):
        self._stop_event.set()
        if self._thread and wait:
            self._thread.join(timeout=5)
        logger.info("Scheduler stopped")

    def _loop(self):
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception as e:
                logger.error(f"Scheduler loop error: {e}")
            time.sleep(0.5)

    def _tick(self):
        with self._lock:
            tasks_to_run = [t for t in self._tasks.values() if t.should_run()]

        for task in tasks_to_run:
            try:
                result = task.execute()
                self._results.append({
                    "task_id": task.task_id,
                    "timestamp": datetime.now().isoformat(),
                    "success": True,
                    "result": str(result)[:200] if result else None,
                })
            except Exception as e:
                self._results.append({
                    "task_id": task.task_id,
                    "timestamp": datetime.now().isoformat(),
                    "success": False,
                    "error": str(e),
                })

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def recent_results(self) -> list:
        return list(self._results)


_global_scheduler: Optional[Scheduler] = None


def get_scheduler() -> Scheduler:
    global _global_scheduler
    if _global_scheduler is None:
        _global_scheduler = Scheduler()
    return _global_scheduler

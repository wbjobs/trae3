from __future__ import annotations
import time
import sys
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import List, Dict, Any, Callable, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class TaskResult:
    task_id: str
    success: bool
    result: Any = None
    error: Optional[str] = None
    duration: float = 0.0


@dataclass
class TaskStats:
    total: int = 0
    completed: int = 0
    success: int = 0
    failed: int = 0
    skipped: int = 0
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

    @property
    def elapsed(self) -> float:
        if not self.start_time:
            return 0.0
        end = self.end_time or datetime.utcnow()
        return (end - self.start_time).total_seconds()


class ProgressBar:
    def __init__(self, total: int, prefix: str = "Progress", width: int = 30,
                 enabled: bool = True, output=None):
        self.total = total
        self.prefix = prefix
        self.width = width
        self.enabled = enabled
        self.output = output or sys.stderr
        self.current = 0
        self._last_len = 0

    def update(self, n: int = 1):
        self.current = min(self.current + n, self.total)
        if self.enabled:
            self._render()

    def finish(self):
        self.current = self.total
        if self.enabled:
            self._render()
            self.output.write("\n")
            self.output.flush()

    def _render(self):
        if self.total <= 0:
            return
        ratio = self.current / self.total
        filled = int(self.width * ratio)
        bar = "█" * filled + "░" * (self.width - filled)
        percent = f"{ratio * 100:.1f}%"
        line = f"\r{self.prefix} |{bar}| {self.current}/{self.total} {percent}"
        pad_len = max(0, self._last_len - len(line))
        self.output.write(line + " " * pad_len)
        self.output.flush()
        self._last_len = len(line)


class BatchExecutor:
    def __init__(self, max_workers: int = 5, chunk_size: Optional[int] = None,
                 show_progress: bool = True, stop_on_error: bool = False):
        self.max_workers = max_workers
        self.chunk_size = chunk_size
        self.show_progress = show_progress
        self.stop_on_error = stop_on_error
        self.stats = TaskStats()

    def execute(self, tasks: List[Tuple[str, Callable, tuple, dict]],
                callback: Optional[Callable[[TaskResult], None]] = None) -> List[TaskResult]:
        if not tasks:
            return []

        self.stats = TaskStats(total=len(tasks), start_time=datetime.utcnow())
        results: List[TaskResult] = []
        progress = ProgressBar(len(tasks), enabled=self.show_progress)

        if self.chunk_size:
            return self._execute_chunked(tasks, callback, progress)

        return self._execute_concurrent(tasks, callback, progress)

    def _execute_concurrent(self, tasks: List[Tuple[str, Callable, tuple, dict]],
                            callback: Optional[Callable[[TaskResult], None]],
                            progress: ProgressBar) -> List[TaskResult]:
        results: List[TaskResult] = []

        if self.max_workers <= 1:
            for task_id, func, args, kwargs in tasks:
                result = self._run_task(task_id, func, args, kwargs)
                results.append(result)
                progress.update()
                if callback:
                    callback(result)
                self._update_stats(result)
                if self.stop_on_error and not result.success:
                    break
        else:
            with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                futures = {}
                for task_id, func, args, kwargs in tasks:
                    future = executor.submit(self._run_task, task_id, func, args, kwargs)
                    futures[future] = task_id

                for future in as_completed(futures):
                    result = future.result()
                    results.append(result)
                    progress.update()
                    if callback:
                        callback(result)
                    self._update_stats(result)

        self.stats.end_time = datetime.utcnow()
        progress.finish()
        return results

    def _execute_chunked(self, tasks: List[Tuple[str, Callable, tuple, dict]],
                         callback: Optional[Callable[[TaskResult], None]],
                         progress: ProgressBar) -> List[TaskResult]:
        results: List[TaskResult] = []
        chunks = [tasks[i:i + self.chunk_size] for i in range(0, len(tasks), self.chunk_size)]

        logger.info(f"Split {len(tasks)} tasks into {len(chunks)} chunks (size={self.chunk_size})")

        for i, chunk in enumerate(chunks):
            logger.debug(f"Processing chunk {i + 1}/{len(chunks)} ({len(chunk)} tasks)")
            chunk_results = self._execute_concurrent(chunk, callback, progress)
            results.extend(chunk_results)

            has_errors = any(not r.success for r in chunk_results)
            if self.stop_on_error and has_errors:
                logger.warning(f"Stopping after chunk {i + 1} due to errors")
                break

            if i < len(chunks) - 1:
                time.sleep(0.1)

        return results

    def _run_task(self, task_id: str, func: Callable, args: tuple, kwargs: dict) -> TaskResult:
        start = time.time()
        try:
            result = func(*args, **kwargs)
            duration = time.time() - start
            return TaskResult(task_id=task_id, success=True, result=result, duration=duration)
        except Exception as e:
            duration = time.time() - start
            logger.error(f"Task {task_id} failed: {e}")
            return TaskResult(task_id=task_id, success=False, error=str(e), duration=duration)

    def _update_stats(self, result: TaskResult):
        self.stats.completed += 1
        if result.success:
            self.stats.success += 1
        else:
            self.stats.failed += 1

    def print_summary(self, output=None):
        out = output or sys.stdout
        out.write("\n=== Batch Execution Summary ===\n")
        out.write(f"  Total:     {self.stats.total}\n")
        out.write(f"  Success:   {self.stats.success}\n")
        out.write(f"  Failed:    {self.stats.failed}\n")
        out.write(f"  Elapsed:   {self.stats.elapsed:.2f}s\n")
        if self.stats.total > 0:
            rate = self.stats.success / self.stats.total * 100
            out.write(f"  Success rate: {rate:.1f}%\n")
        out.write("\n")
        out.flush()

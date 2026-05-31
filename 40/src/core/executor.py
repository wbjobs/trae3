import time
import threading
import queue
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Generic, TypeVar
from collections import deque
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

T = TypeVar('T')
R = TypeVar('R')


@dataclass
class TaskResult(Generic[R]):
    task_id: str
    success: bool
    result: Optional[R] = None
    error: Optional[Exception] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    retries: int = 0
    
    @property
    def duration(self) -> float:
        if self.start_time and self.end_time:
            return (self.end_time - self.start_time).total_seconds()
        return 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "success": self.success,
            "duration": self.duration,
            "retries": self.retries,
            "error": str(self.error) if self.error else None
        }


@dataclass
class BatchProgress:
    total: int = 0
    completed: int = 0
    failed: int = 0
    in_progress: int = 0
    pending: int = 0
    current_task: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "in_progress": self.in_progress,
            "pending": self.pending,
            "progress": f"{self.completed}/{self.total}",
            "percentage": f"{(self.completed / self.total * 100):.1f}%" if self.total > 0 else "0%"
        }


class ProgressBar:
    def __init__(self, total: int, width: int = 50):
        self.total = total
        self.width = width
        self.current = 0
        self.start_time = time.time()
    
    def update(self, current: int, task_name: str = ""):
        self.current = current
        self._render(task_name)
    
    def _render(self, task_name: str):
        percentage = self.current / self.total if self.total > 0 else 0
        filled = int(self.width * percentage)
        bar = '█' * filled + '░' * (self.width - filled)
        
        elapsed = time.time() - self.start_time
        eta = (elapsed / percentage * (1 - percentage)) if percentage > 0 else 0
        
        status = f"{self.current}/{self.total}"
        time_info = f"[{self._format_time(elapsed)}<{self._format_time(eta)}]"
        
        line = f"\r{percentage*100:5.1f}% |{bar}| {status} {time_info}"
        if task_name:
            line += f" - {task_name}"
        
        print(line, end='', flush=True)
        
        if self.current >= self.total:
            print()
    
    def _format_time(self, seconds: float) -> str:
        if seconds < 60:
            return f"{seconds:.0f}s"
        elif seconds < 3600:
            return f"{seconds/60:.0f}m"
        else:
            return f"{seconds/3600:.1f}h"


class TaskQueue:
    def __init__(self):
        self._queue = deque()
        self._lock = threading.Lock()
    
    def put(self, task):
        with self._lock:
            self._queue.append(task)
    
    def get(self):
        with self._lock:
            if self._queue:
                return self._queue.popleft()
            return None
    
    def size(self) -> int:
        with self._lock:
            return len(self._queue)
    
    def empty(self) -> bool:
        return self.size() == 0


class BatchExecutor:
    def __init__(self, max_workers: int = 10, show_progress: bool = True):
        self.max_workers = max_workers
        self.show_progress = show_progress
        self.progress = BatchProgress()
        self.results: List[TaskResult] = []
    
    def execute(
        self,
        tasks: List[Dict[str, Any]],
        task_func: Callable[[Dict[str, Any]], Any],
        task_id_key: str = "id"
    ) -> List[TaskResult]:
        self.results = []
        self.progress = BatchProgress(total=len(tasks), pending=len(tasks))
        
        if self.show_progress:
            bar = ProgressBar(len(tasks))
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {}
            for task in tasks:
                task_id = task.get(task_id_key, str(task))
                future = executor.submit(self._execute_task, task_id, task, task_func)
                futures[future] = task_id
            
            completed_count = 0
            for future in as_completed(futures):
                task_id = futures[future]
                result = future.result()
                self.results.append(result)
                
                completed_count += 1
                self.progress.completed = completed_count
                self.progress.current_task = task_id
                
                if result.success:
                    self.progress.in_progress -= 1
                else:
                    self.progress.failed += 1
                
                if self.show_progress:
                    bar.update(completed_count, task_id)
        
        return self.results
    
    def _execute_task(self, task_id: str, task: Dict[str, Any], func: Callable) -> TaskResult:
        result = TaskResult(task_id=task_id, success=False, start_time=datetime.now())
        
        try:
            task_result = func(task)
            result.success = True
            result.result = task_result
        except Exception as e:
            result.error = e
            logger.error(f"任务执行失败 {task_id}: {str(e)}")
        finally:
            result.end_time = datetime.now()
        
        return result
    
    def execute_with_retry(
        self,
        tasks: List[Dict[str, Any]],
        task_func: Callable[[Dict[str, Any]], Any],
        task_id_key: str = "id",
        max_retries: int = 3,
        retry_on_exceptions: tuple = (Exception,),
        retry_delay: float = 1.0
    ) -> List[TaskResult]:
        all_results: List[TaskResult] = []
        current_tasks = tasks.copy()
        
        for attempt in range(max_retries + 1):
            if not current_tasks:
                break
            
            if attempt > 0 and self.show_progress:
                print(f"\n第 {attempt} 次重试，剩余 {len(current_tasks)} 个任务...")
                time.sleep(retry_delay * attempt)
            
            results = self.execute(current_tasks, task_func, task_id_key)
            all_results.extend(results)
            
            failed_tasks = []
            for r in results:
                if not r.success and isinstance(r.error, retry_on_exceptions):
                    original_task = next((t for t in current_tasks if t.get(task_id_key) == r.task_id), None)
                    if original_task:
                        failed_tasks.append(original_task)
            
            current_tasks = failed_tasks
        
        return all_results
    
    def get_summary(self) -> Dict[str, Any]:
        success_count = sum(1 for r in self.results if r.success)
        failed_count = len(self.results) - success_count
        total_duration = sum(r.duration for r in self.results)
        
        return {
            "total": len(self.results),
            "success": success_count,
            "failed": failed_count,
            "success_rate": f"{(success_count / len(self.results) * 100):.1f}%" if self.results else "0%",
            "total_duration": total_duration,
            "avg_duration": f"{(total_duration / len(self.results) * 1000):.2f}ms" if self.results else "0ms"
        }


class RateLimiter:
    def __init__(self, rate: float, per_second: float = 1.0):
        self.rate = rate
        self.per_second = per_second
        self._tokens = rate
        self._last_update = time.time()
        self._lock = threading.Lock()
    
    def acquire(self):
        with self._lock:
            now = time.time()
            time_passed = now - self._last_update
            self._tokens = min(self.rate, self._tokens + time_passed * (self.rate / self.per_second))
            self._last_update = now
            
            if self._tokens >= 1:
                self._tokens -= 1
                return True
            return False
    
    def wait(self):
        while not self.acquire():
            time.sleep(0.01)


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: int = 30):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        
        self.failure_count = 0
        self.last_failure_time = 0
        self.state = "closed"
        self._lock = threading.Lock()
    
    def call(self, func: Callable, *args, **kwargs):
        with self._lock:
            if self.state == "open":
                if time.time() - self.last_failure_time > self.recovery_timeout:
                    self.state = "half-open"
                else:
                    raise RuntimeError("Circuit breaker is OPEN")
        
        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise
    
    def _on_success(self):
        with self._lock:
            if self.state == "half-open":
                self.state = "closed"
            self.failure_count = 0
    
    def _on_failure(self):
        with self._lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            if self.state == "half-open":
                self.state = "open"
            elif self.state == "closed" and self.failure_count >= self.failure_threshold:
                self.state = "open"
                logger.warning(f"Circuit breaker opened after {self.failure_count} failures")

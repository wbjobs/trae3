import time
from typing import Optional, Callable
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn, TimeElapsedColumn
from rich.console import Console

console = Console()


class ProgressTracker:
    def __init__(self, description: str = "Processing", total: int = 0):
        self.description = description
        self.total = total
        self.completed = 0
        self.failed = 0
        self._start_time: Optional[float] = None
        self._on_update: Optional[Callable] = None

    def start(self):
        self._start_time = time.time()

    @property
    def elapsed(self) -> float:
        if self._start_time is None:
            return 0.0
        return round(time.time() - self._start_time, 2)

    @property
    def progress_ratio(self) -> float:
        if self.total == 0:
            return 0.0
        return round(self.completed / self.total, 4)

    def update(self, completed: int = 0, failed: int = 0):
        self.completed += completed
        self.failed += failed
        if self._on_update:
            self._on_update(self)

    def summary(self) -> dict:
        return {
            "description": self.description,
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "progress": self.progress_ratio,
            "elapsed_seconds": self.elapsed,
        }


def display_progress(tracker: ProgressTracker):
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task(tracker.description, total=tracker.total or None)
        original_update = tracker.update

        def _on_update(t: ProgressTracker):
            progress.update(task, completed=t.completed)

        tracker._on_update = _on_update
        yield tracker
        tracker._on_update = None

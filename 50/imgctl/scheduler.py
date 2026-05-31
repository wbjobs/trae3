from __future__ import annotations
import time
import threading
import logging
import re
from datetime import datetime, timedelta
from typing import Dict, Callable, Optional, List, Tuple
from dataclasses import dataclass

from imgctl.db import Database
from imgctl.cleaner import Cleaner
from imgctl.registry import RegistryClient

logger = logging.getLogger(__name__)


@dataclass
class CronExpression:
    minute: str = "*"
    hour: str = "*"
    day: str = "*"
    month: str = "*"
    weekday: str = "*"

    @classmethod
    def parse(cls, expr: str) -> "CronExpression":
        parts = expr.strip().split()
        if len(parts) != 5:
            raise ValueError(f"Invalid cron expression: {expr}. Expected 5 fields: minute hour day month weekday")
        return cls(*parts)

    def matches(self, dt: datetime) -> bool:
        def _match_field(field: str, value: int, valid_range: Tuple[int, int]) -> bool:
            if field == "*":
                return True
            for part in field.split(","):
                if "/" in part:
                    range_part, step = part.split("/", 1)
                    step = int(step)
                    if range_part == "*":
                        if value % step == 0:
                            return True
                    elif "-" in range_part:
                        start, end = map(int, range_part.split("-", 1))
                        if start <= value <= end and (value - start) % step == 0:
                            return True
                elif "-" in part:
                    start, end = map(int, part.split("-", 1))
                    if start <= value <= end:
                        return True
                else:
                    if int(part) == value:
                        return True
            return False

        return (
            _match_field(self.minute, dt.minute, (0, 59))
            and _match_field(self.hour, dt.hour, (0, 23))
            and _match_field(self.day, dt.day, (1, 31))
            and _match_field(self.month, dt.month, (1, 12))
            and _match_field(self.weekday, dt.weekday(), (0, 6))
        )

    def next_run(self, from_dt: Optional[datetime] = None) -> datetime:
        dt = from_dt or datetime.now()
        dt = dt.replace(second=0, microsecond=0) + timedelta(minutes=1)
        for _ in range(60 * 24 * 366):
            if self.matches(dt):
                return dt
            dt += timedelta(minutes=1)
        raise ValueError(f"Cannot find next run time for cron: {self}")

    def __str__(self) -> str:
        return f"{self.minute} {self.hour} {self.day} {self.month} {self.weekday}"


PRESET_SCHEDULES = {
    "hourly": "0 * * * *",
    "daily": "0 0 * * *",
    "daily_midnight": "0 0 * * *",
    "daily_noon": "0 12 * * *",
    "weekly": "0 0 * * 0",
    "monthly": "0 0 1 * *",
    "weekdays": "0 0 * * 1-5",
    "every_15min": "*/15 * * * *",
    "every_30min": "*/30 * * * *",
    "every_6h": "0 */6 * * *",
}


def parse_schedule(schedule: str) -> str:
    if schedule in PRESET_SCHEDULES:
        return PRESET_SCHEDULES[schedule]
    if re.match(r"^\S+\s+\S+\s+\S+\s+\S+\s+\S+$", schedule):
        return schedule
    raise ValueError(
        f"Invalid schedule '{schedule}'. Use preset ({', '.join(PRESET_SCHEDULES.keys())}) "
        f"or 5-field cron expression (minute hour day month weekday)"
    )


class TaskScheduler:
    def __init__(self, db: Database, client: RegistryClient, dry_run: bool = True):
        self.db = db
        self.client = client
        self.dry_run = dry_run
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._task_handlers: Dict[str, Callable] = {
            "cleanup_policy": self._handle_cleanup_policy,
            "sync": self._handle_sync,
            "garbage_collect": self._handle_garbage_collect,
        }

    def register_handler(self, task_type: str, handler: Callable):
        self._task_handlers[task_type] = handler

    def add_task(self, name: str, task_type: str, schedule: str, params: Optional[dict] = None) -> int:
        cron = parse_schedule(schedule)
        return self.db.add_scheduled_task(name, task_type, cron, params)

    def remove_task(self, name: str) -> int:
        return self.db.delete_scheduled_task(name)

    def enable_task(self, name: str) -> int:
        return self.db.toggle_scheduled_task(name, True)

    def disable_task(self, name: str) -> int:
        return self.db.toggle_scheduled_task(name, False)

    def list_tasks(self) -> List[dict]:
        tasks = self.db.list_scheduled_tasks()
        result = []
        for t in tasks:
            task_dict = dict(t)
            if t["cron"]:
                try:
                    cron = CronExpression.parse(t["cron"])
                    task_dict["next_run"] = cron.next_run().isoformat()
                except Exception:
                    task_dict["next_run"] = None
            result.append(task_dict)
        return result

    def run_task_now(self, name: str) -> dict:
        task = self.db.get_scheduled_task(name)
        if not task:
            raise RuntimeError(f"Task '{name}' not found")
        return self._execute_task(dict(task))

    def _execute_task(self, task: dict) -> dict:
        name = task["name"]
        task_type = task["task_type"]
        params = task.get("params_json")
        if isinstance(params, str):
            import json
            params = json.loads(params)

        handler = self._task_handlers.get(task_type)
        if not handler:
            return {"task": name, "status": "error", "error": f"Unknown task type: {task_type}"}

        logger.info(f"Executing scheduled task: {name} (type={task_type})")
        try:
            result = handler(params)
            return {"task": name, "status": "success", "result": result}
        except Exception as e:
            logger.error(f"Scheduled task {name} failed: {e}")
            return {"task": name, "status": "error", "error": str(e)}

    def _handle_cleanup_policy(self, params: dict) -> dict:
        policy_name = params.get("policy")
        if not policy_name:
            raise ValueError("Cleanup policy task requires 'policy' param")
        cleaner = Cleaner(self.client, self.db, dry_run=self.dry_run)
        return cleaner.run_policy(policy_name)

    def _handle_sync(self, params: dict) -> dict:
        from imgctl.query import ImageQuery
        q = ImageQuery(self.client, self.db)
        repo = params.get("repository")
        results = q.sync(repository=repo)
        return {"synced": len(results), "items": results}

    def _handle_garbage_collect(self, params: dict) -> dict:
        purged = self.db.purge_expired_locks()
        return {"purged_expired_locks": purged}

    def _get_due_tasks(self) -> List[dict]:
        tasks = self.db.list_scheduled_tasks()
        due = []
        now = datetime.now()
        for t in tasks:
            if not t["enabled"]:
                continue
            if not t["cron"]:
                continue
            try:
                cron = CronExpression.parse(t["cron"])
                last_run = t["last_run_at"]
                if last_run:
                    last_run_dt = datetime.fromisoformat(last_run)
                    if (now - last_run_dt).total_seconds() < 50:
                        continue
                if cron.matches(now):
                    due.append(dict(t))
            except Exception as e:
                logger.warning(f"Invalid cron for task {t['name']}: {e}")
        return due

    def _run_loop(self):
        logger.info("Scheduler started")
        while not self._stop_event.is_set():
            try:
                due_tasks = self._get_due_tasks()
                for task in due_tasks:
                    if self._stop_event.is_set():
                        break
                    result = self._execute_task(task)
                    last_run = datetime.now().isoformat()
                    try:
                        cron = CronExpression.parse(task["cron"])
                        next_run = cron.next_run().isoformat()
                    except Exception:
                        next_run = None
                    self.db.update_scheduled_task_run(task["name"], last_run, next_run)
                    logger.info(f"Task {task['name']} completed: {result['status']}")
            except Exception as e:
                logger.error(f"Scheduler loop error: {e}")
            self._stop_event.wait(60)
        logger.info("Scheduler stopped")

    def start(self, daemon: bool = True) -> threading.Thread:
        if self._thread and self._thread.is_alive():
            return self._thread
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=daemon, name="imgctl-scheduler")
        self._thread.start()
        return self._thread

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

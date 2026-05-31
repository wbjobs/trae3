import json
import time
import threading
import uuid
from typing import Callable, Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timedelta
from pathlib import Path
from collections import deque

from ..common import get_logger


class ScheduleType(Enum):
    ONCE = "once"
    INTERVAL = "interval"
    CRON = "cron"
    DAILY = "daily"
    HOURLY = "hourly"


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


@dataclass
class InspectionConfig:
    task_id: str
    name: str
    topics: List[str]
    schedule_type: ScheduleType
    schedule_value: str
    checks: List[str] = field(default_factory=lambda: ["health", "lag", "partitions"])
    alert_threshold: Dict[str, Any] = field(default_factory=dict)
    notifications: List[str] = field(default_factory=list)
    enabled: bool = True
    created_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "name": self.name,
            "topics": self.topics,
            "schedule_type": self.schedule_type.value,
            "schedule_value": self.schedule_value,
            "checks": self.checks,
            "alert_threshold": self.alert_threshold,
            "notifications": self.notifications,
            "enabled": self.enabled,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class InspectionResult:
    task_id: str
    run_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    status: TaskStatus = TaskStatus.PENDING
    topic_results: Dict[str, Any] = field(default_factory=dict)
    issues: List[Dict[str, Any]] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "run_id": self.run_id,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "status": self.status.value,
            "topic_results": self.topic_results,
            "issues": self.issues,
            "summary": self.summary,
            "error": self.error,
        }


@dataclass
class ScheduledTask:
    task_id: str
    name: str
    func: Callable
    schedule_type: ScheduleType
    schedule_value: str
    args: tuple = ()
    kwargs: Dict[str, Any] = field(default_factory=dict)
    next_run: Optional[datetime] = None
    last_run: Optional[datetime] = None
    status: TaskStatus = TaskStatus.PENDING
    run_count: int = 0
    error_count: int = 0
    enabled: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "name": self.name,
            "schedule_type": self.schedule_type.value,
            "schedule_value": self.schedule_value,
            "next_run": self.next_run.isoformat() if self.next_run else None,
            "last_run": self.last_run.isoformat() if self.last_run else None,
            "status": self.status.value,
            "run_count": self.run_count,
            "error_count": self.error_count,
            "enabled": self.enabled,
        }


class TaskScheduler:
    def __init__(self, data_dir: str = "./scheduler_data"):
        self.logger = get_logger("TaskScheduler")
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        self._tasks: Dict[str, ScheduledTask] = {}
        self._inspection_configs: Dict[str, InspectionConfig] = {}
        self._inspection_history: deque = deque(maxlen=1000)
        self._running = False
        self._scheduler_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._task_lock: Dict[str, threading.Lock] = {}
        
        self._load_data()

    def _load_data(self):
        config_file = self.data_dir / "inspection_configs.json"
        if config_file.exists():
            with open(config_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for task_id, cfg in data.items():
                    self._inspection_configs[task_id] = InspectionConfig(
                        task_id=cfg["task_id"],
                        name=cfg["name"],
                        topics=cfg["topics"],
                        schedule_type=ScheduleType(cfg["schedule_type"]),
                        schedule_value=cfg["schedule_value"],
                        checks=cfg.get("checks", ["health"]),
                        alert_threshold=cfg.get("alert_threshold", {}),
                        notifications=cfg.get("notifications", []),
                        enabled=cfg.get("enabled", True),
                        created_at=datetime.fromisoformat(cfg["created_at"]),
                    )

        history_file = self.data_dir / "inspection_history.json"
        if history_file.exists():
            with open(history_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for item in data:
                    self._inspection_history.append(InspectionResult(
                        task_id=item["task_id"],
                        run_id=item["run_id"],
                        start_time=datetime.fromisoformat(item["start_time"]),
                        end_time=datetime.fromisoformat(item["end_time"]) if item.get("end_time") else None,
                        status=TaskStatus(item["status"]),
                        topic_results=item.get("topic_results", {}),
                        issues=item.get("issues", []),
                        summary=item.get("summary", {}),
                        error=item.get("error"),
                    ))

    def _save_data(self):
        config_file = self.data_dir / "inspection_configs.json"
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(
                {tid: cfg.to_dict() for tid, cfg in self._inspection_configs.items()},
                f, indent=2
            )

        history_file = self.data_dir / "inspection_history.json"
        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump([r.to_dict() for r in self._inspection_history], f, indent=2)

    def _calculate_next_run(self, schedule_type: ScheduleType, schedule_value: str, 
                           base_time: Optional[datetime] = None) -> datetime:
        now = base_time or datetime.now()
        
        if schedule_type == ScheduleType.ONCE:
            return datetime.fromisoformat(schedule_value)
        
        elif schedule_type == ScheduleType.INTERVAL:
            seconds = int(schedule_value)
            return now + timedelta(seconds=seconds)
        
        elif schedule_type == ScheduleType.HOURLY:
            minute = int(schedule_value) if schedule_value else 0
            next_hour = now.replace(minute=minute, second=0, microsecond=0)
            if next_hour <= now:
                next_hour += timedelta(hours=1)
            return next_hour
        
        elif schedule_type == ScheduleType.DAILY:
            hour, minute = map(int, schedule_value.split(':'))
            next_day = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_day <= now:
                next_day += timedelta(days=1)
            return next_day
        
        elif schedule_type == ScheduleType.CRON:
            return self._parse_cron(schedule_value, now)
        
        return now + timedelta(hours=1)

    def _parse_cron(self, cron_expr: str, now: datetime) -> datetime:
        parts = cron_expr.split()
        if len(parts) != 5:
            raise ValueError(f"Invalid cron expression: {cron_expr}")
        
        minute, hour, day, month, weekday = parts
        
        next_time = now.replace(second=0, microsecond=0) + timedelta(minutes=1)
        
        for _ in range(525600):
            if (self._cron_match(minute, next_time.minute) and
                self._cron_match(hour, next_time.hour) and
                self._cron_match(day, next_time.day) and
                self._cron_match(month, next_time.month) and
                self._cron_match(weekday, next_time.weekday())):
                return next_time
            next_time += timedelta(minutes=1)
        
        raise ValueError(f"Could not find next run for cron: {cron_expr}")

    def _cron_match(self, pattern: str, value: int) -> bool:
        if pattern == '*':
            return True
        if ',' in pattern:
            return any(self._cron_match(p.strip(), value) for p in pattern.split(','))
        if '-' in pattern:
            start, end = map(int, pattern.split('-'))
            return start <= value <= end
        if pattern.startswith('*/'):
            step = int(pattern[2:])
            return value % step == 0
        return int(pattern) == value

    def add_task(self, name: str, func: Callable, schedule_type: ScheduleType, 
                 schedule_value: str, *args, **kwargs) -> str:
        task_id = str(uuid.uuid4())[:8]
        
        task = ScheduledTask(
            task_id=task_id,
            name=name,
            func=func,
            schedule_type=schedule_type,
            schedule_value=schedule_value,
            args=args,
            kwargs=kwargs,
            next_run=self._calculate_next_run(schedule_type, schedule_value),
        )
        
        with self._lock:
            self._tasks[task_id] = task
            self._task_lock[task_id] = threading.Lock()
        
        self.logger.info(f"Added scheduled task: {name} ({task_id})")
        return task_id

    def remove_task(self, task_id: str) -> bool:
        with self._lock:
            if task_id in self._tasks:
                del self._tasks[task_id]
                self._task_lock.pop(task_id, None)
                self.logger.info(f"Removed task: {task_id}")
                return True
        return False

    def pause_task(self, task_id: str) -> bool:
        with self._lock:
            if task_id in self._tasks:
                self._tasks[task_id].status = TaskStatus.PAUSED
                self.logger.info(f"Paused task: {task_id}")
                return True
        return False

    def resume_task(self, task_id: str) -> bool:
        with self._lock:
            if task_id in self._tasks:
                task = self._tasks[task_id]
                task.status = TaskStatus.PENDING
                task.next_run = self._calculate_next_run(
                    task.schedule_type, task.schedule_value
                )
                self.logger.info(f"Resumed task: {task_id}")
                return True
        return False

    def add_inspection(self, name: str, topics: List[str], schedule_type: ScheduleType,
                       schedule_value: str, checks: Optional[List[str]] = None,
                       alert_threshold: Optional[Dict[str, Any]] = None) -> str:
        task_id = str(uuid.uuid4())[:8]
        
        config = InspectionConfig(
            task_id=task_id,
            name=name,
            topics=topics,
            schedule_type=schedule_type,
            schedule_value=schedule_value,
            checks=checks or ["health", "lag", "partitions"],
            alert_threshold=alert_threshold or {"max_lag": 1000, "min_partitions": 1},
        )
        
        self._inspection_configs[task_id] = config
        self._save_data()
        self.logger.info(f"Added inspection task: {name} ({task_id})")
        return task_id

    def remove_inspection(self, task_id: str) -> bool:
        if task_id in self._inspection_configs:
            del self._inspection_configs[task_id]
            self._save_data()
            self.logger.info(f"Removed inspection: {task_id}")
            return True
        return False

    def enable_inspection(self, task_id: str) -> bool:
        if task_id in self._inspection_configs:
            self._inspection_configs[task_id].enabled = True
            self._save_data()
            return True
        return False

    def disable_inspection(self, task_id: str) -> bool:
        if task_id in self._inspection_configs:
            self._inspection_configs[task_id].enabled = False
            self._save_data()
            return True
        return False

    def run_inspection(self, task_id: str, inspector_func: Callable) -> InspectionResult:
        config = self._inspection_configs.get(task_id)
        if not config:
            raise ValueError(f"Inspection task not found: {task_id}")
        
        run_id = str(uuid.uuid4())[:8]
        result = InspectionResult(
            task_id=task_id,
            run_id=run_id,
            start_time=datetime.now(),
            status=TaskStatus.RUNNING,
        )
        
        self.logger.info(f"Running inspection {config.name} ({run_id})")
        
        try:
            for topic in config.topics:
                topic_result = inspector_func(topic, config.checks)
                result.topic_results[topic] = topic_result
                
                issues = self._check_alert_thresholds(topic, topic_result, config.alert_threshold)
                result.issues.extend(issues)
            
            result.status = TaskStatus.COMPLETED
            result.summary = {
                "total_topics": len(config.topics),
                "topics_with_issues": len(set(i["topic"] for i in result.issues)),
                "total_issues": len(result.issues),
            }
            
        except Exception as e:
            self.logger.error(f"Inspection failed: {e}")
            result.status = TaskStatus.FAILED
            result.error = str(e)
        
        result.end_time = datetime.now()
        self._inspection_history.append(result)
        self._save_data()
        
        return result

    def _check_alert_thresholds(self, topic: str, result: Dict[str, Any], 
                                thresholds: Dict[str, Any]) -> List[Dict[str, Any]]:
        issues = []
        
        if "max_lag" in thresholds and result.get("lag", 0) > thresholds["max_lag"]:
            issues.append({
                "topic": topic,
                "type": "high_lag",
                "severity": "warning",
                "message": f"Lag {result['lag']} exceeds threshold {thresholds['max_lag']}",
                "value": result.get("lag"),
                "threshold": thresholds["max_lag"],
            })
        
        if "min_messages" in thresholds and result.get("message_count", 0) < thresholds["min_messages"]:
            issues.append({
                "topic": topic,
                "type": "low_message_count",
                "severity": "warning",
                "message": f"Message count {result['message_count']} below threshold {thresholds['min_messages']}",
                "value": result.get("message_count"),
                "threshold": thresholds["min_messages"],
            })
        
        if result.get("health_status") == "critical":
            issues.append({
                "topic": topic,
                "type": "health_critical",
                "severity": "critical",
                "message": "Topic health is critical",
            })
        
        return issues

    def start(self):
        if self._running:
            return
        
        self._running = True
        self._scheduler_thread = threading.Thread(target=self._run_loop, daemon=True)
        self._scheduler_thread.start()
        self.logger.info("Task scheduler started")

    def stop(self):
        self._running = False
        if self._scheduler_thread:
            self._scheduler_thread.join(timeout=5.0)
        self.logger.info("Task scheduler stopped")

    def _run_loop(self):
        while self._running:
            try:
                now = datetime.now()
                tasks_to_run = []
                
                with self._lock:
                    for task_id, task in self._tasks.items():
                        if not task.enabled or task.status == TaskStatus.PAUSED:
                            continue
                        if task.next_run and task.next_run <= now:
                            tasks_to_run.append(task_id)
                
                for task_id in tasks_to_run:
                    self._execute_task(task_id)
                
                time.sleep(1.0)
                
            except Exception as e:
                self.logger.error(f"Scheduler loop error: {e}")
                time.sleep(1.0)

    def _execute_task(self, task_id: str):
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return
            task_lock = self._task_lock.get(task_id)
        
        if not task_lock:
            return
        
        with task_lock:
            if task.status != TaskStatus.PENDING:
                return
            
            task.status = TaskStatus.RUNNING
            task.last_run = datetime.now()
            
            try:
                task.func(*task.args, **task.kwargs)
                task.status = TaskStatus.COMPLETED
                task.run_count += 1
            except Exception as e:
                self.logger.error(f"Task {task.name} failed: {e}")
                task.status = TaskStatus.FAILED
                task.error_count += 1
            
            if task.schedule_type != ScheduleType.ONCE:
                task.status = TaskStatus.PENDING
                task.next_run = self._calculate_next_run(
                    task.schedule_type, task.schedule_value
                )
            else:
                task.enabled = False

    def list_tasks(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [t.to_dict() for t in self._tasks.values()]

    def list_inspections(self) -> List[Dict[str, Any]]:
        return [cfg.to_dict() for cfg in self._inspection_configs.values()]

    def get_inspection_history(self, task_id: Optional[str] = None, 
                               limit: int = 100) -> List[Dict[str, Any]]:
        history = list(self._inspection_history)
        if task_id:
            history = [h for h in history if h.task_id == task_id]
        return [h.to_dict() for h in history[-limit:]]

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            task = self._tasks.get(task_id)
            return task.to_dict() if task else None

import time
import re
import json
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple
from configtool.utils import get_logger, deep_diff, load_yaml, save_yaml, ConfigToolError

logger = get_logger("scheduler")

class ScheduleType(Enum):
    INTERVAL = "interval"
    CRON = "cron"
    ONCE = "once"

class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class AlertType(Enum):
    LOG = "log"
    HTTP = "http"
    EMAIL = "email"
    WEBHOOK = "webhook"

class ComparisonType(Enum):
    FILES = "files"
    CONFIGS = "configs"
    VERSION = "version"

@dataclass
class AlertConfig:
    alert_type: AlertType = AlertType.LOG
    enabled: bool = True
    parameters: Dict[str, Any] = field(default_factory=dict)

@dataclass
class DiffAlertConfig(AlertConfig):
    alert_on_added: bool = True
    alert_on_removed: bool = True
    alert_on_modified: bool = True
    alert_on_type_changed: bool = True
    min_diff_count: int = 1
    ignore_keys: List[str] = field(default_factory=list)
    alert_channels: List[str] = field(default_factory=lambda: ["log"])

@dataclass
class ScheduleTaskResult:
    task_id: str
    run_time: datetime
    success: bool
    status: TaskStatus
    output: Dict[str, Any] = field(default_factory=dict)
    error: str = ""
    duration_seconds: float = 0.0
    diff_count: int = 0
    alerts_triggered: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "run_time": self.run_time.isoformat(),
            "success": self.success,
            "status": self.status.value,
            "output": self.output,
            "error": self.error,
            "duration_seconds": self.duration_seconds,
            "diff_count": self.diff_count,
            "alerts_triggered": self.alerts_triggered,
        }

@dataclass
class ScheduleTask:
    task_id: str
    name: str
    schedule_type: ScheduleType
    comparison_type: ComparisonType
    parameters: Dict[str, Any] = field(default_factory=dict)
    interval_seconds: int = 3600
    cron_expression: str = ""
    run_once_at: Optional[datetime] = None
    enabled: bool = True
    alert_config: Optional[DiffAlertConfig] = None
    created_at: datetime = field(default_factory=datetime.now)
    next_run: Optional[datetime] = None
    last_run: Optional[datetime] = None
    last_result: Optional[ScheduleTaskResult] = None
    status: TaskStatus = TaskStatus.PENDING
    run_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    tags: List[str] = field(default_factory=list)
    timeout: int = 300
    max_retries: int = 0

    def should_run(self, now: datetime = None) -> bool:
        if not self.enabled or self.status == TaskStatus.CANCELLED:
            return False

        now = now or datetime.now()

        if self.schedule_type == ScheduleType.ONCE:
            return self.run_once_at is not None and now >= self.run_once_at and self.run_count == 0
        elif self.schedule_type == ScheduleType.INTERVAL:
            if self.next_run is None:
                return True
            return now >= self.next_run
        elif self.schedule_type == ScheduleType.CRON:
            if self.next_run is None:
                return True
            return now >= self.next_run
        return False

    def calculate_next_run(self, now: datetime = None) -> Optional[datetime]:
        now = now or datetime.now()

        if self.schedule_type == ScheduleType.ONCE:
            if self.run_count == 0:
                return self.run_once_at
            return None
        elif self.schedule_type == ScheduleType.INTERVAL:
            if self.next_run is None:
                return now + timedelta(seconds=self.interval_seconds)
            return self.next_run + timedelta(seconds=self.interval_seconds)
        elif self.schedule_type == ScheduleType.CRON:
            return parse_cron(self.cron_expression, now)
        return None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "name": self.name,
            "schedule_type": self.schedule_type.value,
            "comparison_type": self.comparison_type.value,
            "parameters": self.parameters,
            "interval_seconds": self.interval_seconds,
            "cron_expression": self.cron_expression,
            "run_once_at": self.run_once_at.isoformat() if self.run_once_at else None,
            "enabled": self.enabled,
            "created_at": self.created_at.isoformat(),
            "next_run": self.next_run.isoformat() if self.next_run else None,
            "last_run": self.last_run.isoformat() if self.last_run else None,
            "last_result": self.last_result.to_dict() if self.last_result else None,
            "status": self.status.value,
            "run_count": self.run_count,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "tags": self.tags,
            "timeout": self.timeout,
            "max_retries": self.max_retries,
        }

_MINUTE_VALUES = set(range(0, 60))
_HOUR_VALUES = set(range(0, 24))
_DAY_VALUES = set(range(1, 32))
_MONTH_VALUES = set(range(1, 13))
_WEEKDAY_VALUES = set(range(0, 7))

def _parse_cron_field(field: str, min_val: int, max_val: int) -> List[int]:
    if field == "*":
        return list(range(min_val, max_val + 1))

    values = set()
    for part in field.split(","):
        if "/" in part:
            base, step = part.split("/", 1)
            step = int(step)
            if base == "*":
                for v in range(min_val, max_val + 1, step):
                    values.add(v)
            else:
                if "-" in base:
                    start, end = map(int, base.split("-", 1))
                    for v in range(start, end + 1, step):
                        values.add(v)
                else:
                    start = int(base)
                    for v in range(start, max_val + 1, step):
                        values.add(v)
        elif "-" in part:
            start, end = map(int, part.split("-", 1))
            for v in range(start, end + 1):
                values.add(v)
        else:
            values.add(int(part))

    valid_values = [v for v in sorted(values) if min_val <= v <= max_val]
    return valid_values

def parse_cron(expression: str, now: datetime = None) -> Optional[datetime]:
    if not expression:
        return None

    now = now or datetime.now()
    parts = expression.strip().split()
    if len(parts) != 5:
        raise ValueError(f"无效的Cron表达式（需要5个字段）: {expression}")

    minute_field, hour_field, day_field, month_field, weekday_field = parts

    try:
        minutes = _parse_cron_field(minute_field, 0, 59)
        hours = _parse_cron_field(hour_field, 0, 23)
        days = _parse_cron_field(day_field, 1, 31)
        months = _parse_cron_field(month_field, 1, 12)
        weekdays = _parse_cron_field(weekday_field, 0, 6)
    except ValueError as e:
        raise ValueError(f"解析Cron表达式失败: {expression}, 错误: {e}")

    candidate = now.replace(second=0, microsecond=0) + timedelta(minutes=1)

    for _ in range(366 * 24 * 60):
        if candidate.month in months and candidate.day in days and candidate.weekday() in weekdays:
            if candidate.hour in hours and candidate.minute in minutes:
                return candidate
        candidate += timedelta(minutes=1)

    return None

class Scheduler:
    def __init__(self, tick_interval: int = 1, state_file: str = "schedule_state.yaml"):
        self.tick_interval = tick_interval
        self.state_file = state_file
        self._tasks: Dict[str, ScheduleTask] = {}
        self._results: List[ScheduleTaskResult] = []
        self._stop_event = threading.Event()
        self._lock = threading.RLock()
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._task_handlers: Dict[ComparisonType, Callable[[ScheduleTask], ScheduleTaskResult]] = {}
        self._alert_handlers: Dict[AlertType, Callable[[ScheduleTask, DiffAlertConfig, ScheduleTaskResult], bool]] = {}
        self._register_default_handlers()

    def _register_default_handlers(self):
        self._task_handlers[ComparisonType.FILES] = self._handle_files_comparison
        self._task_handlers[ComparisonType.CONFIGS] = self._handle_configs_comparison
        self._task_handlers[ComparisonType.VERSION] = self._handle_version_comparison

        self._alert_handlers[AlertType.LOG] = self._handle_log_alert
        self._alert_handlers[AlertType.HTTP] = self._handle_http_alert
        self._alert_handlers[AlertType.WEBHOOK] = self._handle_webhook_alert

    def add_task(self, task: ScheduleTask) -> ScheduleTask:
        with self._lock:
            if task.task_id in self._tasks:
                raise ConfigToolError(f"任务ID已存在: {task.task_id}")

            if task.next_run is None:
                task.next_run = task.calculate_next_run()

            self._tasks[task.task_id] = task
            logger.info(f"已添加定时任务: {task.name} ({task.task_id})")
            return task

    def remove_task(self, task_id: str) -> bool:
        with self._lock:
            if task_id in self._tasks:
                del self._tasks[task_id]
                logger.info(f"已移除定时任务: {task_id}")
                return True
            return False

    def get_task(self, task_id: str) -> Optional[ScheduleTask]:
        with self._lock:
            return self._tasks.get(task_id)

    def list_tasks(self, include_disabled: bool = False) -> List[ScheduleTask]:
        with self._lock:
            tasks = list(self._tasks.values())
            if not include_disabled:
                tasks = [t for t in tasks if t.enabled]
            return sorted(tasks, key=lambda t: t.next_run or datetime.max)

    def enable_task(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.enabled = True
                task.status = TaskStatus.PENDING
                task.next_run = task.calculate_next_run()
                logger.info(f"已启用任务: {task_id}")
                return True
            return False

    def disable_task(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.enabled = False
                task.status = TaskStatus.CANCELLED
                logger.info(f"已禁用任务: {task_id}")
                return True
            return False

    def run_task_now(self, task_id: str) -> Optional[ScheduleTaskResult]:
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None

            task.status = TaskStatus.RUNNING
            return self._execute_task(task)

    def _execute_task(self, task: ScheduleTask) -> ScheduleTaskResult:
        start_time = time.time()
        handler = self._task_handlers.get(task.comparison_type)

        if not handler:
            result = ScheduleTaskResult(
                task_id=task.task_id,
                run_time=datetime.now(),
                success=False,
                status=TaskStatus.FAILED,
                error=f"未知的比较类型: {task.comparison_type}",
                duration_seconds=time.time() - start_time,
            )
            self._update_task_stats(task, result)
            return result

        try:
            result = handler(task)
            result.duration_seconds = time.time() - start_time

            if task.alert_config and task.alert_config.enabled and result.diff_count >= task.alert_config.min_diff_count:
                self._trigger_alerts(task, task.alert_config, result)

            self._update_task_stats(task, result)
            return result

        except Exception as e:
            logger.error(f"执行定时任务失败: {task.name}, 错误: {e}")
            result = ScheduleTaskResult(
                task_id=task.task_id,
                run_time=datetime.now(),
                success=False,
                status=TaskStatus.FAILED,
                error=str(e),
                duration_seconds=time.time() - start_time,
            )
            self._update_task_stats(task, result)
            return result

    def _update_task_stats(self, task: ScheduleTask, result: ScheduleTaskResult) -> None:
        task.last_run = result.run_time
        task.last_result = result
        task.run_count += 1
        task.status = result.status
        task.next_run = task.calculate_next_run()

        if result.success:
            task.success_count += 1
        else:
            task.failure_count += 1

        self._results.append(result)

    def _handle_files_comparison(self, task: ScheduleTask) -> ScheduleTaskResult:
        from configtool.config_diff import ConfigComparator

        source_file = task.parameters.get("source_file")
        target_file = task.parameters.get("target_file")
        ignore_keys = task.parameters.get("ignore_keys", [])

        if not source_file or not target_file:
            return ScheduleTaskResult(
                task_id=task.task_id,
                run_time=datetime.now(),
                success=False,
                status=TaskStatus.FAILED,
                error="缺少必要参数: source_file 或 target_file",
            )

        comparator = ConfigComparator(ignore_keys=ignore_keys)
        diff_result = comparator.compare_files(source_file, target_file)

        return ScheduleTaskResult(
            task_id=task.task_id,
            run_time=datetime.now(),
            success=True,
            status=TaskStatus.COMPLETED,
            output=diff_result.to_dict(),
            diff_count=diff_result.total_diffs,
        )

    def _handle_configs_comparison(self, task: ScheduleTask) -> ScheduleTaskResult:
        from configtool.config_diff import ConfigComparator

        env1 = task.parameters.get("env1")
        env2 = task.parameters.get("env2")
        namespace = task.parameters.get("namespace", "application")
        center_type = task.parameters.get("center_type", "apollo")
        ignore_keys = task.parameters.get("ignore_keys", [])

        if not env1 or not env2:
            return ScheduleTaskResult(
                task_id=task.task_id,
                run_time=datetime.now(),
                success=False,
                status=TaskStatus.FAILED,
                error="缺少必要参数: env1 或 env2",
            )

        comparator = ConfigComparator(ignore_keys=ignore_keys)
        diff_result = comparator.compare_env(env1, env2, namespace, center_type)

        return ScheduleTaskResult(
            task_id=task.task_id,
            run_time=datetime.now(),
            success=True,
            status=TaskStatus.COMPLETED,
            output=diff_result.to_dict(),
            diff_count=diff_result.total_diffs,
        )

    def _handle_version_comparison(self, task: ScheduleTask) -> ScheduleTaskResult:
        from configtool.config_diff import ConfigComparator
        from configtool.config_center import get_config_center
        from configtool.utils import load_yaml

        app_id = task.parameters.get("app_id")
        namespace = task.parameters.get("namespace", "application")
        version = task.parameters.get("version")
        center_type = task.parameters.get("center_type", "apollo")
        current_file = task.parameters.get("current_file")
        ignore_keys = task.parameters.get("ignore_keys", [])

        if not app_id or not version:
            return ScheduleTaskResult(
                task_id=task.task_id,
                run_time=datetime.now(),
                success=False,
                status=TaskStatus.FAILED,
                error="缺少必要参数: app_id 或 version",
            )

        if current_file:
            current_config = load_yaml(current_file)
        else:
            center = get_config_center(center_type)
            current_config = center.get_all_configs(namespace)

        comparator = ConfigComparator(ignore_keys=ignore_keys)
        diff_result = comparator.compare_with_version(
            current_config=current_config,
            version=version,
            app_id=app_id,
            namespace=namespace,
        )

        return ScheduleTaskResult(
            task_id=task.task_id,
            run_time=datetime.now(),
            success=True,
            status=TaskStatus.COMPLETED,
            output=diff_result.to_dict(),
            diff_count=diff_result.total_diffs,
        )

    def _trigger_alerts(self, task: ScheduleTask, alert_config: DiffAlertConfig, result: ScheduleTaskResult) -> None:
        diff_data = result.output.get("diffs", [])

        should_alert = False
        for diff in diff_data:
            change_type = diff.get("change_type")
            if change_type == "added" and alert_config.alert_on_added:
                should_alert = True
                break
            if change_type == "removed" and alert_config.alert_on_removed:
                should_alert = True
                break
            if change_type == "modified" and alert_config.alert_on_modified:
                should_alert = True
                break
            if change_type == "type_changed" and alert_config.alert_on_type_changed:
                should_alert = True
                break

        if not should_alert:
            return

        for channel in alert_config.alert_channels:
            try:
                alert_type = AlertType(channel)
                handler = self._alert_handlers.get(alert_type)
                if handler:
                    handler(task, alert_config, result)
                    result.alerts_triggered.append(channel)
            except Exception as e:
                logger.error(f"触发告警失败: {channel}, 错误: {e}")

    def _handle_log_alert(self, task: ScheduleTask, config: DiffAlertConfig, result: ScheduleTaskResult) -> bool:
        logger.warning(
            f"[ALERT] 定时比对发现差异: {task.name}, "
            f"差异数: {result.diff_count}, "
            f"新增: {result.output.get('added_count', 0)}, "
            f"删除: {result.output.get('removed_count', 0)}, "
            f"修改: {result.output.get('modified_count', 0)}, "
            f"类型变更: {result.output.get('type_changed_count', 0)}"
        )
        return True

    def _handle_http_alert(self, task: ScheduleTask, config: DiffAlertConfig, result: ScheduleTaskResult) -> bool:
        from configtool.remote import RemoteClient

        url = config.parameters.get("url")
        if not url:
            logger.warning("HTTP告警缺少URL参数")
            return False

        client = RemoteClient()
        try:
            payload = {
                "task_id": task.task_id,
                "task_name": task.name,
                "diff_count": result.diff_count,
                "diffs": result.output.get("diffs", []),
                "run_time": result.run_time.isoformat(),
                "level": "warning",
            }
            response = client.post(url, json_data=payload, timeout=10)
            return response.success
        except Exception as e:
            logger.error(f"HTTP告警发送失败: {e}")
            return False
        finally:
            client.close()

    def _handle_webhook_alert(self, task: ScheduleTask, config: DiffAlertConfig, result: ScheduleTaskResult) -> bool:
        return self._handle_http_alert(task, config, result)

    def start(self) -> None:
        if self._running:
            return

        self._running = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("调度器已启动")

    def stop(self) -> None:
        if not self._running:
            return

        self._running = False
        self._stop_event.set()

        if self._thread:
            self._thread.join(timeout=5)

        self._save_state()
        logger.info("调度器已停止")

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception as e:
                logger.error(f"调度器Tick异常: {e}")

            self._stop_event.wait(self.tick_interval)

    def _tick(self) -> None:
        now = datetime.now()
        tasks_to_run = []

        with self._lock:
            for task in self._tasks.values():
                if task.should_run(now):
                    tasks_to_run.append(task)

        for task in tasks_to_run:
            with self._lock:
                task.status = TaskStatus.RUNNING

            result = self._execute_task(task)
            logger.debug(
                f"任务执行完成: {task.name}, "
                f"状态: {result.status.value}, "
                f"耗时: {result.duration_seconds:.2f}s, "
                f"差异: {result.diff_count}"
            )

    def _save_state(self) -> None:
        try:
            state = {
                "tasks": [t.to_dict() for t in self._tasks.values()],
                "saved_at": datetime.now().isoformat(),
            }
            save_yaml(state, self.state_file)
            logger.debug(f"调度器状态已保存: {self.state_file}")
        except Exception as e:
            logger.warning(f"保存调度器状态失败: {e}")

    def load_state(self) -> None:
        try:
            state = load_yaml(self.state_file)
            logger.debug(f"已加载调度器状态: {self.state_file}")
        except Exception as e:
            logger.debug(f"加载调度器状态失败: {e}")

    def get_results(self, task_id: str = None, limit: int = 100) -> List[ScheduleTaskResult]:
        with self._lock:
            results = list(self._results)
            if task_id:
                results = [r for r in results if r.task_id == task_id]
            return results[-limit:]

    def format_task_list(self, tasks: List[ScheduleTask], output_format: str = "text") -> str:
        if output_format == "json":
            return json.dumps([t.to_dict() for t in tasks], ensure_ascii=False, indent=2)
        elif output_format == "table":
            from tabulate import tabulate
            table_data = []
            headers = ["任务ID", "名称", "类型", "状态", "下次运行", "上次结果", "运行次数"]
            for t in tasks:
                next_run = t.next_run.strftime("%Y-%m-%d %H:%M:%S") if t.next_run else "-"
                last_result = t.last_result.status.value if t.last_result else "-"
                table_data.append([
                    t.task_id[:16],
                    t.name,
                    t.schedule_type.value,
                    "启用" if t.enabled else "禁用",
                    next_run,
                    last_result,
                    f"{t.success_count}/{t.run_count}",
                ])
            return tabulate(table_data, headers=headers, tablefmt="grid")
        else:
            lines = []
            for t in tasks:
                lines.append(f"[{t.task_id}] {t.name}")
                lines.append(f"  类型: {t.schedule_type.value}, 状态: {'启用' if t.enabled else '禁用'}")
                if t.schedule_type == ScheduleType.INTERVAL:
                    lines.append(f"  间隔: {t.interval_seconds}秒")
                elif t.schedule_type == ScheduleType.CRON:
                    lines.append(f"  Cron: {t.cron_expression}")
                if t.next_run:
                    lines.append(f"  下次运行: {t.next_run.strftime('%Y-%m-%d %H:%M:%S')}")
                if t.last_run:
                    lines.append(f"  上次运行: {t.last_run.strftime('%Y-%m-%d %H:%M:%S')}")
                lines.append(f"  运行统计: 成功{t.success_count}/总共{t.run_count}/失败{t.failure_count}")
                lines.append("")
            return "\n".join(lines)

    def __enter__(self) -> "Scheduler":
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.stop()

def create_scheduler(tick_interval: int = 1, state_file: str = "schedule_state.yaml") -> Scheduler:
    return Scheduler(tick_interval=tick_interval, state_file=state_file)

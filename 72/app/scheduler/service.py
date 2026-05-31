import asyncio
import uuid
import heapq
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, field

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from pytz import timezone

from app.config import settings
from app.database import get_db
from app.scheduler.models import ScheduledTask


@dataclass(order=True)
class PriorityTask:
    priority: int
    scheduled_time: float
    task_id: str = field(compare=False)
    tenant_id: str = field(compare=False)
    task_name: str = field(compare=False)
    task_type: str = field(compare=False)
    payload: Dict[str, Any] = field(compare=False)
    callback: Optional[Callable] = field(compare=False, default=None)


class SchedulerService:
    def __init__(self):
        self._scheduler = AsyncIOScheduler(
            timezone=timezone(settings.SCHEDULER_TIMEZONE)
        )
        self._priority_queue: List[PriorityTask] = []
        self._lock = asyncio.Lock()
        self._running = False
        self._worker_task: Optional[asyncio.Task] = None
        self._task_handlers: Dict[str, Callable] = {}

    def register_handler(self, task_type: str, handler: Callable):
        self._task_handlers[task_type] = handler

    def start(self):
        if not self._running:
            self._running = True
            self._scheduler.start()
            self._worker_task = asyncio.create_task(self._priority_worker())
            self._load_pending_tasks()

    def shutdown(self):
        self._running = False
        if self._scheduler.running:
            self._scheduler.shutdown()
        if self._worker_task:
            self._worker_task.cancel()

    def _load_pending_tasks(self):
        db = next(get_db())
        try:
            pending_tasks = db.query(ScheduledTask).filter(
                ScheduledTask.is_enabled == True,
                ScheduledTask.status.in_(["pending", "scheduled"])
            ).all()

            for task in pending_tasks:
                if task.cron_expression:
                    self._add_cron_task(task)
                elif task.run_once_at:
                    self._add_once_task(task)
        finally:
            db.close()

    def _add_cron_task(self, task: ScheduledTask):
        try:
            trigger = CronTrigger.from_crontab(task.cron_expression)
            self._scheduler.add_job(
                self._execute_task,
                trigger=trigger,
                id=task.id,
                args=[task.id],
                misfire_grace_time=3600,
                coalesce=True
            )
        except Exception as e:
            pass

    def _add_once_task(self, task: ScheduledTask):
        try:
            if task.run_once_at > datetime.now(timezone(settings.SCHEDULER_TIMEZONE)):
                trigger = DateTrigger(run_date=task.run_once_at)
                self._scheduler.add_job(
                    self._execute_task,
                    trigger=trigger,
                    id=task.id,
                    args=[task.id],
                    misfire_grace_time=3600
                )
        except Exception as e:
            pass

    async def schedule_task(
        self,
        tenant_id: str,
        task_name: str,
        task_type: str,
        payload: Dict[str, Any],
        priority: int = 0,
        cron_expression: Optional[str] = None,
        run_once_at: Optional[datetime] = None,
        callback_url: Optional[str] = None
    ) -> str:
        task_id = str(uuid.uuid4())

        db = next(get_db())
        try:
            task = ScheduledTask(
                id=task_id,
                tenant_id=tenant_id,
                task_name=task_name,
                task_type=task_type,
                priority=priority,
                cron_expression=cron_expression,
                run_once_at=run_once_at,
                payload=payload,
                callback_url=callback_url,
                status="scheduled"
            )
            db.add(task)
            db.commit()

            if cron_expression:
                self._add_cron_task(task)
            elif run_once_at:
                self._add_once_task(task)
            else:
                await self._add_to_priority_queue(task)

            return task_id
        finally:
            db.close()

    async def _add_to_priority_queue(self, task: ScheduledTask):
        async with self._lock:
            priority_task = PriorityTask(
                priority=-task.priority,
                scheduled_time=datetime.now().timestamp(),
                task_id=task.id,
                tenant_id=task.tenant_id,
                task_name=task.task_name,
                task_type=task.task_type,
                payload=task.payload or {}
            )
            heapq.heappush(self._priority_queue, priority_task)

    async def _priority_worker(self):
        while self._running:
            try:
                async with self._lock:
                    if self._priority_queue:
                        priority_task = heapq.heappop(self._priority_queue)
                        await self._execute_priority_task(priority_task)
                    else:
                        await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                break
            except Exception as e:
                await asyncio.sleep(1)

    async def _execute_priority_task(self, priority_task: PriorityTask):
        db = next(get_db())
        try:
            task = db.query(ScheduledTask).filter(ScheduledTask.id == priority_task.task_id).first()
            if task:
                task.status = "running"
                task.last_run_at = datetime.now(timezone(settings.SCHEDULER_TIMEZONE))
                db.commit()

                handler = self._task_handlers.get(task.task_type)
                if handler:
                    try:
                        await handler(task.payload)
                        task.status = "completed"
                        task.run_count = (task.run_count or 0) + 1
                    except Exception as e:
                        task.status = "failed"
                        task.error_message = str(e)
                        if task.retry_count < task.max_retries:
                            task.retry_count += 1
                            task.status = "retrying"
                            await self._add_to_priority_queue(task)

                db.commit()
        finally:
            db.close()

    async def _execute_task(self, task_id: str):
        db = next(get_db())
        try:
            task = db.query(ScheduledTask).filter(ScheduledTask.id == task_id).first()
            if task and task.is_enabled:
                await self._add_to_priority_queue(task)
        finally:
            db.close()

    async def cancel_task(self, task_id: str, tenant_id: str) -> bool:
        db = next(get_db())
        try:
            task = db.query(ScheduledTask).filter(
                ScheduledTask.id == task_id,
                ScheduledTask.tenant_id == tenant_id
            ).first()

            if task:
                task.is_enabled = False
                task.status = "cancelled"
                db.commit()

                try:
                    self._scheduler.remove_job(task_id)
                except Exception:
                    pass

                return True
            return False
        finally:
            db.close()

    def get_task_stats(self, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        db = next(get_db())
        try:
            query = db.query(ScheduledTask)
            if tenant_id:
                query = query.filter(ScheduledTask.tenant_id == tenant_id)

            tasks = query.all()
            stats = {
                "total": len(tasks),
                "running": sum(1 for t in tasks if t.status == "running"),
                "scheduled": sum(1 for t in tasks if t.status == "scheduled"),
                "completed": sum(1 for t in tasks if t.status == "completed"),
                "failed": sum(1 for t in tasks if t.status == "failed"),
                "cancelled": sum(1 for t in tasks if t.status == "cancelled"),
                "queue_size": len(self._priority_queue)
            }
            return stats
        finally:
            db.close()


scheduler_service = SchedulerService()

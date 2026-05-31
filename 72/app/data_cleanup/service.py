import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from contextlib import contextmanager

from app.database import get_message_log_db, get_db, get_device_db
from app.message_log.models import MessageLog
from app.scheduler.models import ScheduledTask
from app.device.models import Device
from app.config import settings

logger = logging.getLogger(__name__)


class DataCleanupService:
    def __init__(self):
        self._running = False
        self._cleanup_task: Optional[asyncio.Task] = None
        self._message_log_retention_days = 30
        self._scheduler_log_retention_days = 90
        self._offline_device_archive_days = 365
        self._batch_size = 1000
        self._lock = asyncio.Lock()

    async def start(self):
        if not self._running:
            self._running = True
            self._cleanup_task = asyncio.create_task(self._periodic_cleanup())
            logger.info("DataCleanupService started")

    async def shutdown(self):
        self._running = False
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        logger.info("DataCleanupService shutdown complete")

    async def _periodic_cleanup(self):
        while self._running:
            try:
                await asyncio.sleep(3600)
                if self._running:
                    await self.cleanup_all()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Periodic cleanup error: {e}", exc_info=True)
                await asyncio.sleep(60)

    @contextmanager
    def _get_db_session(self, session_factory):
        db = None
        try:
            db = next(session_factory(), None)
            if db is None:
                raise RuntimeError("Failed to get database session")
            yield db
        except Exception as e:
            if db:
                db.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            if db:
                try:
                    db.close()
                except Exception as e:
                    logger.error(f"Error closing db session: {e}")

    async def cleanup_message_logs(self, days: Optional[int] = None) -> Dict[str, Any]:
        retention_days = days or self._message_log_retention_days
        cutoff_date = datetime.now() - timedelta(days=retention_days)
        total_deleted = 0
        tenant_stats: Dict[str, int] = {}

        logger.info(f"Starting message log cleanup for records older than {retention_days} days")

        async with self._lock:
            try:
                with self._get_db_session(get_message_log_db) as db:
                    while True:
                        old_logs = db.query(MessageLog).filter(
                            MessageLog.created_at < cutoff_date
                        ).limit(self._batch_size).all()

                        if not old_logs:
                            break

                        batch_count = len(old_logs)
                        for log in old_logs:
                            tenant_stats[log.tenant_id] = tenant_stats.get(log.tenant_id, 0) + 1
                            db.delete(log)

                        db.commit()
                        total_deleted += batch_count

                        logger.debug(
                            f"Deleted {batch_count} message logs in batch, "
                            f"total: {total_deleted}"
                        )

                        await asyncio.sleep(0.1)

                result = {
                    "retention_days": retention_days,
                    "total_deleted": total_deleted,
                    "per_tenant": tenant_stats,
                    "cutoff_date": cutoff_date.isoformat()
                }

                logger.info(
                    f"Message log cleanup complete: {total_deleted} records deleted "
                    f"across {len(tenant_stats)} tenants"
                )
                return result

            except Exception as e:
                logger.error(f"Message log cleanup failed: {e}", exc_info=True)
                return {"error": str(e), "total_deleted": total_deleted}

    async def cleanup_scheduler_tasks(self, days: Optional[int] = None) -> Dict[str, Any]:
        retention_days = days or self._scheduler_log_retention_days
        cutoff_date = datetime.now() - timedelta(days=retention_days)
        total_deleted = 0
        tenant_stats: Dict[str, int] = {}

        logger.info(f"Starting scheduler task cleanup for records older than {retention_days} days")

        async with self._lock:
            try:
                with self._get_db_session(get_db) as db:
                    while True:
                        old_tasks = db.query(ScheduledTask).filter(
                            ScheduledTask.status.in_(["completed", "failed", "cancelled"]),
                            ScheduledTask.updated_at < cutoff_date,
                            ScheduledTask.is_enabled == False
                        ).limit(self._batch_size).all()

                        if not old_tasks:
                            break

                        batch_count = len(old_tasks)
                        for task in old_tasks:
                            tenant_stats[task.tenant_id] = tenant_stats.get(task.tenant_id, 0) + 1
                            db.delete(task)

                        db.commit()
                        total_deleted += batch_count

                        logger.debug(
                            f"Deleted {batch_count} scheduler tasks in batch, "
                            f"total: {total_deleted}"
                        )

                        await asyncio.sleep(0.1)

                result = {
                    "retention_days": retention_days,
                    "total_deleted": total_deleted,
                    "per_tenant": tenant_stats,
                    "cutoff_date": cutoff_date.isoformat()
                }

                logger.info(
                    f"Scheduler task cleanup complete: {total_deleted} records deleted "
                    f"across {len(tenant_stats)} tenants"
                )
                return result

            except Exception as e:
                logger.error(f"Scheduler task cleanup failed: {e}", exc_info=True)
                return {"error": str(e), "total_deleted": total_deleted}

    async def cleanup_offline_devices(self, days: Optional[int] = None) -> Dict[str, Any]:
        retention_days = days or self._offline_device_archive_days
        cutoff_date = datetime.now() - timedelta(days=retention_days)
        total_archived = 0
        tenant_stats: Dict[str, int] = {}

        logger.info(f"Starting offline device cleanup for records older than {retention_days} days")

        async with self._lock:
            try:
                with self._get_db_session(get_device_db) as db:
                    offline_devices = db.query(Device).filter(
                        Device.is_online == False,
                        Device.last_online_at < cutoff_date
                    ).limit(self._batch_size).all()

                    for device in offline_devices:
                        tenant_stats[device.tenant_id] = tenant_stats.get(device.tenant_id, 0) + 1
                        if device.tags is None:
                            device.tags = {}
                        device.tags["archived"] = True
                        device.tags["archived_at"] = datetime.now().isoformat()
                        total_archived += 1

                    db.commit()

                result = {
                    "retention_days": retention_days,
                    "total_archived": total_archived,
                    "per_tenant": tenant_stats,
                    "cutoff_date": cutoff_date.isoformat()
                }

                logger.info(
                    f"Offline device cleanup complete: {total_archived} devices archived "
                    f"across {len(tenant_stats)} tenants"
                )
                return result

            except Exception as e:
                logger.error(f"Offline device cleanup failed: {e}", exc_info=True)
                return {"error": str(e), "total_archived": total_archived}

    async def cleanup_all(self) -> Dict[str, Any]:
        logger.info("Starting full data cleanup")

        results = {}

        try:
            results["message_logs"] = await self.cleanup_message_logs()
        except Exception as e:
            results["message_logs"] = {"error": str(e)}

        try:
            results["scheduler_tasks"] = await self.cleanup_scheduler_tasks()
        except Exception as e:
            results["scheduler_tasks"] = {"error": str(e)}

        try:
            results["offline_devices"] = await self.cleanup_offline_devices()
        except Exception as e:
            results["offline_devices"] = {"error": str(e)}

        logger.info(f"Full data cleanup complete: {results}")
        return results

    def get_retention_config(self) -> Dict[str, Any]:
        return {
            "message_log_retention_days": self._message_log_retention_days,
            "scheduler_log_retention_days": self._scheduler_log_retention_days,
            "offline_device_archive_days": self._offline_device_archive_days,
            "batch_size": self._batch_size
        }

    def set_retention_config(
        self,
        message_log_days: Optional[int] = None,
        scheduler_days: Optional[int] = None,
        offline_device_days: Optional[int] = None
    ):
        if message_log_days is not None:
            self._message_log_retention_days = max(1, message_log_days)
        if scheduler_days is not None:
            self._scheduler_log_retention_days = max(1, scheduler_days)
        if offline_device_days is not None:
            self._offline_device_archive_days = max(1, offline_device_days)

        logger.info(f"Retention config updated: {self.get_retention_config()}")


data_cleanup_service = DataCleanupService()

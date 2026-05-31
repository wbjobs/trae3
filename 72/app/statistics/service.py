from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy import func, and_, or_
from sqlalchemy.orm import Session

from app.database import get_db, get_device_db, get_message_log_db
from app.device.models import Device
from app.message_log.models import MessageLog
from app.scheduler.models import ScheduledTask


class StatisticsService:
    @staticmethod
    def get_device_statistics(tenant_id: str, db: Session) -> Dict[str, Any]:
        query = db.query(Device).filter(Device.tenant_id == tenant_id)

        total_devices = query.count()
        online_devices = query.filter(Device.is_online == True).count()
        offline_devices = total_devices - online_devices

        device_types = db.query(
            Device.device_type,
            func.count(Device.id)
        ).filter(
            Device.tenant_id == tenant_id
        ).group_by(Device.device_type).all()

        return {
            "total": total_devices,
            "online": online_devices,
            "offline": offline_devices,
            "online_rate": round(online_devices / total_devices * 100, 2) if total_devices > 0 else 0,
            "by_type": {dt[0]: dt[1] for dt in device_types if dt[0]}
        }

    @staticmethod
    def get_message_statistics(
        tenant_id: str,
        db: Session,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        query = db.query(MessageLog).filter(MessageLog.tenant_id == tenant_id)

        if start_date:
            query = query.filter(MessageLog.created_at >= start_date)
        if end_date:
            query = query.filter(MessageLog.created_at <= end_date)

        total_messages = query.count()

        status_stats = db.query(
            MessageLog.status,
            func.count(MessageLog.id)
        ).filter(
            MessageLog.tenant_id == tenant_id
        ).group_by(MessageLog.status).all()

        priority_stats = db.query(
            MessageLog.priority,
            func.count(MessageLog.id)
        ).filter(
            MessageLog.tenant_id == tenant_id
        ).group_by(MessageLog.priority).order_by(MessageLog.priority.desc()).all()

        channel_stats = db.query(
            MessageLog.channel,
            func.count(MessageLog.id)
        ).filter(
            MessageLog.tenant_id == tenant_id
        ).group_by(MessageLog.channel).all()

        type_stats = db.query(
            MessageLog.message_type,
            func.count(MessageLog.id)
        ).filter(
            MessageLog.tenant_id == tenant_id
        ).group_by(MessageLog.message_type).all()

        return {
            "total": total_messages,
            "by_status": {s[0]: s[1] for s in status_stats if s[0]},
            "by_priority": {str(p[0]): p[1] for p in priority_stats},
            "by_channel": {c[0]: c[1] for c in channel_stats if c[0]},
            "by_type": {t[0]: t[1] for t in type_stats if t[0]}
        }

    @staticmethod
    def get_message_trend(
        tenant_id: str,
        db: Session,
        days: int = 7
    ) -> List[Dict[str, Any]]:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        trend_data = []
        for i in range(days):
            day_start = start_date + timedelta(days=i)
            day_end = day_start + timedelta(days=1)

            count = db.query(func.count(MessageLog.id)).filter(
                MessageLog.tenant_id == tenant_id,
                MessageLog.created_at >= day_start,
                MessageLog.created_at < day_end
            ).scalar()

            trend_data.append({
                "date": day_start.strftime("%Y-%m-%d"),
                "count": count or 0
            })

        return trend_data

    @staticmethod
    def get_scheduler_statistics(tenant_id: str, db: Session) -> Dict[str, Any]:
        query = db.query(ScheduledTask).filter(ScheduledTask.tenant_id == tenant_id)

        total_tasks = query.count()

        status_stats = db.query(
            ScheduledTask.status,
            func.count(ScheduledTask.id)
        ).filter(
            ScheduledTask.tenant_id == tenant_id
        ).group_by(ScheduledTask.status).all()

        priority_stats = db.query(
            ScheduledTask.priority,
            func.count(ScheduledTask.id)
        ).filter(
            ScheduledTask.tenant_id == tenant_id
        ).group_by(ScheduledTask.priority).all()

        type_stats = db.query(
            ScheduledTask.task_type,
            func.count(ScheduledTask.id)
        ).filter(
            ScheduledTask.tenant_id == tenant_id
        ).group_by(ScheduledTask.task_type).all()

        total_executions = db.query(
            func.sum(ScheduledTask.run_count)
        ).filter(
            ScheduledTask.tenant_id == tenant_id
        ).scalar() or 0

        return {
            "total_tasks": total_tasks,
            "total_executions": total_executions,
            "by_status": {s[0]: s[1] for s in status_stats if s[0]},
            "by_priority": {str(p[0]): p[1] for p in priority_stats},
            "by_type": {t[0]: t[1] for t in type_stats if t[0]}
        }

    @staticmethod
    def get_dashboard_overview(tenant_id: str) -> Dict[str, Any]:
        db = next(get_db())
        device_db = next(get_device_db())
        msg_log_db = next(get_message_log_db())

        try:
            device_stats = StatisticsService.get_device_statistics(tenant_id, device_db)
            message_stats = StatisticsService.get_message_statistics(tenant_id, msg_log_db)
            scheduler_stats = StatisticsService.get_scheduler_statistics(tenant_id, db)
            message_trend = StatisticsService.get_message_trend(tenant_id, msg_log_db)

            return {
                "devices": device_stats,
                "messages": message_stats,
                "scheduler": scheduler_stats,
                "message_trend": message_trend
            }
        finally:
            db.close()
            device_db.close()
            msg_log_db.close()


statistics_service = StatisticsService()

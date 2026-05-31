from sqlalchemy import Column, String, DateTime, Boolean, Integer, JSON, Text
from sqlalchemy.sql import func

from app.database.connection import Base


class ScheduledTask(Base):
    __tablename__ = "scheduled_tasks"

    id = Column(String(36), primary_key=True, index=True)
    tenant_id = Column(String(36), index=True, nullable=False)
    task_name = Column(String(200), nullable=False)
    task_type = Column(String(50), index=True)
    priority = Column(Integer, default=0, index=True)
    cron_expression = Column(String(100))
    run_once_at = Column(DateTime(timezone=True))
    payload = Column(JSON)
    callback_url = Column(String(500))
    status = Column(String(20), default="pending", index=True)
    last_run_at = Column(DateTime(timezone=True))
    next_run_at = Column(DateTime(timezone=True), index=True)
    run_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    retry_count = Column(Integer, default=0)
    is_enabled = Column(Boolean, default=True)
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

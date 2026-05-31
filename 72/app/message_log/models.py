from sqlalchemy import Column, String, DateTime, Boolean, Integer, JSON, Text
from sqlalchemy.sql import func

from app.database.connection import MessageLogBase


class MessageLog(MessageLogBase):
    __tablename__ = "message_logs"

    id = Column(String(36), primary_key=True, index=True)
    tenant_id = Column(String(36), index=True, nullable=False)
    message_id = Column(String(64), index=True)
    message_type = Column(String(50), index=True)
    priority = Column(Integer, default=0, index=True)
    channel = Column(String(50), index=True)
    sender = Column(String(100))
    recipient = Column(String(100), index=True)
    device_id = Column(String(36), index=True)
    subject = Column(String(500))
    content = Column(Text)
    payload = Column(JSON)
    status = Column(String(20), default="pending", index=True)
    sent_at = Column(DateTime(timezone=True), index=True)
    delivered_at = Column(DateTime(timezone=True))
    read_at = Column(DateTime(timezone=True))
    failed_at = Column(DateTime(timezone=True))
    error_message = Column(Text)
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON, Index
from sqlalchemy.sql import func
from app.core.database import Base


class AnomalyRecord(Base):
    __tablename__ = "anomaly_records"

    id = Column(Integer, primary_key=True, index=True)
    device_code = Column(String(50), index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), index=True, nullable=False)
    anomaly_type = Column(String(50), nullable=False)
    severity = Column(String(20), default="warning")
    axis = Column(String(10))
    value = Column(Float)
    threshold = Column(Float)
    description = Column(Text)
    raw_data = Column(JSON)
    status = Column(String(20), default="pending")
    handled_by = Column(String(50))
    handled_at = Column(DateTime(timezone=True))
    handle_notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_anomaly_device_time", "device_code", "timestamp"),
    )

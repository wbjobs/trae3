from sqlalchemy import Column, Integer, String, Float, DateTime, Index
from sqlalchemy.sql import func
from app.core.database import Base


class VibrationData(Base):
    __tablename__ = "vibration_data"

    id = Column(Integer, primary_key=True, index=True)
    device_code = Column(String(50), index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), index=True, nullable=False)
    x_axis = Column(Float, nullable=False)
    y_axis = Column(Float, nullable=False)
    z_axis = Column(Float, nullable=False)
    temperature = Column(Float)
    speed = Column(Float)
    sample_rate = Column(Integer, default=1000)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_device_time", "device_code", "timestamp"),
    )

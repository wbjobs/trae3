from sqlalchemy import Column, Integer, String, Float, DateTime, Index, Interval
from sqlalchemy.sql import func
from app.core.database import Base


class VibrationAggregation(Base):
    __tablename__ = "vibration_aggregation"

    id = Column(Integer, primary_key=True, index=True)
    device_code = Column(String(50), index=True, nullable=False)
    time_bucket = Column(DateTime(timezone=True), index=True, nullable=False)
    window_size = Column(Interval, nullable=False)
    metric_name = Column(String(50), index=True, nullable=False)

    mean_value = Column(Float)
    max_value = Column(Float)
    min_value = Column(Float)
    std_value = Column(Float)
    count = Column(Integer, default=0)

    rms_value = Column(Float)
    peak_value = Column(Float)
    crest_factor = Column(Float)
    kurtosis = Column(Float)

    p50 = Column(Float)
    p95 = Column(Float)
    p99 = Column(Float)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_agg_device_bucket", "device_code", "time_bucket", "window_size"),
        Index("idx_agg_metric", "device_code", "metric_name", "time_bucket"),
    )

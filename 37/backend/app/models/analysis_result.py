from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON, Index
from sqlalchemy.sql import func
from app.core.database import Base


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    device_code = Column(String(50), index=True, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    rms_x = Column(Float)
    rms_y = Column(Float)
    rms_z = Column(Float)
    peak_x = Column(Float)
    peak_y = Column(Float)
    peak_z = Column(Float)
    crest_factor_x = Column(Float)
    crest_factor_y = Column(Float)
    crest_factor_z = Column(Float)
    kurtosis_x = Column(Float)
    kurtosis_y = Column(Float)
    kurtosis_z = Column(Float)
    skewness_x = Column(Float)
    skewness_y = Column(Float)
    skewness_z = Column(Float)
    dominant_frequency_x = Column(Float)
    dominant_frequency_y = Column(Float)
    dominant_frequency_z = Column(Float)
    harmonic_data = Column(JSON)
    fft_data = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_analysis_device_time", "device_code", "start_time"),
    )

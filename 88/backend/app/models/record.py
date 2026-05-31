from sqlalchemy import Column, Integer, String, DateTime, Text, Float, Index
from sqlalchemy.sql import func
from ..core.database import Base


class NameplateRecord(Base):
    __tablename__ = "nameplate_records"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False, index=True)
    original_path = Column(String(500), nullable=False)
    processed_path = Column(String(500), nullable=True)
    equipment_name = Column(String(200), nullable=True, index=True)
    equipment_model = Column(String(200), nullable=True, index=True)
    serial_number = Column(String(200), nullable=True, index=True)
    manufacturer = Column(String(200), nullable=True, index=True)
    production_date = Column(String(50), nullable=True, index=True)
    rated_power = Column(String(100), nullable=True)
    rated_voltage = Column(String(100), nullable=True)
    rated_current = Column(String(100), nullable=True)
    weight = Column(String(100), nullable=True)
    dimensions = Column(String(200), nullable=True)
    inspection_cycle = Column(String(100), nullable=True)
    raw_text = Column(Text, nullable=True)
    confidence = Column(Float, default=0.0, index=True)
    ocr_result = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    status = Column(String(20), default="pending", index=True)

    __table_args__ = (
        Index('idx_manufacturer_status', 'manufacturer', 'status'),
        Index('idx_created_at_status', 'created_at', 'status'),
        Index('idx_confidence_status', 'confidence', 'status'),
    )

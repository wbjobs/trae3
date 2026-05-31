from sqlalchemy import Column, String, DateTime, Boolean, Integer, JSON, Float
from sqlalchemy.sql import func

from app.database.connection import DeviceBase


class Device(DeviceBase):
    __tablename__ = "devices"

    id = Column(String(36), primary_key=True, index=True)
    tenant_id = Column(String(36), index=True, nullable=False)
    device_code = Column(String(100), unique=True, index=True, nullable=False)
    device_name = Column(String(200), nullable=False)
    device_type = Column(String(50), index=True)
    manufacturer = Column(String(100))
    model = Column(String(100))
    firmware_version = Column(String(50))
    status = Column(String(20), default="offline")
    is_online = Column(Boolean, default=False)
    last_online_at = Column(DateTime(timezone=True))
    ip_address = Column(String(50))
    mac_address = Column(String(50))
    location = Column(String(200))
    latitude = Column(Float)
    longitude = Column(Float)
    tags = Column(JSON)
    extra_metadata = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

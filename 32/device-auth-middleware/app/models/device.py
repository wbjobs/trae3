import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text, func

from app.models.tenant import Base, TimestampMixin


class DeviceModel(Base, TimestampMixin):
    __tablename__ = "devices"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_sn = Column(String(128), nullable=False, index=True)
    device_name = Column(String(256), nullable=True)
    device_type = Column(String(64), nullable=True)
    fingerprint = Column(String(256), nullable=True)
    status = Column(String(32), nullable=False, default="registered")
    metadata_json = Column(Text, nullable=True)

    __table_args__ = (
        {"sqlite_autoincrement": True},
    )


class DeviceWhitelistModel(Base, TimestampMixin):
    __tablename__ = "device_whitelist"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_id = Column(
        String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_active = Column(Boolean, nullable=False, default=True)
    expires_at = Column(DateTime, nullable=True)

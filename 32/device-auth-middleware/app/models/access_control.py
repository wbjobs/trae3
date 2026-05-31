import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text, func

from app.models.tenant import Base, TimestampMixin


class IPBlacklistModel(Base, TimestampMixin):
    __tablename__ = "ip_blacklist"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ip_address = Column(String(64), nullable=False, index=True)
    ip_cidr = Column(String(128), nullable=True)
    reason = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    expires_at = Column(DateTime, nullable=True)

    __table_args__ = (
        {"sqlite_autoincrement": True},
    )


class DeviceBlacklistModel(Base, TimestampMixin):
    __tablename__ = "device_blacklist"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_id = Column(
        String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reason = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    expires_at = Column(DateTime, nullable=True)

    __table_args__ = (
        {"sqlite_autoincrement": True},
    )


class IPWhitelistModel(Base, TimestampMixin):
    __tablename__ = "ip_whitelist"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ip_address = Column(String(64), nullable=False, index=True)
    ip_cidr = Column(String(128), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    expires_at = Column(DateTime, nullable=True)

    __table_args__ = (
        {"sqlite_autoincrement": True},
    )

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func

from app.models.tenant import Base, TimestampMixin


class PermissionModel(Base, TimestampMixin):
    __tablename__ = "permissions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_id = Column(
        String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id = Column(String(128), nullable=False, index=True)
    permission_level = Column(Integer, nullable=False, default=1)
    action = Column(String(64), nullable=False, default="*", index=True)
    resource_scope = Column(String(256), nullable=True)
    status = Column(String(32), nullable=False, default="active", index=True)
    expires_at = Column(DateTime, nullable=True)
    issued_by = Column(String(128), nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    revoke_reason = Column(Text, nullable=True)

    __table_args__ = (
        {"sqlite_autoincrement": True},
    )


class TempAuthModel(Base, TimestampMixin):
    __tablename__ = "temp_auths"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(
        String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_id = Column(
        String(36), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_id = Column(String(128), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    permission_level = Column(Integer, nullable=False, default=1)
    action = Column(String(64), nullable=False, default="*")
    resource_scope = Column(String(256), nullable=True)
    status = Column(String(32), nullable=False, default="active")
    expires_at = Column(DateTime, nullable=False)
    issued_by = Column(String(128), nullable=True)

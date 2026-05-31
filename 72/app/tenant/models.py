from sqlalchemy import Column, String, DateTime, Boolean, Integer
from sqlalchemy.sql import func

from app.database.connection import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(String(36), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(50), unique=True, index=True, nullable=False)
    description = Column(String(500))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    expired_at = Column(DateTime(timezone=True))
    max_users = Column(Integer, default=100)
    max_devices = Column(Integer, default=1000)
    storage_quota_gb = Column(Integer, default=10)

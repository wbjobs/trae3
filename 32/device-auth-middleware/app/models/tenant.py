import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, String, func
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at = Column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TenantModel(Base, TimestampMixin):
    __tablename__ = "tenants"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(128), unique=True, nullable=False, index=True)
    api_key = Column(String(128), nullable=False, unique=True, index=True)
    api_secret_hash = Column(String(128), nullable=False)
    isolation_level = Column(String(32), nullable=False, default="strict")
    device_quota = Column(String(16), nullable=False, default="1000")
    status = Column(String(16), nullable=False, default="active")

    @staticmethod
    def generate_api_key() -> str:
        return f"ak_{uuid.uuid4().hex[:32]}"

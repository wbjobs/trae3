import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VersionStatus(str, enum.Enum):
    DRAFT = "draft"
    TESTING = "testing"
    GRAYSCALE = "grayscale"
    RELEASED = "released"
    DEPRECATED = "deprecated"
    ROLLED_BACK = "rolled_back"


class UpgradeStatus(str, enum.Enum):
    PENDING = "pending"
    DOWNLOADING = "downloading"
    INSTALLING = "installing"
    SUCCESS = "success"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class PushTaskStatus(str, enum.Enum):
    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class GrayscaleStrategy(str, enum.Enum):
    PERCENTAGE = "percentage"
    DEVICE_LIST = "device_list"
    REGION = "region"
    CONSISTENT_HASH = "consistent_hash"
    VERSION_RANGE = "version_range"


class RateLimitDimension(str, enum.Enum):
    IP = "ip"
    PATH = "path"
    DEVICE = "device"
    ENDPOINT = "endpoint"


class RetryStatus(str, enum.Enum):
    PENDING = "pending"
    RETRYING = "retrying"
    SUCCESS = "success"
    FAILED = "failed"
    MAX_RETRIES_EXCEEDED = "max_retries_exceeded"


class FirmwareVersion(Base):
    __tablename__ = "firmware_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    version_name: Mapped[str] = mapped_column(String(128), nullable=False)
    product_model: Mapped[str] = mapped_column(String(64), nullable=False)
    firmware_url: Mapped[str] = mapped_column(String(512), nullable=False)
    firmware_md5: Mapped[str] = mapped_column(String(64), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    release_notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[VersionStatus] = mapped_column(Enum(VersionStatus), default=VersionStatus.DRAFT)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    grayscale_rules: Mapped[list["GrayscaleRule"]] = relationship(back_populates="version", cascade="all, delete-orphan")
    upgrade_records: Mapped[list["UpgradeRecord"]] = relationship(back_populates="version")
    push_tasks: Mapped[list["PushTask"]] = relationship(back_populates="version")


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    device_sn: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    product_model: Mapped[str] = mapped_column(String(64), nullable=False)
    current_version: Mapped[str] = mapped_column(String(64), default="")
    region: Mapped[str] = mapped_column(String(64), default="")
    is_online: Mapped[bool] = mapped_column(default=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    upgrade_records: Mapped[list["UpgradeRecord"]] = relationship(back_populates="device")
    retry_queues: Mapped[list["RetryQueue"]] = relationship(back_populates="device")


class GrayscaleRule(Base):
    __tablename__ = "grayscale_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version_id: Mapped[str] = mapped_column(String(36), ForeignKey("firmware_versions.id", ondelete="CASCADE"), nullable=False)
    strategy: Mapped[GrayscaleStrategy] = mapped_column(Enum(GrayscaleStrategy), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    percentage: Mapped[float] = mapped_column(Float, default=0.0)
    device_list: Mapped[str] = mapped_column(Text, default="")
    region_list: Mapped[str] = mapped_column(Text, default="")
    min_version: Mapped[str] = mapped_column(String(64), default="")
    max_version: Mapped[str] = mapped_column(String(64), default="")
    hash_ring_nodes: Mapped[int] = mapped_column(Integer, default=160)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    version: Mapped["FirmwareVersion"] = relationship(back_populates="grayscale_rules")


class UpgradeRecord(Base):
    __tablename__ = "upgrade_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("devices.id"), nullable=False)
    version_id: Mapped[str] = mapped_column(String(36), ForeignKey("firmware_versions.id"), nullable=False)
    push_task_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("push_tasks.id"), nullable=True)
    from_version: Mapped[str] = mapped_column(String(64), default="")
    to_version: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[UpgradeStatus] = mapped_column(Enum(UpgradeStatus), default=UpgradeStatus.PENDING)
    error_message: Mapped[str] = mapped_column(Text, default="")
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=3)
    last_retry_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    device: Mapped["Device"] = relationship(back_populates="upgrade_records")
    version: Mapped["FirmwareVersion"] = relationship(back_populates="upgrade_records")
    push_task: Mapped["PushTask"] = relationship(back_populates="upgrade_records")


class PushTask(Base):
    __tablename__ = "push_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version_id: Mapped[str] = mapped_column(String(36), ForeignKey("firmware_versions.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[PushTaskStatus] = mapped_column(Enum(PushTaskStatus), default=PushTaskStatus.DRAFT)
    total_devices: Mapped[int] = mapped_column(Integer, default=0)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=3)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resumed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    version: Mapped["FirmwareVersion"] = relationship(back_populates="push_tasks")
    upgrade_records: Mapped[list["UpgradeRecord"]] = relationship(back_populates="push_task")


class RetryQueue(Base):
    __tablename__ = "retry_queues"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    device_id: Mapped[str] = mapped_column(String(36), ForeignKey("devices.id"), nullable=False)
    version_id: Mapped[str] = mapped_column(String(36), ForeignKey("firmware_versions.id"), nullable=False)
    upgrade_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("upgrade_records.id"), nullable=False)
    status: Mapped[RetryStatus] = mapped_column(Enum(RetryStatus), default=RetryStatus.PENDING)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=3)
    next_retry_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    device: Mapped["Device"] = relationship(back_populates="retry_queues")


class RateLimitRule(Base):
    __tablename__ = "rate_limit_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    dimension: Mapped[RateLimitDimension] = mapped_column(Enum(RateLimitDimension), nullable=False)
    path_pattern: Mapped[str] = mapped_column(String(256), default="")
    limit: Mapped[int] = mapped_column(Integer, nullable=False)
    window_seconds: Mapped[int] = mapped_column(Integer, default=60)
    is_active: Mapped[bool] = mapped_column(default=True)
    block_duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class DailyStatistic(Base):
    __tablename__ = "daily_statistics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    stat_date: Mapped[str] = mapped_column(String(10), nullable=False)
    version_id: Mapped[str] = mapped_column(String(36), ForeignKey("firmware_versions.id"), nullable=False)
    total_pushed: Mapped[int] = mapped_column(Integer, default=0)
    total_success: Mapped[int] = mapped_column(Integer, default=0)
    total_failed: Mapped[int] = mapped_column(Integer, default=0)
    total_rolled_back: Mapped[int] = mapped_column(Integer, default=0)
    success_rate: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

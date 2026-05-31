from datetime import datetime

from pydantic import BaseModel, Field

from app.models import (
    GrayscaleStrategy,
    PushTaskStatus,
    RateLimitDimension,
    RetryStatus,
    UpgradeStatus,
    VersionStatus,
)


class FirmwareVersionCreate(BaseModel):
    version_code: str = Field(..., max_length=64)
    version_name: str = Field(..., max_length=128)
    product_model: str = Field(..., max_length=64)
    firmware_url: str = Field(..., max_length=512)
    firmware_md5: str = Field(..., max_length=64)
    file_size: int
    release_notes: str = ""


class FirmwareVersionOut(FirmwareVersionCreate):
    id: str
    status: VersionStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VersionStatusUpdate(BaseModel):
    status: VersionStatus


class GrayscaleRuleCreate(BaseModel):
    version_id: str
    strategy: GrayscaleStrategy
    priority: int = 0
    percentage: float = 0.0
    device_list: str = ""
    region_list: str = ""
    min_version: str = ""
    max_version: str = ""
    hash_ring_nodes: int = 160


class GrayscaleRuleOut(GrayscaleRuleCreate):
    id: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class GrayscaleRuleUpdate(BaseModel):
    strategy: GrayscaleStrategy | None = None
    priority: int | None = None
    percentage: float | None = None
    device_list: str | None = None
    region_list: str | None = None
    min_version: str | None = None
    max_version: str | None = None
    hash_ring_nodes: int | None = None
    is_active: bool | None = None


class DeviceCreate(BaseModel):
    device_sn: str = Field(..., max_length=128)
    product_model: str = Field(..., max_length=64)
    current_version: str = ""
    region: str = ""


class DeviceOut(DeviceCreate):
    id: str
    is_online: bool
    last_seen_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeviceHeartbeat(BaseModel):
    device_sn: str
    is_online: bool = True


class UpgradeRecordCreate(BaseModel):
    device_id: str
    version_id: str
    push_task_id: str | None = None
    from_version: str = ""
    to_version: str = ""
    max_retries: int = 3


class UpgradeRecordOut(UpgradeRecordCreate):
    id: str
    status: UpgradeStatus
    error_message: str
    retry_count: int
    last_retry_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UpgradeStatusUpdate(BaseModel):
    status: UpgradeStatus
    error_message: str = ""


class PushTaskCreate(BaseModel):
    version_id: str
    name: str = Field(..., max_length=128)
    description: str = ""
    device_ids: list[str] = []
    product_model: str | None = None
    region: str | None = None
    max_retries: int = 3
    created_by: str = "system"


class PushTaskOut(BaseModel):
    id: str
    version_id: str
    name: str
    description: str
    status: PushTaskStatus
    total_devices: int
    success_count: int
    failed_count: int
    max_retries: int
    paused_at: datetime | None
    resumed_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PushTaskStatusUpdate(BaseModel):
    status: PushTaskStatus


class PushRequest(BaseModel):
    version_id: str
    device_ids: list[str] = []
    product_model: str | None = None
    region: str | None = None


class RollbackRequest(BaseModel):
    version_id: str
    device_ids: list[str] = []


class RetryQueueOut(BaseModel):
    id: str
    device_id: str
    version_id: str
    upgrade_record_id: str
    status: RetryStatus
    retry_count: int
    max_retries: int
    next_retry_at: datetime
    last_error: str
    priority: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RateLimitRuleCreate(BaseModel):
    name: str = Field(..., max_length=128)
    dimension: RateLimitDimension
    path_pattern: str = ""
    limit: int
    window_seconds: int = 60
    is_active: bool = True
    block_duration_seconds: int = 0


class RateLimitRuleOut(RateLimitRuleCreate):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class StatQueryParams(BaseModel):
    version_id: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class DailyStatisticOut(BaseModel):
    id: str
    stat_date: str
    version_id: str
    total_pushed: int
    total_success: int
    total_failed: int
    total_rolled_back: int
    success_rate: float
    created_at: datetime

    model_config = {"from_attributes": True}


class ApiResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: object = None

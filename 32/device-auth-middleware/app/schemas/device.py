from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DeviceRegisterRequest(BaseModel):
    device_sn: str = Field(..., min_length=1, max_length=128)
    device_name: str | None = Field(None, max_length=256)
    device_type: str | None = Field(None, max_length=64)
    fingerprint: str | None = Field(None, max_length=256)
    metadata: dict[str, Any] | None = None


class DeviceResponse(BaseModel):
    id: str
    device_sn: str
    device_name: str | None
    device_type: str | None
    fingerprint: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class WhitelistEntryResponse(BaseModel):
    id: str
    device_id: str
    is_active: bool
    expires_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

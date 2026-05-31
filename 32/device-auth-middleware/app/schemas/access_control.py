from datetime import datetime

from pydantic import BaseModel, Field


class IPBlacklistRequest(BaseModel):
    ip_address: str = Field(..., min_length=1, max_length=64)
    ip_cidr: str | None = Field(None, max_length=128)
    reason: str | None = None
    expires_at: datetime | None = None


class DeviceBlacklistRequest(BaseModel):
    device_id: str = Field(..., min_length=1)
    reason: str | None = None
    expires_at: datetime | None = None


class IPBlacklistResponse(BaseModel):
    id: str
    ip_address: str
    ip_cidr: str | None
    reason: str | None
    is_active: bool
    expires_at: datetime | None

    model_config = {"from_attributes": True}


class DeviceBlacklistResponse(BaseModel):
    id: str
    device_id: str
    reason: str | None
    is_active: bool
    expires_at: datetime | None

    model_config = {"from_attributes": True}

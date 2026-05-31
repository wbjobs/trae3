from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PermissionIssueRequest(BaseModel):
    device_id: str = Field(..., min_length=1)
    subject_id: str = Field(..., min_length=1, max_length=128)
    permission_level: int = Field(1, ge=1, le=5)
    action: str | None = Field(None, max_length=64, description="read/write/execute/admin/*")
    resource_scope: str | None = Field(None, max_length=256)
    expires_at: datetime | None = None


class BatchPermissionIssueRequest(BaseModel):
    device_ids: list[str] = Field(..., min_length=1, max_length=100)
    subject_ids: list[str] = Field(..., min_length=1, max_length=100)
    permission_level: int = Field(1, ge=1, le=5)
    action: str | None = Field(None, max_length=64, description="read/write/execute/admin/*")
    resource_scope: str | None = Field(None, max_length=256)
    expires_at: datetime | None = None


class PermissionRevokeRequest(BaseModel):
    permission_id: str | None = None
    device_id: str | None = None
    subject_id: str | None = None
    action: str | None = None
    reason: str | None = None


class TempAuthRequest(BaseModel):
    device_id: str = Field(..., min_length=1)
    subject_id: str = Field(..., min_length=1, max_length=128)
    permission_level: int = Field(1, ge=1, le=5)
    action: str | None = Field(None, max_length=64, description="read/write/execute/admin/*")
    resource_scope: str | None = Field(None, max_length=256)
    expires_minutes: int = Field(15, ge=1, le=1440)


class PermissionCheckRequest(BaseModel):
    device_id: str = Field(..., min_length=1)
    subject_id: str = Field(..., min_length=1, max_length=128)
    action: str = Field(..., min_length=1, max_length=64)


class PermissionResponse(BaseModel):
    id: str
    device_id: str
    subject_id: str
    permission_level: int
    action: str
    resource_scope: str | None
    status: str
    expires_at: datetime | None
    issued_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TempAuthResponse(BaseModel):
    id: str
    device_id: str
    subject_id: str
    permission_level: int
    action: str
    resource_scope: str | None
    temp_token: str
    expires_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class PermissionCheckResponse(BaseModel):
    allowed: bool
    permission_level: int | None = None
    action: str | None = None
    resource_scope: str | None = None

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime


class TenantBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None


class TenantCreate(TenantBase):
    pass


class TenantResponse(TenantBase):
    id: str
    is_active: bool
    created_at: datetime
    max_users: int
    max_devices: int

    class Config:
        from_attributes = True


class DeviceBase(BaseModel):
    device_code: str
    device_name: str
    device_type: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    location: Optional[str] = None
    tags: Optional[Dict[str, Any]] = None


class DeviceCreate(DeviceBase):
    pass


class DeviceResponse(DeviceBase):
    id: str
    status: str
    is_online: bool
    last_online_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class MessagePushRequest(BaseModel):
    message_type: str
    payload: Dict[str, Any]
    priority: int = 0
    target_client_id: Optional[str] = None
    device_id: Optional[str] = None


class MessagePushResponse(BaseModel):
    message_id: str
    status: str


class MessageRecallRequest(BaseModel):
    message_id: str


class MessageRecallResponse(BaseModel):
    message_id: str
    recalled: bool
    detail: Optional[str] = None


class OfflineRedeliverRequest(BaseModel):
    device_id: Optional[str] = None
    hours: int = 24


class OfflineRedeliverResponse(BaseModel):
    tenant_id: str
    redelivered_count: int


class MessageLogResponse(BaseModel):
    id: str
    message_id: str
    message_type: str
    priority: int
    channel: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ScheduledTaskBase(BaseModel):
    task_name: str
    task_type: str
    payload: Dict[str, Any]
    priority: int = 0
    cron_expression: Optional[str] = None
    run_once_at: Optional[datetime] = None


class ScheduledTaskCreate(ScheduledTaskBase):
    pass


class ScheduledTaskResponse(ScheduledTaskBase):
    id: str
    status: str
    run_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class StatisticsResponse(BaseModel):
    devices: Dict[str, Any]
    messages: Dict[str, Any]
    scheduler: Dict[str, Any]
    message_trend: List[Dict[str, Any]]

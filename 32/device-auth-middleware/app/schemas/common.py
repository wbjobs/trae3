from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ResponseBase(BaseModel):
    code: int = 0
    message: str = "success"
    node_id: str | None = None
    request_id: str | None = None


class ResponseWithData(ResponseBase):
    data: Any = None


class PaginatedResponse(ResponseBase):
    data: list[Any] = []
    total: int = 0
    page: int = 1
    page_size: int = 20


class ErrorResponse(BaseModel):
    code: int
    message: str
    detail: str | None = None
    node_id: str | None = None
    request_id: str | None = None


class TenantContext(BaseModel):
    tenant_id: str
    api_key: str
    isolation_level: str = "strict"

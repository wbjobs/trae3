from datetime import datetime
from typing import Optional, Generic, TypeVar, Optional as Opt
from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class BaseSchema(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )


class ResponseBase(BaseSchema, Generic[T]):
    code: int = Field(default=200, description="响应状态码")
    message: str = Field(default="success", description="响应消息")
    data: Optional[T] = Field(default=None, description="响应数据")


class PaginatedResponse(BaseSchema, Generic[T]):
    code: int = Field(default=200, description="响应状态码")
    message: str = Field(default="success", description="响应消息")
    items: list[T] = Field(default_factory=list, description="数据列表")
    total: int = Field(default=0, description="总数")
    page: int = Field(default=1, description="当前页码")
    page_size: int = Field(default=10, description="每页数量")
    total_pages: int = Field(default=0, description="总页数")


class IDRequest(BaseSchema):
    id: int = Field(..., description="ID")


class TimestampMixin(BaseSchema):
    created_at: datetime
    updated_at: datetime
    is_active: bool

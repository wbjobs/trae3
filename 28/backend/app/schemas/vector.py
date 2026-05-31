from typing import Optional, List, Any, Dict
from datetime import datetime
from pydantic import Field, field_validator

from app.schemas.base import BaseSchema, TimestampMixin
from app.models.vector import CONTENT_TYPES


class VectorStoreRequest(BaseSchema):
    paper_id: Optional[int] = Field(default=None, description="论文ID")
    content_type: str = Field(..., description="内容类型")
    content: str = Field(..., description="文本内容")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="元数据")
    chunk_size: int = Field(default=500, ge=100, le=2000, description="分块大小")
    chunk_overlap: int = Field(default=50, ge=0, le=500, description="分块重叠大小")

    @field_validator("content_type")
    @classmethod
    def validate_content_type(cls, v: str) -> str:
        if v not in CONTENT_TYPES:
            raise ValueError(f"content_type must be one of {CONTENT_TYPES}")
        return v


class VectorSearchRequest(BaseSchema):
    query: str = Field(..., description="搜索查询文本")
    top_k: int = Field(default=5, ge=1, le=50, description="返回结果数量")
    paper_id: Optional[int] = Field(default=None, description="按论文ID过滤")
    content_type: Optional[str] = Field(default=None, description="按内容类型过滤")
    threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="相似度阈值")

    @field_validator("content_type")
    @classmethod
    def validate_content_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in CONTENT_TYPES:
            raise ValueError(f"content_type must be one of {CONTENT_TYPES} or None")
        return v


class VectorSearchResponse(BaseSchema, TimestampMixin):
    id: int
    paper_id: Optional[int]
    content_type: str
    content: str
    metadata: Dict[str, Any]
    vector_id: str
    score: float = Field(..., description="相似度得分")


class VectorStoreResponse(BaseSchema, TimestampMixin):
    id: int
    paper_id: Optional[int]
    content_type: str
    content: str
    metadata: Dict[str, Any]
    vector_id: str


class VectorDeleteRequest(BaseSchema):
    paper_id: Optional[int] = Field(default=None, description="论文ID")
    vector_id: Optional[str] = Field(default=None, description="向量ID")


class VectorStatsResponse(BaseSchema):
    total_vectors: int
    by_content_type: Dict[str, int]
    by_paper: Dict[int, int]

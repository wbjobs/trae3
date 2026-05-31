from typing import Optional, List, Dict, Any
from pydantic import Field

from app.models.paper import PaperStatus
from app.schemas.base import BaseSchema, TimestampMixin


class PaperCreate(BaseSchema):
    file_path: str = Field(..., description="文件路径", max_length=500)
    file_size: Optional[int] = Field(None, description="文件大小(字节)")
    created_by: Optional[int] = Field(None, description="创建者ID")


class PaperUpdate(BaseSchema):
    title: Optional[str] = Field(None, description="论文标题", max_length=500)
    authors: Optional[str] = Field(None, description="作者", max_length=1000)
    abstract: Optional[str] = Field(None, description="摘要")
    keywords: Optional[str] = Field(None, description="关键词", max_length=500)
    total_pages: Optional[int] = Field(None, description="总页数")
    parsed_content: Optional[str] = Field(None, description="解析后的内容")
    status: Optional[PaperStatus] = Field(None, description="解析状态")


class PaperChapter(BaseSchema):
    title: str = Field(..., description="章节标题")
    content: str = Field(..., description="章节内容")
    page: Optional[int] = Field(None, description="起始页码")
    level: int = Field(default=1, description="章节层级")


class PaperReference(BaseSchema):
    text: str = Field(..., description="参考文献原文")
    authors: Optional[str] = Field(None, description="作者")
    title: Optional[str] = Field(None, description="标题")
    year: Optional[str] = Field(None, description="年份")
    venue: Optional[str] = Field(None, description="发表期刊/会议")


class PaperParseResult(BaseSchema):
    title: Optional[str] = Field(None, description="论文标题")
    authors: Optional[List[str]] = Field(None, description="作者列表")
    abstract: Optional[str] = Field(None, description="摘要")
    keywords: Optional[List[str]] = Field(None, description="关键词列表")
    total_pages: int = Field(..., description="总页数")
    chapters: List[PaperChapter] = Field(default_factory=list, description="章节列表")
    references: List[PaperReference] = Field(default_factory=list, description="参考文献列表")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="元数据")
    raw_text: Optional[str] = Field(None, description="原始文本内容")


class PaperResponse(TimestampMixin):
    id: int
    title: Optional[str] = None
    authors: Optional[str] = None
    abstract: Optional[str] = None
    keywords: Optional[str] = None
    total_pages: Optional[int] = None
    file_path: str
    file_size: Optional[int] = None
    status: PaperStatus
    created_by: Optional[int] = None
    parse_result: Optional[PaperParseResult] = Field(None, description="解析结果")

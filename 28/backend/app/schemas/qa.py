from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import Field

from app.schemas.base import BaseSchema, TimestampMixin


class QAReference(BaseSchema):
    paper_id: str = Field(..., description="论文ID")
    paper_title: Optional[str] = Field(None, description="论文标题")
    chunk_id: Optional[str] = Field(None, description="文本块ID")
    page_number: Optional[int] = Field(None, description="页码")
    figure_id: Optional[str] = Field(None, description="图表ID")
    figure_caption: Optional[str] = Field(None, description="图表标题")
    figure_url: Optional[str] = Field(None, description="图表溯源URL")
    text: Optional[str] = Field(None, description="引用的文本内容")
    score: Optional[float] = Field(None, description="相关性得分")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="元数据")


class QASearchResult(BaseSchema):
    reference: QAReference = Field(..., description="引用信息")
    content: str = Field(..., description="检索到的内容")
    score: float = Field(..., description="相关性得分")
    retrieval_method: str = Field(..., description="检索方式: semantic/keyword/hybrid")


class QAQuestion(BaseSchema):
    question: str = Field(..., description="用户问题", min_length=1)
    paper_ids: Optional[List[str]] = Field(None, description="指定论文范围")
    conversation_id: Optional[str] = Field(None, description="会话ID，用于多轮对话")
    history: Optional[List[Dict[str, str]]] = Field(None, description="对话历史")
    top_k: int = Field(default=5, description="检索结果数量", ge=1, le=50)
    use_rerank: bool = Field(default=True, description="是否使用重排序")
    stream: bool = Field(default=False, description="是否流式输出")


class QAResponse(BaseSchema):
    answer: str = Field(..., description="回答内容")
    references: List[QAReference] = Field(default_factory=list, description="引用来源列表")
    conversation_id: str = Field(..., description="会话ID")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="元数据")


class QAHistoryItem(BaseSchema):
    question: str = Field(..., description="问题")
    answer: str = Field(..., description="回答")
    timestamp: datetime = Field(..., description="时间戳")


class QAOut(BaseSchema, TimestampMixin):
    id: int
    question: str
    answer: str
    context: Optional[str]
    paper_ids: List[str]
    metadata: Dict[str, Any]
    created_by: Optional[int]


class QACreate(BaseSchema):
    question: str = Field(..., description="问题")
    answer: str = Field(..., description="回答")
    context: Optional[str] = Field(None, description="上下文")
    paper_ids: Optional[List[str]] = Field(default_factory=list, description="论文ID列表")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="元数据")
    created_by: Optional[int] = Field(None, description="创建用户ID")

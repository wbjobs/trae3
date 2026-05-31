from sqlalchemy import Column, Integer, String, Text, JSON, ForeignKey, Index
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


CONTENT_TYPE_PAPER_TEXT = "paper_text"
CONTENT_TYPE_CHART_CAPTION = "chart_caption"
CONTENT_TYPE_CHART_DATA = "chart_data"
CONTENT_TYPE_TABLE_DATA = "table_data"

CONTENT_TYPES = [
    CONTENT_TYPE_PAPER_TEXT,
    CONTENT_TYPE_CHART_CAPTION,
    CONTENT_TYPE_CHART_DATA,
    CONTENT_TYPE_TABLE_DATA,
]


class Vector(BaseModel):
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=True, index=True)
    content_type = Column(String(50), nullable=False, index=True)
    content = Column(Text, nullable=False)
    metadata = Column(JSON, default=dict, nullable=False)
    vector_id = Column(String(100), nullable=False, unique=True, index=True)

    paper = relationship("Paper", back_populates="vectors")

    __table_args__ = (
        Index("idx_vector_paper_content", "paper_id", "content_type"),
    )

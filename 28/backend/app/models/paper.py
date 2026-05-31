from sqlalchemy import Column, String, Integer, Text, Enum, ForeignKey
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class PaperStatus(str, Enum):
    PENDING = "pending"
    PARSING = "parsing"
    COMPLETED = "completed"
    FAILED = "failed"


class Paper(BaseModel):
    __tablename__ = "papers"

    title = Column(String(500), index=True, nullable=True)
    authors = Column(String(1000), nullable=True)
    abstract = Column(Text, nullable=True)
    keywords = Column(String(500), nullable=True)
    total_pages = Column(Integer, nullable=True)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=True)
    parsed_content = Column(Text, nullable=True)
    status = Column(Enum(PaperStatus), default=PaperStatus.PENDING, nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    creator = relationship("User", backref="papers")
    vectors = relationship("Vector", back_populates="paper", cascade="all, delete-orphan")

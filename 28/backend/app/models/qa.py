from sqlalchemy import Column, String, Text, Integer, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class QA(BaseModel):
    __tablename__ = "qas"

    question = Column(Text, nullable=False, index=True)
    answer = Column(Text, nullable=False)
    context = Column(Text)
    paper_ids = Column(JSON, default=list)
    metadata = Column(JSON, default=dict)
    created_by = Column(Integer, ForeignKey("users.id"))

    user = relationship("User", backref="qas")

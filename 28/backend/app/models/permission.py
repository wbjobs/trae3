from sqlalchemy import Column, String, Text
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class Permission(BaseModel):
    __tablename__ = "permissions"

    name = Column(String(100), unique=True, index=True, nullable=False)
    code = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)

    roles = relationship("RolePermission", back_populates="permission", cascade="all, delete-orphan")

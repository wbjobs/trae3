from sqlalchemy import Column, String, Text
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class Role(BaseModel):
    __tablename__ = "roles"

    name = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)

    users = relationship("UserRole", back_populates="role", cascade="all, delete-orphan")
    permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")

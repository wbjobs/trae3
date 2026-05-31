from sqlalchemy import Column, String, Boolean
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class User(BaseModel):
    __tablename__ = "users"

    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(200))
    avatar_url = Column(String(500))
    is_superuser = Column(Boolean, default=False, nullable=False)

    roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")

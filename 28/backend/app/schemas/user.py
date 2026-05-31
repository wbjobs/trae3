from typing import Optional
from pydantic import EmailStr, Field

from app.schemas.base import BaseSchema, TimestampMixin


class UserBase(BaseSchema):
    email: EmailStr = Field(..., description="邮箱")
    username: str = Field(..., description="用户名", min_length=3, max_length=100)
    full_name: Optional[str] = Field(None, description="全名", max_length=200)
    avatar_url: Optional[str] = Field(None, description="头像URL", max_length=500)


class UserCreate(UserBase):
    password: str = Field(..., description="密码", min_length=6, max_length=128)


class UserUpdate(BaseSchema):
    email: Optional[EmailStr] = Field(None, description="邮箱")
    username: Optional[str] = Field(None, description="用户名", min_length=3, max_length=100)
    full_name: Optional[str] = Field(None, description="全名", max_length=200)
    avatar_url: Optional[str] = Field(None, description="头像URL", max_length=500)
    password: Optional[str] = Field(None, description="密码", min_length=6, max_length=128)
    is_active: Optional[bool] = Field(None, description="是否激活")


class UserLogin(BaseSchema):
    username: str = Field(..., description="用户名或邮箱")
    password: str = Field(..., description="密码")


class Token(BaseSchema):
    access_token: str = Field(..., description="访问令牌")
    refresh_token: str = Field(..., description="刷新令牌")
    token_type: str = Field(default="bearer", description="令牌类型")


class TokenPayload(BaseSchema):
    sub: Optional[int] = Field(None, description="用户ID")


class UserInfo(UserBase, TimestampMixin):
    id: int
    is_superuser: bool


class UserOut(UserInfo):
    pass

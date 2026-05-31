from typing import Optional, List
from pydantic import Field, EmailStr

from app.schemas.base import BaseSchema, TimestampMixin


class LoginRequest(BaseSchema):
    username: str = Field(..., description="用户名或邮箱", min_length=3, max_length=100)
    password: str = Field(..., description="密码", min_length=6, max_length=128)


class TokenResponse(BaseSchema):
    access_token: str = Field(..., description="访问令牌")
    refresh_token: str = Field(..., description="刷新令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(..., description="过期时间（秒）")


class RegisterRequest(BaseSchema):
    email: EmailStr = Field(..., description="邮箱")
    username: str = Field(..., description="用户名", min_length=3, max_length=100)
    password: str = Field(..., description="密码", min_length=6, max_length=128)
    full_name: Optional[str] = Field(None, description="全名", max_length=200)


class RefreshTokenRequest(BaseSchema):
    refresh_token: str = Field(..., description="刷新令牌")


class UserInfo(BaseSchema, TimestampMixin):
    id: int
    email: EmailStr
    username: str
    full_name: Optional[str]
    avatar_url: Optional[str]
    is_superuser: bool
    roles: List[str] = Field(default_factory=list, description="角色列表")
    permissions: List[str] = Field(default_factory=list, description="权限列表")


class LogoutRequest(BaseSchema):
    refresh_token: Optional[str] = Field(None, description="刷新令牌")

from typing import Optional, List
from pydantic import Field

from app.schemas.base import BaseSchema, TimestampMixin


class PermissionBase(BaseSchema):
    name: str = Field(..., description="权限名称", max_length=100)
    code: str = Field(..., description="权限编码", max_length=100)
    description: Optional[str] = Field(None, description="权限描述")


class PermissionCreate(PermissionBase):
    pass


class PermissionUpdate(BaseSchema):
    name: Optional[str] = Field(None, description="权限名称", max_length=100)
    code: Optional[str] = Field(None, description="权限编码", max_length=100)
    description: Optional[str] = Field(None, description="权限描述")
    is_active: Optional[bool] = Field(None, description="是否激活")


class PermissionInfo(PermissionBase, TimestampMixin):
    id: int


class PermissionOut(PermissionInfo):
    pass


class RoleBase(BaseSchema):
    name: str = Field(..., description="角色名称", max_length=100)
    description: Optional[str] = Field(None, description="角色描述")


class RoleCreate(RoleBase):
    permission_ids: Optional[List[int]] = Field(default_factory=list, description="权限ID列表")


class RoleUpdate(BaseSchema):
    name: Optional[str] = Field(None, description="角色名称", max_length=100)
    description: Optional[str] = Field(None, description="角色描述")
    is_active: Optional[bool] = Field(None, description="是否激活")
    permission_ids: Optional[List[int]] = Field(None, description="权限ID列表")


class RoleInfo(RoleBase, TimestampMixin):
    id: int
    permissions: List[PermissionInfo] = Field(default_factory=list, description="权限列表")


class RoleOut(RoleInfo):
    pass


class UserRoleAssign(BaseSchema):
    user_id: int = Field(..., description="用户ID")
    role_ids: List[int] = Field(..., description="角色ID列表")

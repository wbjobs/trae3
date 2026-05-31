from typing import List, Optional, Set
from sqlalchemy.orm import Session

from app.models import Role, Permission, UserRole, RolePermission, User
from app.schemas import RoleCreate, RoleUpdate, PermissionCreate, PermissionUpdate
from app.services.base import BaseService


PRESET_ROLES = {
    "超级管理员": {
        "description": "系统最高权限角色，拥有所有权限",
        "permissions": [
            "paper:upload", "paper:view",
            "chart:extract", "chart:view",
            "qa:ask",
            "user:manage", "role:manage",
        ],
    },
    "普通用户": {
        "description": "普通注册用户，拥有基础操作权限",
        "permissions": [
            "paper:upload", "paper:view",
            "chart:extract", "chart:view",
            "qa:ask",
        ],
    },
    "访客": {
        "description": "访客用户，仅有查看权限",
        "permissions": [
            "paper:view",
            "chart:view",
        ],
    },
}

PRESET_PERMISSIONS = [
    {"code": "paper:upload", "name": "论文上传", "description": "上传论文文档"},
    {"code": "paper:view", "name": "论文查看", "description": "查看论文内容"},
    {"code": "chart:extract", "name": "图表提取", "description": "提取论文中的图表"},
    {"code": "chart:view", "name": "图表查看", "description": "查看提取的图表"},
    {"code": "qa:ask", "name": "问答提问", "description": "向系统提问"},
    {"code": "user:manage", "name": "用户管理", "description": "管理用户账号"},
    {"code": "role:manage", "name": "角色管理", "description": "管理角色和权限"},
]


class RoleService(BaseService[Role, RoleCreate, RoleUpdate]):
    def __init__(self):
        super().__init__(Role)

    def create(self, db: Session, *, obj_in: RoleCreate) -> Role:
        db_role = Role(
            name=obj_in.name,
            description=obj_in.description,
        )
        db.add(db_role)
        db.flush()

        if obj_in.permission_ids:
            for perm_id in obj_in.permission_ids:
                rp = RolePermission(role_id=db_role.id, permission_id=perm_id)
                db.add(rp)

        db.commit()
        db.refresh(db_role)
        return db_role

    def update(self, db: Session, *, db_obj: Role, obj_in: RoleUpdate) -> Role:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)

        permission_ids = update_data.pop("permission_ids", None)

        for field, value in update_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)

        if permission_ids is not None:
            db.query(RolePermission).filter(RolePermission.role_id == db_obj.id).delete()
            for perm_id in permission_ids:
                rp = RolePermission(role_id=db_obj.id, permission_id=perm_id)
                db.add(rp)

        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def get_by_name(self, db: Session, *, name: str) -> Optional[Role]:
        return db.query(Role).filter(Role.name == name).first()

    def get_permissions(self, db: Session, *, role_id: int) -> List[Permission]:
        role_perms = db.query(RolePermission).filter(RolePermission.role_id == role_id).all()
        perm_ids = [rp.permission_id for rp in role_perms]
        return db.query(Permission).filter(Permission.id.in_(perm_ids)).all()

    def assign_permissions(self, db: Session, *, role_id: int, permission_ids: List[int]) -> Role:
        role = self.get(db, id=role_id)
        if not role:
            return None

        db.query(RolePermission).filter(RolePermission.role_id == role_id).delete()
        for perm_id in permission_ids:
            rp = RolePermission(role_id=role_id, permission_id=perm_id)
            db.add(rp)

        db.commit()
        db.refresh(role)
        return role

    def get_user_roles(self, db: Session, *, user_id: int) -> List[Role]:
        user_roles = db.query(UserRole).filter(UserRole.user_id == user_id).all()
        role_ids = [ur.role_id for ur in user_roles]
        return db.query(Role).filter(Role.id.in_(role_ids)).all()

    def assign_user_roles(self, db: Session, *, user_id: int, role_ids: List[int]) -> None:
        db.query(UserRole).filter(UserRole.user_id == user_id).delete()
        for role_id in role_ids:
            ur = UserRole(user_id=user_id, role_id=role_id)
            db.add(ur)
        db.commit()

    def get_user_permissions(self, db: Session, *, user_id: int) -> Set[str]:
        user_roles = self.get_user_roles(db, user_id=user_id)
        role_ids = [r.id for r in user_roles]

        if not role_ids:
            return set()

        role_perms = db.query(RolePermission).filter(RolePermission.role_id.in_(role_ids)).all()
        perm_ids = [rp.permission_id for rp in role_perms]

        if not perm_ids:
            return set()

        permissions = db.query(Permission).filter(Permission.id.in_(perm_ids)).all()
        return {p.code for p in permissions}

    def user_has_permission(self, db: Session, *, user_id: int, permission_code: str) -> bool:
        user = db.query(User).filter(User.id == user_id).first()
        if user and user.is_superuser:
            return True

        permissions = self.get_user_permissions(db, user_id=user_id)
        return permission_code in permissions

    def init_preset_data(self, db: Session) -> None:
        for perm_data in PRESET_PERMISSIONS:
            existing = db.query(Permission).filter(Permission.code == perm_data["code"]).first()
            if not existing:
                perm = Permission(**perm_data)
                db.add(perm)
        db.commit()

        for role_name, role_data in PRESET_ROLES.items():
            existing = db.query(Role).filter(Role.name == role_name).first()
            if not existing:
                role = Role(name=role_name, description=role_data["description"])
                db.add(role)
                db.flush()

                for perm_code in role_data["permissions"]:
                    perm = db.query(Permission).filter(Permission.code == perm_code).first()
                    if perm:
                        rp = RolePermission(role_id=role.id, permission_id=perm.id)
                        db.add(rp)
        db.commit()


class PermissionService(BaseService[Permission, PermissionCreate, PermissionUpdate]):
    def __init__(self):
        super().__init__(Permission)

    def get_by_code(self, db: Session, *, code: str) -> Optional[Permission]:
        return db.query(Permission).filter(Permission.code == code).first()


role_service = RoleService()
permission_service = PermissionService()

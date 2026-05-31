from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.models import User
from app.schemas import (
    RoleCreate,
    RoleUpdate,
    RoleOut,
    PermissionCreate,
    PermissionUpdate,
    PermissionOut,
    ResponseBase,
    PaginatedResponse,
)
from app.services import role_service, permission_service
from app.modules.auth import require_permission

router = APIRouter()


@router.get("/roles", response_model=PaginatedResponse[RoleOut])
@require_permission("role:manage")
async def get_roles(
    request: Request,
    page: int = 1,
    page_size: int = 100,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    skip = (page - 1) * page_size
    roles = role_service.get_multi(db, skip=skip, limit=page_size)
    total = role_service.count(db)
    total_pages = (total + page_size - 1) // page_size

    role_outs = []
    for role in roles:
        perms = role_service.get_permissions(db, role_id=role.id)
        role_dict = {
            "id": role.id,
            "name": role.name,
            "description": role.description,
            "created_at": role.created_at,
            "updated_at": role.updated_at,
            "is_active": role.is_active,
            "permissions": [PermissionOut.model_validate(p) for p in perms],
        }
        role_outs.append(RoleOut(**role_dict))

    return PaginatedResponse(
        code=200,
        message="获取角色列表成功",
        items=role_outs,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/roles/{role_id}", response_model=ResponseBase[RoleOut])
@require_permission("role:manage")
async def get_role(
    request: Request,
    role_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    role = role_service.get(db, id=role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在",
        )

    perms = role_service.get_permissions(db, role_id=role.id)
    role_dict = {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "created_at": role.created_at,
        "updated_at": role.updated_at,
        "is_active": role.is_active,
        "permissions": [PermissionOut.model_validate(p) for p in perms],
    }

    return ResponseBase(
        code=200,
        message="获取角色信息成功",
        data=RoleOut(**role_dict),
    )


@router.post("/roles", response_model=ResponseBase[RoleOut])
@require_permission("role:manage")
async def create_role(
    request: Request,
    role_data: RoleCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    existing = role_service.get_by_name(db, name=role_data.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="角色名称已存在",
        )

    if role_data.permission_ids:
        for perm_id in role_data.permission_ids:
            perm = permission_service.get(db, id=perm_id)
            if not perm:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"权限ID {perm_id} 不存在",
                )

    role = role_service.create(db, obj_in=role_data)

    perms = role_service.get_permissions(db, role_id=role.id)
    role_dict = {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "created_at": role.created_at,
        "updated_at": role.updated_at,
        "is_active": role.is_active,
        "permissions": [PermissionOut.model_validate(p) for p in perms],
    }

    return ResponseBase(
        code=200,
        message="创建角色成功",
        data=RoleOut(**role_dict),
    )


@router.put("/roles/{role_id}", response_model=ResponseBase[RoleOut])
@require_permission("role:manage")
async def update_role(
    request: Request,
    role_id: int,
    role_data: RoleUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    role = role_service.get(db, id=role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在",
        )

    if role_data.name and role_data.name != role.name:
        existing = role_service.get_by_name(db, name=role_data.name)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="角色名称已存在",
            )

    if role_data.permission_ids:
        for perm_id in role_data.permission_ids:
            perm = permission_service.get(db, id=perm_id)
            if not perm:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"权限ID {perm_id} 不存在",
                )

    role = role_service.update(db, db_obj=role, obj_in=role_data)

    perms = role_service.get_permissions(db, role_id=role.id)
    role_dict = {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "created_at": role.created_at,
        "updated_at": role.updated_at,
        "is_active": role.is_active,
        "permissions": [PermissionOut.model_validate(p) for p in perms],
    }

    return ResponseBase(
        code=200,
        message="更新角色成功",
        data=RoleOut(**role_dict),
    )


@router.delete("/roles/{role_id}", response_model=ResponseBase)
@require_permission("role:manage")
async def delete_role(
    request: Request,
    role_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    role = role_service.get(db, id=role_id)
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在",
        )

    if role.name in ["超级管理员", "普通用户", "访客"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能删除预置角色",
        )

    role_service.remove(db, id=role_id)

    return ResponseBase(
        code=200,
        message="删除角色成功",
    )


@router.get("/permissions", response_model=PaginatedResponse[PermissionOut])
@require_permission("role:manage")
async def get_permissions(
    request: Request,
    page: int = 1,
    page_size: int = 100,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    skip = (page - 1) * page_size
    permissions = permission_service.get_multi(db, skip=skip, limit=page_size)
    total = permission_service.count(db)
    total_pages = (total + page_size - 1) // page_size

    return PaginatedResponse(
        code=200,
        message="获取权限列表成功",
        items=[PermissionOut.model_validate(p) for p in permissions],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/permissions/{perm_id}", response_model=ResponseBase[PermissionOut])
@require_permission("role:manage")
async def get_permission(
    request: Request,
    perm_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    perm = permission_service.get(db, id=perm_id)
    if not perm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="权限不存在",
        )

    return ResponseBase(
        code=200,
        message="获取权限信息成功",
        data=PermissionOut.model_validate(perm),
    )


@router.post("/permissions", response_model=ResponseBase[PermissionOut])
@require_permission("role:manage")
async def create_permission(
    request: Request,
    perm_data: PermissionCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    existing = permission_service.get_by_code(db, code=perm_data.code)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="权限编码已存在",
        )

    perm = permission_service.create(db, obj_in=perm_data)

    return ResponseBase(
        code=200,
        message="创建权限成功",
        data=PermissionOut.model_validate(perm),
    )


@router.put("/permissions/{perm_id}", response_model=ResponseBase[PermissionOut])
@require_permission("role:manage")
async def update_permission(
    request: Request,
    perm_id: int,
    perm_data: PermissionUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    perm = permission_service.get(db, id=perm_id)
    if not perm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="权限不存在",
        )

    if perm_data.code and perm_data.code != perm.code:
        existing = permission_service.get_by_code(db, code=perm_data.code)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="权限编码已存在",
            )

    perm = permission_service.update(db, db_obj=perm, obj_in=perm_data)

    return ResponseBase(
        code=200,
        message="更新权限成功",
        data=PermissionOut.model_validate(perm),
    )


@router.delete("/permissions/{perm_id}", response_model=ResponseBase)
@require_permission("role:manage")
async def delete_permission(
    request: Request,
    perm_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    perm = permission_service.get(db, id=perm_id)
    if not perm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="权限不存在",
        )

    preset_codes = [
        "paper:upload", "paper:view",
        "chart:extract", "chart:view",
        "qa:ask",
        "user:manage", "role:manage",
    ]
    if perm.code in preset_codes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能删除预置权限",
        )

    permission_service.remove(db, id=perm_id)

    return ResponseBase(
        code=200,
        message="删除权限成功",
    )

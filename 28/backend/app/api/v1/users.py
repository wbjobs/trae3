from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.models import User
from app.schemas import (
    UserCreate,
    UserUpdate,
    UserOut,
    UserRoleAssign,
    ResponseBase,
    PaginatedResponse,
)
from app.services import user_service, role_service
from app.modules.auth import require_permission

router = APIRouter()


@router.get("", response_model=PaginatedResponse[UserOut])
@require_permission("user:manage")
async def get_users(
    request: Request,
    page: int = 1,
    page_size: int = 10,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    skip = (page - 1) * page_size
    users = user_service.get_multi(db, skip=skip, limit=page_size)
    total = user_service.count(db)
    total_pages = (total + page_size - 1) // page_size

    return PaginatedResponse(
        code=200,
        message="获取用户列表成功",
        items=[UserOut.model_validate(user) for user in users],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{user_id}", response_model=ResponseBase[UserOut])
@require_permission("user:manage")
async def get_user(
    request: Request,
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    user = user_service.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    return ResponseBase(
        code=200,
        message="获取用户信息成功",
        data=UserOut.model_validate(user),
    )


@router.post("", response_model=ResponseBase[UserOut])
@require_permission("user:manage")
async def create_user(
    request: Request,
    user_data: UserCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    existing = user_service.get_by_email(db, email=user_data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="邮箱已存在",
        )

    existing = user_service.get_by_username(db, username=user_data.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在",
        )

    user = user_service.create(db, obj_in=user_data)

    default_role = role_service.get_by_name(db, name="普通用户")
    if default_role:
        role_service.assign_user_roles(db, user_id=user.id, role_ids=[default_role.id])

    return ResponseBase(
        code=200,
        message="创建用户成功",
        data=UserOut.model_validate(user),
    )


@router.put("/{user_id}", response_model=ResponseBase[UserOut])
@require_permission("user:manage")
async def update_user(
    request: Request,
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    user = user_service.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    if user_data.email and user_data.email != user.email:
        existing = user_service.get_by_email(db, email=user_data.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="邮箱已存在",
            )

    if user_data.username and user_data.username != user.username:
        existing = user_service.get_by_username(db, username=user_data.username)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="用户名已存在",
            )

    user = user_service.update(db, db_obj=user, obj_in=user_data)

    return ResponseBase(
        code=200,
        message="更新用户成功",
        data=UserOut.model_validate(user),
    )


@router.delete("/{user_id}", response_model=ResponseBase)
@require_permission("user:manage")
async def delete_user(
    request: Request,
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    user = user_service.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能删除自己",
        )

    user_service.remove(db, id=user_id)

    return ResponseBase(
        code=200,
        message="删除用户成功",
    )


@router.post("/roles", response_model=ResponseBase)
@require_permission("user:manage")
async def assign_user_roles(
    request: Request,
    assign_data: UserRoleAssign,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    user = user_service.get(db, id=assign_data.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    for role_id in assign_data.role_ids:
        role = role_service.get(db, id=role_id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"角色ID {role_id} 不存在",
            )

    role_service.assign_user_roles(db, user_id=assign_data.user_id, role_ids=assign_data.role_ids)

    return ResponseBase(
        code=200,
        message="分配用户角色成功",
    )


@router.get("/{user_id}/roles", response_model=ResponseBase[List[str]])
@require_permission("user:manage")
async def get_user_roles(
    request: Request,
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    user = user_service.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    roles = role_service.get_user_roles(db, user_id=user_id)
    role_names = [r.name for r in roles]

    return ResponseBase(
        code=200,
        message="获取用户角色成功",
        data=role_names,
    )


@router.get("/{user_id}/permissions", response_model=ResponseBase[List[str]])
@require_permission("user:manage")
async def get_user_permissions(
    request: Request,
    user_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    user = user_service.get(db, id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    permissions = role_service.get_user_permissions(db, user_id=user_id)

    return ResponseBase(
        code=200,
        message="获取用户权限成功",
        data=sorted(list(permissions)),
    )

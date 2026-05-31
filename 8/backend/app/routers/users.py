from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.models.schemas import UserInfo, CreateUserRequest, UpdateUserRequest
from app.services.auth_service import list_users, create_user, update_user, delete_user
from app.middleware.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/users", tags=["users"])
security = HTTPBearer()


@router.get("")
async def get_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    user = await get_current_user(credentials)
    await require_admin(user)
    users, total = list_users(page, page_size)
    return {"items": users, "total": total}


@router.post("", response_model=UserInfo)
async def add_user(
    request: CreateUserRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    user = await get_current_user(credentials)
    await require_admin(user)
    new_user = create_user(request.username, request.password, request.role.value)
    if not new_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    return new_user


@router.put("/{user_id}", response_model=UserInfo)
async def edit_user(
    user_id: str,
    request: UpdateUserRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    current_user = await get_current_user(credentials)
    await require_admin(current_user)
    kwargs = {}
    if request.username is not None:
        kwargs["username"] = request.username
    if request.role is not None:
        kwargs["role"] = request.role.value
    if request.is_active is not None:
        kwargs["is_active"] = request.is_active
    updated = update_user(user_id, **kwargs)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return updated


@router.delete("/{user_id}")
async def remove_user(
    user_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    current_user = await get_current_user(credentials)
    await require_admin(current_user)
    delete_user(user_id)
    return {"message": "User deleted successfully"}
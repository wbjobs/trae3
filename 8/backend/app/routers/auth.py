from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.models.schemas import (
    LoginRequest, LoginResponse, UserInfo, ChangePasswordRequest,
)
from app.services.auth_service import authenticate_user, create_token, get_user_by_id, change_password
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    user = authenticate_user(request.username, request.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_token(user)
    return LoginResponse(access_token=token, user=user)


@router.get("/me", response_model=UserInfo)
async def get_me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = await get_current_user(credentials)
    return user


@router.post("/change-password")
async def change_pwd(
    request: ChangePasswordRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    user = await get_current_user(credentials)
    success = change_password(user.id, request.old_password, request.new_password)
    if not success:
        raise HTTPException(status_code=400, detail="Old password is incorrect")
    return {"message": "Password changed successfully"}
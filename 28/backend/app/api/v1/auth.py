from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.core import database
from app.models import User
from app.schemas import (
    LoginRequest,
    TokenResponse,
    RegisterRequest,
    RefreshTokenRequest,
    UserInfo,
    LogoutRequest,
    ResponseBase,
)
from app.modules.auth import auth_service, check_ip_whitelist
from app.services import role_service

router = APIRouter()


@router.on_event("startup")
async def startup_event():
    db = next(database.get_db())
    try:
        role_service.init_preset_data(db)
    finally:
        db.close()


@router.post("/login", response_model=ResponseBase[TokenResponse])
async def login(
    request: Request,
    login_data: LoginRequest,
    db: Session = Depends(deps.get_db),
):
    result = auth_service.login(db, request=login_data)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token, refresh_token, expires_in = result
    return ResponseBase(
        code=200,
        message="登录成功",
        data=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=expires_in,
        ),
    )


@router.post("/register", response_model=ResponseBase[TokenResponse])
async def register(
    request: Request,
    register_data: RegisterRequest,
    db: Session = Depends(deps.get_db),
):
    user = auth_service.register(db, request=register_data)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名或邮箱已存在",
        )

    login_request = LoginRequest(
        username=register_data.username,
        password=register_data.password,
    )
    result = auth_service.login(db, request=login_request)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="注册成功，但自动登录失败",
        )

    access_token, refresh_token, expires_in = result
    return ResponseBase(
        code=200,
        message="注册成功",
        data=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=expires_in,
        ),
    )


@router.post("/refresh", response_model=ResponseBase[TokenResponse])
async def refresh_token(
    request: Request,
    refresh_data: RefreshTokenRequest,
    db: Session = Depends(deps.get_db),
):
    result = auth_service.refresh_token(db, refresh_token=refresh_data.refresh_token)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的刷新令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token, new_refresh_token, expires_in = result
    return ResponseBase(
        code=200,
        message="令牌刷新成功",
        data=TokenResponse(
            access_token=access_token,
            refresh_token=new_refresh_token,
            token_type="bearer",
            expires_in=expires_in,
        ),
    )


@router.get("/me", response_model=ResponseBase[UserInfo])
async def get_current_user_info(
    request: Request,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    user_info = auth_service.get_user_info(db, user=current_user)
    return ResponseBase(
        code=200,
        message="获取用户信息成功",
        data=user_info,
    )


@router.post("/logout", response_model=ResponseBase)
async def logout(
    request: Request,
    logout_data: LogoutRequest,
    current_user: User = Depends(deps.get_current_active_user),
):
    auth_service.logout(refresh_token=logout_data.refresh_token)
    return ResponseBase(
        code=200,
        message="登出成功",
    )

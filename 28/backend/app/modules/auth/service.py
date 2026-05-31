from datetime import timedelta
from typing import Optional, Tuple, Set
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core import security
from app.models import User
from app.schemas import LoginRequest, RegisterRequest, UserInfo
from app.services import user_service, role_service


class AuthService:
    def __init__(self):
        self._invalidated_tokens: Set[str] = set()

    def login(self, db: Session, *, request: LoginRequest) -> Optional[Tuple[str, str, int]]:
        user = user_service.authenticate(
            db, username=request.username, password=request.password
        )
        if not user:
            return None

        if not user_service.is_active(user):
            return None

        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = security.create_access_token(
            subject=user.id,
            expires_delta=access_token_expires,
        )

        refresh_token = security.create_refresh_token(subject=user.id)

        expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

        return access_token, refresh_token, expires_in

    def register(self, db: Session, *, request: RegisterRequest) -> Optional[User]:
        existing_user = user_service.get_by_email(db, email=request.email)
        if existing_user:
            return None

        existing_user = user_service.get_by_username(db, username=request.username)
        if existing_user:
            return None

        user = user_service.create(db, obj_in=request)

        default_role = role_service.get_by_name(db, name="普通用户")
        if default_role:
            role_service.assign_user_roles(db, user_id=user.id, role_ids=[default_role.id])

        return user

    def refresh_token(self, db: Session, *, refresh_token: str) -> Optional[Tuple[str, str, int]]:
        if refresh_token in self._invalidated_tokens:
            return None

        payload = security.decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            return None

        user_id = payload.get("sub")
        if not user_id:
            return None

        try:
            user_id = int(user_id)
        except (ValueError, TypeError):
            return None

        user = user_service.get(db, id=user_id)
        if not user or not user_service.is_active(user):
            return None

        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = security.create_access_token(
            subject=user.id,
            expires_delta=access_token_expires,
        )

        new_refresh_token = security.create_refresh_token(subject=user.id)

        self._invalidated_tokens.add(refresh_token)

        expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

        return access_token, new_refresh_token, expires_in

    def logout(self, *, refresh_token: Optional[str] = None) -> None:
        if refresh_token:
            self._invalidated_tokens.add(refresh_token)

    def get_user_info(self, db: Session, *, user: User) -> UserInfo:
        roles = role_service.get_user_roles(db, user_id=user.id)
        role_names = [r.name for r in roles]

        permissions = role_service.get_user_permissions(db, user_id=user.id)

        return UserInfo(
            id=user.id,
            email=user.email,
            username=user.username,
            full_name=user.full_name,
            avatar_url=user.avatar_url,
            is_superuser=user.is_superuser,
            is_active=user.is_active,
            created_at=user.created_at,
            updated_at=user.updated_at,
            roles=role_names,
            permissions=sorted(list(permissions)),
        )


auth_service = AuthService()

from typing import List, Callable, Optional
from functools import wraps
from ipaddress import ip_address, ip_network

from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.api import deps
from app.models import User
from app.services import role_service
from app.core.config import settings


INTERNAL_IP_WHITELIST = [
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "127.0.0.1/32",
    "::1/128",
]


def _is_internal_ip(client_ip: str) -> bool:
    try:
        ip = ip_address(client_ip)
        for network_str in INTERNAL_IP_WHITELIST:
            if ip in ip_network(network_str):
                return True
    except ValueError:
        return False
    return False


def check_ip_whitelist(request: Request) -> None:
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not _is_internal_ip(client_ip):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="访问被拒绝：仅允许内网IP访问",
        )


def require_permission(permission_code: str) -> Callable:
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(
            *args,
            db: Session = Depends(deps.get_db),
            current_user: User = Depends(deps.get_current_active_user),
            **kwargs,
        ):
            if current_user.is_superuser:
                return await func(*args, db=db, current_user=current_user, **kwargs)

            if not role_service.user_has_permission(
                db, user_id=current_user.id, permission_code=permission_code
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"权限不足：需要 {permission_code} 权限",
                )

            return await func(*args, db=db, current_user=current_user, **kwargs)

        return wrapper

    return decorator


def require_roles(role_names: List[str]) -> Callable:
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(
            *args,
            db: Session = Depends(deps.get_db),
            current_user: User = Depends(deps.get_current_active_user),
            **kwargs,
        ):
            if current_user.is_superuser:
                return await func(*args, db=db, current_user=current_user, **kwargs)

            user_roles = role_service.get_user_roles(db, user_id=current_user.id)
            user_role_names = {r.name for r in user_roles}

            if not any(role in user_role_names for role in role_names):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"权限不足：需要以下角色之一 {role_names}",
                )

            return await func(*args, db=db, current_user=current_user, **kwargs)

        return wrapper

    return decorator

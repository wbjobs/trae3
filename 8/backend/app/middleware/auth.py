from fastapi import Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from app.config import JWT_SECRET, JWT_ALGORITHM
from app.models.schemas import UserInfo

security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials) -> UserInfo:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return UserInfo(
            id=payload["id"],
            username=payload["username"],
            role=payload["role"],
            is_active=payload["is_active"],
            created_at=payload["created_at"],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: UserInfo) -> UserInfo:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

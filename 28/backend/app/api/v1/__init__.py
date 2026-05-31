from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.roles import router as roles_router
from app.api.v1.paper import router as paper_router
from app.api.v1.vision import router as vision_router
from app.api.v1.vector import router as vector_router
from app.api.v1.chart import router as chart_router
from app.api.v1.qa import router as qa_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix="/auth", tags=["认证"])
api_router.include_router(users_router, prefix="/users", tags=["用户管理"])
api_router.include_router(roles_router, prefix="/roles", tags=["角色管理"])
api_router.include_router(paper_router)
api_router.include_router(vision_router)
api_router.include_router(vector_router)
api_router.include_router(chart_router)
api_router.include_router(qa_router, tags=["问答"])

__all__ = ["api_router"]

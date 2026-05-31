from fastapi import APIRouter

from app.api.tenant_routes import router as tenant_router
from app.api.device_routes import router as device_router
from app.api.push_routes import router as push_router
from app.api.scheduler_routes import router as scheduler_router
from app.api.statistics_routes import router as statistics_router

api_router = APIRouter()

api_router.include_router(tenant_router)
api_router.include_router(device_router)
api_router.include_router(push_router)
api_router.include_router(scheduler_router)
api_router.include_router(statistics_router)

__all__ = ["api_router"]

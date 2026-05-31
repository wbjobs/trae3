from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db, get_device_db, get_message_log_db
from app.tenant.dependencies import get_tenant_id
from app.statistics.service import statistics_service
from app.api.schemas import StatisticsResponse

router = APIRouter(prefix="/statistics", tags=["statistics"])


@router.get("/dashboard", response_model=StatisticsResponse)
async def get_dashboard_overview(tenant_id: str = Depends(get_tenant_id)):
    return statistics_service.get_dashboard_overview(tenant_id)


@router.get("/devices")
def get_device_statistics(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_device_db)
):
    return statistics_service.get_device_statistics(tenant_id, db)


@router.get("/messages")
def get_message_statistics(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_message_log_db)
):
    return statistics_service.get_message_statistics(tenant_id, db)


@router.get("/messages/trend")
def get_message_trend(
    days: int = 7,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_message_log_db)
):
    return statistics_service.get_message_trend(tenant_id, db, days)


@router.get("/scheduler")
def get_scheduler_statistics(
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_db)
):
    return statistics_service.get_scheduler_statistics(tenant_id, db)

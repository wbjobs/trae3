from typing import Optional
from fastapi import APIRouter, Query

from ..db.database import db
from ..schemas.models import ApiResponse

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=ApiResponse)
async def get_alerts(
    startTime: Optional[int] = Query(None),
    endTime: Optional[int] = Query(None),
    level: Optional[str] = Query(None, pattern="^(critical|warning|info)$"),
    limit: int = Query(100, ge=1, le=1000)
):
    alerts = db.query_alerts(
        start_time=startTime,
        end_time=endTime,
        level=level,
        limit=limit
    )
    return ApiResponse(data=alerts)


@router.get("/stats", response_model=ApiResponse)
async def get_alert_stats(
    startTime: Optional[int] = Query(None),
    endTime: Optional[int] = Query(None)
):
    stats = db.get_alert_stats(
        start_time=startTime,
        end_time=endTime
    )
    return ApiResponse(data=stats)

from typing import Optional
from fastapi import APIRouter, Query

from ..db.database import db
from ..schemas.models import ApiResponse
from ..services.metrics_engine import metrics_engine

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/list", response_model=ApiResponse)
async def get_metrics():
    data = db.get_metric_definitions()
    return ApiResponse(data=data)


@router.get("/sources", response_model=ApiResponse)
async def get_sources():
    data = db.get_data_sources()
    return ApiResponse(data=data)


@router.get("/stats", response_model=ApiResponse)
async def get_metric_stats(
    startTime: int,
    endTime: int,
    metric: str,
    source: Optional[str] = Query(None)
):
    stats = db.get_metric_stats(
        start_time=startTime,
        end_time=endTime,
        metric=metric,
        source=source
    )
    return ApiResponse(data=stats)


@router.get("/summary", response_model=ApiResponse)
async def get_metric_summary(
    metric: str,
    source: Optional[str] = Query(None)
):
    summary = metrics_engine.get_metric_summary(metric, source)
    return ApiResponse(data=summary)


@router.get("/latest-values", response_model=ApiResponse)
async def get_latest_values():
    values = metrics_engine.get_latest_values()
    return ApiResponse(data=values)

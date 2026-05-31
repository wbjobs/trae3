from fastapi import APIRouter
from typing import Optional

from ..schemas.models import ApiResponse, ArchiveStats, ArchiveRequest
from ..services.data_archiver import data_archiver
from ..core.config import settings

router = APIRouter(prefix="/archive", tags=["archive"])


@router.get("/stats", response_model=ApiResponse)
async def get_archive_stats():
    stats = await data_archiver.get_archive_stats()
    return ApiResponse(data=stats)


@router.post("/trigger", response_model=ApiResponse)
async def trigger_archive():
    result = await data_archiver.archive_data()
    return ApiResponse(data=result)


@router.post("/query", response_model=ApiResponse)
async def query_archive(request: ArchiveRequest):
    if request.startTime is None or request.endTime is None:
        return ApiResponse(code=400, message="startTime and endTime are required")

    if request.aggregation and request.aggregation != "raw":
        data = data_archiver.query_archive_aggregated(
            tier=request.tier,
            start_time=request.startTime,
            end_time=request.endTime,
            metric=request.metrics[0] if request.metrics else "",
            aggregation=request.aggregation
        )
        return ApiResponse(data={request.metrics[0]: data} if request.metrics else {"data": data})
    else:
        data = data_archiver.query_archive_data(
            tier=request.tier,
            start_time=request.startTime,
            end_time=request.endTime,
            metrics=request.metrics,
            sources=request.sources,
            limit=request.limit or 5000
        )
        return ApiResponse(data=data)


@router.get("/status", response_model=ApiResponse)
async def get_system_status():
    stats = await data_archiver.get_archive_stats()

    now = int(__import__("time").time() * 1000)
    hot_threshold = now - 24 * 3600 * 1000
    warm_threshold = now - 7 * 24 * 3600 * 1000

    data_tier = "hot"
    if stats["hot_data_count"] < 100 and stats["warm_data_count"] > 0:
        data_tier = "warm"
    elif stats["warm_data_count"] < 100 and stats["cold_data_count"] > 0:
        data_tier = "cold"

    return ApiResponse(data={
        "total_pipelines": 6,
        "active_pipelines": 6,
        "total_regions": 4,
        "active_alarms": stats["hot_data_count"] > 0 and 0 or 0,
        "system_health": 95,
        "data_tier": data_tier,
        "generate_mock_data": settings.GENERATE_MOCK_DATA,
        "anomaly_detection_enabled": settings.ANOMALY_DETECTION_ENABLED,
    })

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel

from ..database import get_db
from ..schemas import ApiResponse, TimeSeriesQueryParams, KeyMetrics
from ..services.data_processor import data_processor_service
from ..services.cache_service import cache_service

router = APIRouter(prefix="/data", tags=["数据查询"])


class IncrementalQueryParams(TimeSeriesQueryParams):
    last_timestamp: Optional[int] = None


class BatchQueryParams(BaseModel):
    queries: List[TimeSeriesQueryParams]


@router.post("/timeseries", response_model=ApiResponse)
async def get_time_series_data(params: TimeSeriesQueryParams):
    try:
        data = await data_processor_service.get_time_series_data(
            component_ids=params.component_ids,
            metrics=params.metrics,
            start_time=params.start_time,
            end_time=params.end_time,
            step=params.step,
            downsample=params.downsample,
            pre_aggregate=getattr(params, 'pre_aggregate', None),
            offset=getattr(params, 'offset', 0),
            limit=getattr(params, 'limit', None),
        )
        return ApiResponse(data=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/timeseries/incremental", response_model=ApiResponse)
async def get_time_series_incremental(params: IncrementalQueryParams):
    try:
        effective_start = params.last_timestamp or params.start_time
        data = await data_processor_service.get_time_series_data(
            component_ids=params.component_ids,
            metrics=params.metrics,
            start_time=effective_start,
            end_time=params.end_time,
            step=params.step,
            downsample=params.downsample
        )
        return ApiResponse(data=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/timeseries/batch", response_model=ApiResponse)
async def get_time_series_batch(params: BatchQueryParams):
    try:
        results = []
        for query in params.queries:
            data = await data_processor_service.get_time_series_data(
                component_ids=query.component_ids,
                metrics=query.metrics,
                start_time=query.start_time,
                end_time=query.end_time,
                step=query.step,
                downsample=query.downsample
            )
            results.append(data)
        return ApiResponse(data=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/components", response_model=ApiResponse)
def get_component_list(
    array_id: Optional[str] = None,
    group_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    try:
        components = data_processor_service.get_component_list(
            db=db,
            array_id=array_id,
            group_id=group_id,
            status=status
        )
        return ApiResponse(data=components)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics", response_model=ApiResponse)
async def get_key_metrics(
    time_range: str = "24h",
    group_id: Optional[str] = None
):
    try:
        metrics = await data_processor_service.get_key_metrics(
            time_range=time_range,
            group_id=group_id
        )
        return ApiResponse(data=metrics)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cache/stats", response_model=ApiResponse)
def get_cache_stats():
    try:
        stats = cache_service.get_stats()
        return ApiResponse(data=stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/clear", response_model=ApiResponse)
def clear_cache():
    try:
        cache_service.clear()
        return ApiResponse(data={"cleared": True})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query

from ..db.database import db
from ..schemas.models import QueryParams, MetricData, MetricDataBatch, ApiResponse
from ..services.metrics_engine import metrics_engine
from ..services.ws_manager import ws_manager

router = APIRouter(prefix="/data", tags=["data"])


@router.post("/ingest", response_model=ApiResponse)
async def ingest_data(data: MetricData):
    result = metrics_engine.process_data(data)
    await ws_manager.broadcast_data(result)
    return ApiResponse(data=result)


@router.post("/ingest/batch", response_model=ApiResponse)
async def ingest_batch(batch: MetricDataBatch):
    results = metrics_engine.process_batch(batch.data)
    for result in results:
        await ws_manager.broadcast_data(result)
    return ApiResponse(data={"processed": len(results)})


@router.post("/query", response_model=ApiResponse)
async def query_data(params: QueryParams):
    if params.aggregation and params.aggregation != "raw" and params.metrics and len(params.metrics) == 1:
        metric = params.metrics[0]
        source = params.sources[0] if params.sources and len(params.sources) == 1 else None
        data = db.query_aggregated_data(
            start_time=params.startTime,
            end_time=params.endTime,
            metric=metric,
            aggregation=params.aggregation,
            source=source
        )
        return ApiResponse(data=data)

    data = db.query_metric_data(
        start_time=params.startTime,
        end_time=params.endTime,
        metrics=params.metrics,
        sources=params.sources,
        only_anomalies=params.onlyAnomalies,
        limit=params.limit
    )
    return ApiResponse(data=data)


@router.get("/latest", response_model=ApiResponse)
async def get_latest_data(
    metric: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000)
):
    data = db.get_latest_data(metric=metric, source=source, limit=limit)
    return ApiResponse(data=data)

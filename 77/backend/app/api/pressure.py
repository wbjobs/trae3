import time
from fastapi import APIRouter, HTTPException
from typing import Optional

from ..schemas.models import (
    ApiResponse, PressureAnalysisResult, PipelineData,
    RegionData, CorrelationResult, HeatmapPoint
)
from ..services.pressure_monitor import pressure_monitor
from ..services.metrics_engine import metrics_engine
from ..db.database import db

router = APIRouter(prefix="/pressure", tags=["pressure"])


@router.get("/pipelines", response_model=ApiResponse)
async def get_pipelines():
    pipelines = pressure_monitor.get_all_pipelines()
    return ApiResponse(data=pipelines)


@router.get("/pipelines/{pipeline_id}", response_model=ApiResponse)
async def get_pipeline(pipeline_id: str):
    pipeline = pressure_monitor.get_pipeline_status(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return ApiResponse(data=pipeline)


@router.get("/regions", response_model=ApiResponse)
async def get_regions():
    regions = pressure_monitor.get_all_regions()
    return ApiResponse(data=regions)


@router.get("/regions/{region_name}", response_model=ApiResponse)
async def get_region(region_name: str):
    region = pressure_monitor.get_region_summary(region_name)
    if not region:
        raise HTTPException(status_code=404, detail="Region not found")
    return ApiResponse(data=region)


@router.get("/heatmap", response_model=ApiResponse)
async def get_heatmap(metric: Optional[str] = "pressure"):
    heatmap_data = pressure_monitor.get_heatmap_data(metric)
    return ApiResponse(data=heatmap_data)


@router.get("/correlation", response_model=ApiResponse)
async def get_correlation(pipeline_a: str, pipeline_b: str):
    result = pressure_monitor.get_correlation_analysis(pipeline_a, pipeline_b)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return ApiResponse(data=result)


@router.post("/analyze", response_model=ApiResponse)
async def analyze_pressure(pipeline: str, pressure: float, flow_rate: float):
    analysis = pressure_monitor.update(pipeline, pressure, flow_rate)

    if analysis.is_anomaly:
        alert = pressure_monitor.create_alert(pipeline, analysis, pressure)
        if alert:
            db.insert_alert(alert.model_dump())

    return ApiResponse(data=analysis.model_dump())


@router.get("/alerts/active", response_model=ApiResponse)
async def get_active_alerts():
    now = int(time.time() * 1000)
    one_hour_ago = now - 3600 * 1000
    alerts = db.query_alerts(start_time=one_hour_ago, end_time=now, limit=50)
    pressure_alerts = [a for a in alerts if a.get("metric", "").startswith("pressure_")]
    return ApiResponse(data=pressure_alerts)


@router.get("/trend/{pipeline_id}", response_model=ApiResponse)
async def get_pressure_trend(pipeline_id: str, hours: Optional[int] = 1):
    now = int(time.time() * 1000)
    start = now - hours * 3600 * 1000

    pressure_data = db.query_aggregated_data(
        start, now, metric="pressure",
        source=pipeline_id, aggregation="1m"
    )
    flow_data = db.query_aggregated_data(
        start, now, metric="flow_rate",
        source=pipeline_id, aggregation="1m"
    )

    return ApiResponse(data={
        "pressure": pressure_data,
        "flow_rate": flow_data,
        "pipeline": pipeline_id
    })

from fastapi import APIRouter, HTTPException
from typing import List, Optional

from backend.models.schemas import DataQuery, FilterParams, FaultAlert, MetricResult
from backend.services.tsdb import tsdb_service
from backend.services.metrics import metrics_calculator
from backend.services.fault import fault_detector

router = APIRouter(prefix="/api", tags=["data"])


@router.post("/data/query")
async def query_data(query: DataQuery):
    results = await tsdb_service.query(query)
    return {"status": "ok", "data": results, "count": len(results)}


@router.get("/data/latest/{device_id}")
async def get_latest_data(device_id: str, limit: int = 100):
    results = await tsdb_service.get_latest(device_id, limit)
    return {"status": "ok", "data": results}


@router.get("/metrics/{device_id}")
async def get_metrics(device_id: str):
    metrics = metrics_calculator.compute_metrics(device_id)
    return {"status": "ok", "data": [m.model_dump() for m in metrics], "buffer_size": metrics_calculator.get_buffer_size(device_id)}


@router.post("/faults/query")
async def query_faults(params: FilterParams):
    alerts = await fault_detector.query_alerts(params)
    return {"status": "ok", "data": [a.model_dump() for a in alerts], "count": len(alerts)}


@router.put("/faults/{alert_id}/acknowledge")
async def acknowledge_fault(alert_id: str):
    success = await fault_detector.acknowledge(alert_id)
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "ok", "message": "Alert acknowledged"}


@router.get("/faults/stats")
async def get_fault_stats():
    stats = await fault_detector.get_stats()
    return {"status": "ok", "data": stats}


@router.get("/devices")
async def list_devices():
    return {
        "status": "ok",
        "data": [
            {"id": "pump-001", "name": "1号水泵", "type": "pump"},
            {"id": "motor-002", "name": "2号电机", "type": "motor"},
            {"id": "compressor-003", "name": "3号压缩机", "type": "compressor"},
            {"id": "fan-004", "name": "4号风机", "type": "fan"},
        ]
    }

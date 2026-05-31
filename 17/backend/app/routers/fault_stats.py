from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

from ..database import get_db
from ..schemas import ApiResponse, FaultQueryParams
from ..services.fault_detector import fault_detector_service
from ..services.data_processor import data_processor_service

router = APIRouter(prefix="/fault", tags=["故障统计"])

class FaultDetectParams(BaseModel):
    component_ids: List[str]
    start_time: int
    end_time: int


class WarningThreshold(BaseModel):
    metric: str
    warning_low: Optional[float] = None
    warning_high: Optional[float] = None
    critical_low: Optional[float] = None
    critical_high: Optional[float] = None


class WarningDetectParams(BaseModel):
    component_ids: List[str]
    start_time: int
    end_time: int
    thresholds: List[WarningThreshold]


class WarningConfigModel(BaseModel):
    thresholds: List[WarningThreshold]
    enabled: bool = True
    auto_mark: bool = True


DEFAULT_WARNING_CONFIG = WarningConfigModel(
    thresholds=[
        WarningThreshold(metric="voltage", warning_low=280.0, warning_high=450.0, critical_low=250.0, critical_high=500.0),
        WarningThreshold(metric="current", warning_low=2.0, warning_high=15.0, critical_low=1.0, critical_high=18.0),
        WarningThreshold(metric="temperature", warning_high=65.0, critical_high=80.0),
    ],
    enabled=True,
    auto_mark=True
)

warning_config_store = DEFAULT_WARNING_CONFIG


@router.post("/list", response_model=ApiResponse)
def get_fault_list(params: FaultQueryParams, db: Session = Depends(get_db)):
    try:
        fault_list, total = fault_detector_service.get_fault_list(db, params)
        return ApiResponse(data={"list": fault_list, "total": total})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/statistics", response_model=ApiResponse)
def get_fault_statistics(
    start_time: int,
    end_time: int,
    group_by: str = "type",
    db: Session = Depends(get_db)
):
    try:
        stats = fault_detector_service.get_fault_statistics(
            db=db,
            start_time=start_time,
            end_time=end_time,
            group_by=group_by
        )
        return ApiResponse(data=stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap", response_model=ApiResponse)
def get_fault_heatmap(
    start_time: int,
    end_time: int,
    db: Session = Depends(get_db)
):
    try:
        heatmap_data = fault_detector_service.get_fault_heatmap(
            db=db,
            start_time=start_time,
            end_time=end_time
        )
        return ApiResponse(data=heatmap_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detect", response_model=ApiResponse)
async def detect_faults(
    params: FaultDetectParams
):
    try:
        faults = await fault_detector_service.detect_faults(
            component_ids=params.component_ids,
            start_time=params.start_time,
            end_time=params.end_time
        )
        return ApiResponse(data=faults)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mock", response_model=ApiResponse)
def create_mock_faults(count: int = 20, db: Session = Depends(get_db)):
    try:
        fault_detector_service.create_mock_faults(db, count)
        return ApiResponse(message=f"Created {count} mock faults")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/warning/config", response_model=ApiResponse)
def get_warning_config():
    try:
        return ApiResponse(data=warning_config_store)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/warning/config", response_model=ApiResponse)
def update_warning_config(config: WarningConfigModel):
    global warning_config_store
    try:
        warning_config_store = config
        return ApiResponse(data=config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/warning/detect", response_model=ApiResponse)
async def detect_warnings(params: WarningDetectParams):
    try:
        metrics = [t.metric for t in params.thresholds]
        
        data_result = await data_processor_service.get_time_series_data(
            component_ids=params.component_ids,
            metrics=metrics,
            start_time=params.start_time,
            end_time=params.end_time,
            step="5m",
            downsample=False
        )
        
        components_data = data_result.get("components", {})
        warnings = []
        
        threshold_map = {t.metric: t for t in params.thresholds}
        
        for component_id, component_data in components_data.items():
            for metric in metrics:
                points = getattr(component_data, metric, [])
                threshold = threshold_map.get(metric)
                if not threshold or not points:
                    continue
                
                for point in points:
                    value = point.value
                    timestamp = point.timestamp
                    
                    if threshold.critical_high is not None and value > threshold.critical_high:
                        warnings.append({
                            "timestamp": timestamp,
                            "componentId": component_id,
                            "metric": metric,
                            "value": value,
                            "threshold": threshold.critical_high,
                            "level": "critical",
                            "type": f"{metric}_high_critical",
                            "description": f"{metric} 严重过高: {value:.2f} > {threshold.critical_high}"
                        })
                    elif threshold.warning_high is not None and value > threshold.warning_high:
                        warnings.append({
                            "timestamp": timestamp,
                            "componentId": component_id,
                            "metric": metric,
                            "value": value,
                            "threshold": threshold.warning_high,
                            "level": "warning",
                            "type": f"{metric}_high_warning",
                            "description": f"{metric} 过高: {value:.2f} > {threshold.warning_high}"
                        })
                    
                    if threshold.critical_low is not None and value < threshold.critical_low:
                        warnings.append({
                            "timestamp": timestamp,
                            "componentId": component_id,
                            "metric": metric,
                            "value": value,
                            "threshold": threshold.critical_low,
                            "level": "critical",
                            "type": f"{metric}_low_critical",
                            "description": f"{metric} 严重过低: {value:.2f} < {threshold.critical_low}"
                        })
                    elif threshold.warning_low is not None and value < threshold.warning_low:
                        warnings.append({
                            "timestamp": timestamp,
                            "componentId": component_id,
                            "metric": metric,
                            "value": value,
                            "threshold": threshold.warning_low,
                            "level": "warning",
                            "type": f"{metric}_low_warning",
                            "description": f"{metric} 过低: {value:.2f} < {threshold.warning_low}"
                        })
        
        return ApiResponse(data=warnings)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

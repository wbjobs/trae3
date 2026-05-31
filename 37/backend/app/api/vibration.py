from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from app.core.database import get_db
from app.models.schemas import (
    VibrationDataCreate, VibrationDataResponse,
    TimeRangeQuery, AnalysisQuery
)
from app.services.crud_service import CRUDService
from app.services.timeseries_calculator import TimeSeriesCalculator
from app.services.anomaly_detector import AnomalyDetector
from app.services.query_cache import (
    DataAggregator,
    vibration_query_cache,
    analysis_query_cache
)

router = APIRouter(prefix="/vibration", tags=["vibration"])


@router.post("/data")
def create_vibration_data(data: VibrationDataCreate, db: Session = Depends(get_db)):
    crud = CRUDService(db)
    return crud.create_vibration_data(data)


@router.post("/data/batch")
def create_vibration_data_batch(data_list: List[VibrationDataCreate], db: Session = Depends(get_db)):
    crud = CRUDService(db)
    count = crud.create_vibration_data_batch(data_list)
    return {"inserted_count": count}


@router.get("/data")
def get_vibration_data(
    device_code: str,
    start_time: datetime,
    end_time: datetime,
    skip: int = 0,
    limit: int = 10000,
    use_sampling: bool = Query(True, description="是否启用数据库端采样"),
    db: Session = Depends(get_db)
):
    crud = CRUDService(db)

    if use_sampling and limit > 2000:
        data = crud.get_vibration_data_sampled(
            device_code, start_time, end_time, max_points=min(limit, 5000)
        )
        return {
            "data": data,
            "sampled": True,
            "original_count": crud.get_vibration_data_count(device_code, start_time, end_time),
            "sampled_count": len(data)
        }

    data, from_cache = crud.get_vibration_data(
        device_code, start_time, end_time, skip, limit
    )
    return {
        "data": data,
        "from_cache": from_cache,
        "count": len(data)
    }


@router.get("/data/paginated")
def get_vibration_data_paginated(
    device_code: str,
    start_time: datetime,
    end_time: datetime,
    page: int = 1,
    page_size: int = 10000,
    db: Session = Depends(get_db)
):
    crud = CRUDService(db)
    return crud.get_vibration_data_paginated(
        device_code, start_time, end_time, page, page_size
    )


@router.get("/data/aggregated")
def get_aggregated_vibration_data(
    device_code: str,
    start_time: datetime,
    end_time: datetime,
    aggregation: str = Query("1min", description="聚合粒度: 1s, 10s, 30s, 1min, 5min, 15min, 1hour"),
    include_fft: bool = Query(False, description="是否包含FFT分析"),
    use_cache: bool = True,
    db: Session = Depends(get_db)
):
    params = {
        "method": "get_aggregated",
        "device_code": device_code,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "aggregation": aggregation,
        "include_fft": include_fft
    }

    if use_cache:
        cached = analysis_query_cache.get(params)
        if cached is not None:
            return {**cached, "from_cache": True}

    aggregator = DataAggregator(db)
    result = aggregator.aggregate_vibration_data(
        device_code, start_time, end_time, aggregation, include_fft
    )

    if use_cache and result["original_count"] > 0:
        analysis_query_cache.set(params, result)

    return {**result, "from_cache": False}


@router.post("/analyze")
def analyze_vibration_data(
    query: AnalysisQuery,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    crud = CRUDService(db)

    count = crud.get_vibration_data_count(
        query.device_code, query.start_time, query.end_time
    )

    if count == 0:
        raise HTTPException(status_code=404, detail="No data found for analysis")

    if count > 50000:
        vibration_data = crud.get_vibration_data_sampled(
            query.device_code, query.start_time, query.end_time, max_points=50000
        )
    else:
        vibration_data, _ = crud.get_vibration_data(
            query.device_code, query.start_time, query.end_time, 0, 50000
        )

    if not vibration_data:
        raise HTTPException(status_code=404, detail="No data found for analysis")

    analysis_result = TimeSeriesCalculator.analyze_vibration_data(vibration_data)

    background_tasks.add_task(crud.create_analysis_result, analysis_result)

    return {
        **analysis_result,
        "analyzed_points": len(vibration_data),
        "total_points": count
    }


@router.post("/detect-anomalies")
def detect_anomalies(
    query: AnalysisQuery,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    crud = CRUDService(db)

    count = crud.get_vibration_data_count(
        query.device_code, query.start_time, query.end_time
    )

    if count == 0:
        raise HTTPException(status_code=404, detail="No data found")

    if count > 50000:
        vibration_data = crud.get_vibration_data_sampled(
            query.device_code, query.start_time, query.end_time, max_points=50000
        )
    else:
        vibration_data, _ = crud.get_vibration_data(
            query.device_code, query.start_time, query.end_time, 0, 50000
        )

    if not vibration_data:
        raise HTTPException(status_code=404, detail="No data found")

    analysis_result = TimeSeriesCalculator.analyze_vibration_data(vibration_data)

    detector = AnomalyDetector()
    anomalies = detector.comprehensive_anomaly_detection(vibration_data, analysis_result)

    for anomaly in anomalies:
        background_tasks.add_task(crud.create_anomaly_record, anomaly)

    fault_type, severity = AnomalyDetector.classify_anomaly_type(
        analysis_result, anomalies
    )

    return {
        "analysis": analysis_result,
        "anomalies": anomalies,
        "fault_diagnosis": {
            "fault_type": fault_type,
            "severity": severity
        },
        "analyzed_points": len(vibration_data),
        "total_points": count
    }


@router.get("/cache/stats")
def get_cache_stats():
    return {
        "vibration_cache": vibration_query_cache.get_stats(),
        "analysis_cache": analysis_query_cache.get_stats()
    }


@router.post("/cache/clear")
def clear_cache():
    vibration_query_cache.clear()
    analysis_query_cache.clear()
    return {"message": "Cache cleared successfully"}


@router.get("/analysis-results")
def get_analysis_results(
    device_code: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    crud = CRUDService(db)
    return crud.get_analysis_results(device_code, start_time, end_time, skip, limit)

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
import numpy as np

from app.core.database import get_db
from app.services.fault_predictor import (
    get_fault_predictor,
    FaultPredictionResult,
    PredictionMethod,
    FaultSeverity
)
from app.services.data_archiver import get_data_archiver, ArchiveStats, ArchiveConfig
from app.services.streaming_processor import get_streaming_processor
from app.services.crud_service import CRUDService
from app.models import VibrationData, VibrationAggregation

router = APIRouter(prefix="/api/advanced", tags=["advanced"])


class PredictionRequest(BaseModel):
    device_code: str
    metric: str = Field(default="rms", description="预测指标: rms, peak, kurtosis")
    method: str = Field(default="exponential_smoothing", description="预测方法")
    forecast_steps: int = Field(default=24, ge=1, le=168, description="预测步数")
    hours_of_history: int = Field(default=168, ge=24, le=720, description="历史数据小时数")
    failure_threshold: Optional[float] = None


class ArchiveRequest(BaseModel):
    device_code: Optional[str] = None
    hot_data_days: int = Field(default=7, ge=1, le=30)
    enable_csv_backup: bool = True
    enable_aggregation: bool = True


def prediction_result_to_dict(result: FaultPredictionResult) -> Dict[str, Any]:
    return {
        "device_code": result.device_code,
        "prediction_method": result.prediction_method,
        "historical_points": result.historical_points,
        "forecast_points": result.forecast_steps,
        "predictions": [
            {
                "timestamp": p.timestamp.isoformat(),
                "predicted_value": p.predicted_value,
                "lower_bound": p.lower_bound,
                "upper_bound": p.upper_bound,
                "confidence": p.confidence,
                "method": p.method
            }
            for p in result.predictions
        ],
        "trend_analysis": {
            "trend_slope": result.trend_analysis.trend_slope,
            "trend_direction": result.trend_analysis.trend_direction,
            "trend_strength": result.trend_analysis.trend_strength,
            "acceleration": result.trend_analysis.acceleration,
            "volatility": result.trend_analysis.volatility
        } if result.trend_analysis else None,
        "rul_prediction": {
            "estimated_failure_date": result.rul_prediction.estimated_failure_date.isoformat()
            if result.rul_prediction.estimated_failure_date else None,
            "remaining_useful_life_hours": result.rul_prediction.remaining_useful_life_hours,
            "confidence": result.rul_prediction.confidence,
            "failure_threshold": result.rul_prediction.failure_threshold
        } if result.rul_prediction else None,
        "current_severity": result.current_severity.value,
        "predicted_severity": result.predicted_severity.value,
        "warnings": result.warnings,
        "model_metrics": result.model_metrics
    }


@router.post("/predict")
async def predict_fault(
    request: PredictionRequest,
    db: Session = Depends(get_db)
):
    try:
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=request.hours_of_history)

        crud = CRUDService(db)
        data = crud.get_vibration_data(
            device_code=request.device_code,
            start_time=start_time,
            end_time=end_time
        )

        if not data or len(data) < 5:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient data for prediction. Found {len(data)} points, need at least 5."
            )

        timestamps = [d.timestamp for d in data]

        if request.metric == "rms":
            values = np.array([
                np.sqrt(d.x_axis ** 2 + d.y_axis ** 2 + d.z_axis ** 2)
                for d in data
            ])
        elif request.metric == "peak":
            values = np.array([
                max(abs(d.x_axis), abs(d.y_axis), abs(d.z_axis))
                for d in data
            ])
        elif request.metric == "kurtosis":
            import pandas as pd
            window_size = min(100, len(data) // 10)
            values = pd.Series([
                np.sqrt(d.x_axis ** 2 + d.y_axis ** 2 + d.z_axis ** 2)
                for d in data
            ]).rolling(window=window_size).kurt().fillna(3).values
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported metric: {request.metric}. Use 'rms', 'peak', or 'kurtosis'."
            )

        try:
            method_enum = PredictionMethod(request.method)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported method: {request.method}. "
                       f"Use one of: {[m.value for m in PredictionMethod]}"
            )

        predictor = get_fault_predictor()
        result = predictor.predict(
            device_code=request.device_code,
            timestamps=timestamps,
            values=values,
            metric=request.metric,
            method=method_enum,
            forecast_steps=request.forecast_steps,
            failure_threshold=request.failure_threshold
        )

        return {
            "success": True,
            "data": prediction_result_to_dict(result)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


@router.post("/predict/ensemble")
async def predict_ensemble(
    request: PredictionRequest,
    db: Session = Depends(get_db)
):
    try:
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=request.hours_of_history)

        crud = CRUDService(db)
        data = crud.get_vibration_data(
            device_code=request.device_code,
            start_time=start_time,
            end_time=end_time
        )

        if not data or len(data) < 5:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient data for prediction. Found {len(data)} points, need at least 5."
            )

        timestamps = [d.timestamp for d in data]
        values = np.array([
            np.sqrt(d.x_axis ** 2 + d.y_axis ** 2 + d.z_axis ** 2)
            for d in data
        ])

        predictor = get_fault_predictor()
        results = predictor.predict_with_multiple_methods(
            device_code=request.device_code,
            timestamps=timestamps,
            values=values,
            metric=request.metric,
            forecast_steps=request.forecast_steps
        )

        combined = predictor.get_combined_prediction(results)

        return {
            "success": True,
            "data": {
                "ensemble": prediction_result_to_dict(combined),
                "individual": {
                    method: prediction_result_to_dict(result)
                    for method, result in results.items()
                }
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ensemble prediction error: {str(e)}")


@router.post("/archive/run")
async def run_archive(
    request: ArchiveRequest,
    db: Session = Depends(get_db)
):
    try:
        config = ArchiveConfig(
            hot_data_days=request.hot_data_days,
            enable_csv_backup=request.enable_csv_backup,
            enable_aggregation=request.enable_aggregation
        )
        archiver = get_data_archiver(db, config)
        stats = archiver.archive_old_data(device_code=request.device_code)

        return {
            "success": True,
            "data": {
                "hot_record_count": stats.hot_record_count,
                "cold_record_count": stats.cold_record_count,
                "archived_count": stats.archived_count,
                "csv_file_count": stats.csv_file_count,
                "aggregated_count": stats.aggregated_count,
                "last_archive_time": stats.last_archive_time.isoformat() if stats.last_archive_time else None,
                "next_archive_time": stats.next_archive_time.isoformat() if stats.next_archive_time else None
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Archive error: {str(e)}")


@router.get("/archive/stats")
async def get_archive_stats(
    device_code: Optional[str] = None,
    db: Session = Depends(get_db)
):
    try:
        archiver = get_data_archiver(db)
        stats = archiver.get_stats()

        return {
            "success": True,
            "data": {
                "hot_record_count": stats.hot_record_count,
                "cold_record_count": stats.cold_record_count,
                "last_archive_time": stats.last_archive_time.isoformat() if stats.last_archive_time else None,
                "next_archive_time": stats.next_archive_time.isoformat() if stats.next_archive_time else None,
                "cutoff_date": archiver.get_cutoff_date().isoformat(),
                "config": {
                    "hot_data_days": archiver.config.hot_data_days,
                    "cold_data_days": archiver.config.cold_data_days,
                    "archive_dir": archiver.config.archive_dir,
                    "cold_db_path": archiver.config.cold_db_path
                }
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Archive stats error: {str(e)}")


@router.post("/archive/restore")
async def restore_from_cold(
    device_code: str,
    start_time: datetime,
    end_time: datetime,
    db: Session = Depends(get_db)
):
    try:
        archiver = get_data_archiver(db)
        restored_count = archiver.restore_from_cold(device_code, start_time, end_time)

        return {
            "success": True,
            "data": {
                "restored_count": restored_count,
                "device_code": device_code,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore error: {str(e)}")


@router.get("/streaming/stats")
async def get_streaming_stats():
    try:
        processor = get_streaming_processor()
        stats = processor.get_stats()

        return {
            "success": True,
            "data": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Streaming stats error: {str(e)}")


@router.post("/streaming/process")
async def process_streaming_data(
    data_points: List[Dict[str, Any]],
    background_tasks: BackgroundTasks
):
    try:
        processor = get_streaming_processor()

        if not processor._is_initialized:
            await processor.initialize()

        processed = []
        for point in data_points:
            point['timestamp'] = datetime.fromisoformat(point['timestamp'].replace('Z', '+00:00'))
            closed = await processor.process_data_point(point)
            processed.append({
                "point": point,
                "windows_closed": len(closed)
            })

        return {
            "success": True,
            "data": {
                "processed_count": len(processed),
                "details": processed
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Streaming process error: {str(e)}")


@router.get("/aggregations")
async def get_aggregations(
    device_code: str,
    start_time: datetime,
    end_time: datetime,
    metric_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    try:
        query = db.query(VibrationAggregation).filter(
            VibrationAggregation.device_code == device_code,
            VibrationAggregation.time_bucket >= start_time,
            VibrationAggregation.time_bucket < end_time
        )

        if metric_name:
            query = query.filter(VibrationAggregation.metric_name == metric_name)

        aggregations = query.order_by(VibrationAggregation.time_bucket).all()

        return {
            "success": True,
            "data": [
                {
                    "id": agg.id,
                    "device_code": agg.device_code,
                    "time_bucket": agg.time_bucket.isoformat(),
                    "window_size": str(agg.window_size),
                    "metric_name": agg.metric_name,
                    "mean_value": agg.mean_value,
                    "max_value": agg.max_value,
                    "min_value": agg.min_value,
                    "std_value": agg.std_value,
                    "count": agg.count,
                    "rms_value": agg.rms_value,
                    "peak_value": agg.peak_value,
                    "crest_factor": agg.crest_factor,
                    "kurtosis": agg.kurtosis,
                    "p50": agg.p50,
                    "p95": agg.p95,
                    "p99": agg.p99
                }
                for agg in aggregations
            ],
            "total": len(aggregations)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Aggregations query error: {str(e)}")


@router.get("/query/combined")
async def query_hot_and_cold(
    device_code: str,
    start_time: datetime,
    end_time: datetime,
    include_cold: bool = True,
    db: Session = Depends(get_db)
):
    try:
        archiver = get_data_archiver(db)
        data = archiver.query_hot_and_cold(
            device_code=device_code,
            start_time=start_time,
            end_time=end_time,
            include_cold=include_cold
        )

        hot_count = sum(1 for d in data if d.get('storage_type') == 'hot')
        cold_count = sum(1 for d in data if d.get('storage_type') == 'cold')

        for d in data:
            if isinstance(d.get('timestamp'), datetime):
                d['timestamp'] = d['timestamp'].isoformat()

        return {
            "success": True,
            "data": data,
            "summary": {
                "total_count": len(data),
                "hot_count": hot_count,
                "cold_count": cold_count,
                "time_range": {
                    "start": start_time.isoformat(),
                    "end": end_time.isoformat()
                }
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Combined query error: {str(e)}")


@router.get("/methods")
async def get_available_methods():
    return {
        "success": True,
        "data": {
            "prediction_methods": [m.value for m in PredictionMethod],
            "metrics": ["rms", "peak", "kurtosis"],
            "severity_levels": [s.value for s in FaultSeverity]
        }
    }

from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.core.database import get_db
from app.services.data_collection_service import DataCollector

router = APIRouter(prefix="/data-collection", tags=["data-collection"])


@router.post("/generate-historical")
def generate_historical_data(
    device_code: str,
    days: int = 7,
    anomaly_probability: float = 0.05,
    db: Session = Depends(get_db)
):
    collector = DataCollector(db)
    end_time = datetime.now()
    start_time = end_time - timedelta(days=days)

    total = collector.generate_historical_data(
        device_code=device_code,
        start_time=start_time,
        end_time=end_time,
        interval_seconds=60,
        anomaly_probability=anomaly_probability
    )

    return {
        "message": f"Generated {total} records",
        "device_code": device_code,
        "time_range": f"{start_time} to {end_time}"
    }


@router.post("/generate-sample")
def generate_sample_data(
    device_code: str,
    duration_seconds: float = 1.0,
    has_anomaly: bool = False,
    anomaly_type: str = "impact",
    db: Session = Depends(get_db)
):
    collector = DataCollector(db)
    data_list = collector.generate_simulated_vibration(
        device_code=device_code,
        base_frequency=50.0,
        amplitude=1.0,
        noise_level=0.1,
        sample_rate=1000,
        duration=duration_seconds,
        has_anomaly=has_anomaly,
        anomaly_type=anomaly_type
    )

    collector.crud_service.create_vibration_data_batch(data_list)

    return {
        "message": f"Generated {len(data_list)} sample records",
        "device_code": device_code,
        "has_anomaly": has_anomaly,
        "anomaly_type": anomaly_type
    }

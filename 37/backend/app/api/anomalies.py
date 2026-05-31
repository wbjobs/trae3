from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from app.core.database import get_db
from app.models.schemas import AnomalyRecordResponse
from app.services.crud_service import CRUDService

router = APIRouter(prefix="/anomalies", tags=["anomalies"])


@router.get("/", response_model=list[AnomalyRecordResponse])
def get_anomalies(
    device_code: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    crud = CRUDService(db)
    return crud.get_anomaly_records(
        device_code, start_time, end_time, severity, status, skip, limit
    )


@router.post("/{anomaly_id}/handle")
def handle_anomaly(
    anomaly_id: int,
    handled_by: str,
    notes: str = "",
    db: Session = Depends(get_db)
):
    crud = CRUDService(db)
    result = crud.handle_anomaly(anomaly_id, handled_by, notes)
    if not result:
        raise HTTPException(status_code=404, detail="Anomaly record not found")
    return result


@router.get("/stats")
def get_anomaly_stats(
    device_code: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    crud = CRUDService(db)
    anomalies = crud.get_anomaly_records(
        device_code, start_time, end_time, limit=10000
    )

    stats = {
        "total": len(anomalies),
        "by_severity": {},
        "by_type": {},
        "by_status": {},
        "pending_count": 0
    }

    for a in anomalies:
        stats["by_severity"][a.severity] = stats["by_severity"].get(a.severity, 0) + 1
        stats["by_type"][a.anomaly_type] = stats["by_type"].get(a.anomaly_type, 0) + 1
        stats["by_status"][a.status] = stats["by_status"].get(a.status, 0) + 1
        if a.status == "pending":
            stats["pending_count"] += 1

    return stats

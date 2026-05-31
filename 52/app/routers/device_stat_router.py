from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import ApiResponse, DailyStatisticOut, DeviceCreate, DeviceOut, StatQueryParams
from app.services import device_service, statistic_service

router = APIRouter(prefix="/api/v1", tags=["设备与统计"])


@router.post("/devices", response_model=ApiResponse)
def create_device(data: DeviceCreate, db: Session = Depends(get_db)):
    existing = device_service.get_device_by_sn(db, data.device_sn)
    if existing:
        raise HTTPException(status_code=400, detail="Device SN already exists")
    device = device_service.create_device(db, data)
    return ApiResponse(data=DeviceOut.model_validate(device).model_dump())


@router.get("/devices", response_model=ApiResponse)
def list_devices(
    product_model: str | None = None,
    region: str | None = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    devices = device_service.list_devices(db, product_model, region, skip, limit)
    return ApiResponse(data=[DeviceOut.model_validate(d).model_dump() for d in devices])


@router.get("/devices/{device_id}", response_model=ApiResponse)
def get_device(device_id: str, db: Session = Depends(get_db)):
    device = device_service.get_device(db, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return ApiResponse(data=DeviceOut.model_validate(device).model_dump())


@router.get("/statistics/daily", response_model=ApiResponse)
def get_daily_statistics(
    version_id: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    db: Session = Depends(get_db),
):
    params = StatQueryParams(version_id=version_id, start_date=start_date, end_date=end_date)
    stats = statistic_service.get_daily_statistics(db, params)
    return ApiResponse(data=[DailyStatisticOut.model_validate(s).model_dump() for s in stats])


@router.post("/statistics/refresh", response_model=ApiResponse)
def refresh_statistics(stat_date: str | None = None, db: Session = Depends(get_db)):
    stats = statistic_service.refresh_daily_statistics(db, stat_date)
    return ApiResponse(
        message="Statistics refreshed",
        data=[DailyStatisticOut.model_validate(s).model_dump() for s in stats],
    )


@router.get("/statistics/summary/{version_id}", response_model=ApiResponse)
def get_version_summary(version_id: str, db: Session = Depends(get_db)):
    summary = statistic_service.get_version_summary(db, version_id)
    return ApiResponse(data=summary)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.schemas import (
    DeviceCreate, DeviceUpdate, DeviceResponse
)
from app.services.crud_service import CRUDService

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("/", response_model=DeviceResponse)
def create_device(device_data: DeviceCreate, db: Session = Depends(get_db)):
    crud = CRUDService(db)
    existing = crud.get_device_by_code(device_data.device_code)
    if existing:
        raise HTTPException(status_code=400, detail="Device code already exists")
    return crud.create_device(device_data)


@router.get("/", response_model=List[DeviceResponse])
def get_devices(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    crud = CRUDService(db)
    return crud.get_all_devices(skip, limit)


@router.get("/{device_id}", response_model=DeviceResponse)
def get_device(device_id: int, db: Session = Depends(get_db)):
    crud = CRUDService(db)
    device = crud.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.get("/code/{device_code}", response_model=DeviceResponse)
def get_device_by_code(device_code: str, db: Session = Depends(get_db)):
    crud = CRUDService(db)
    device = crud.get_device_by_code(device_code)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.put("/{device_id}", response_model=DeviceResponse)
def update_device(device_id: int, device_data: DeviceUpdate, db: Session = Depends(get_db)):
    crud = CRUDService(db)
    device = crud.update_device(device_id, device_data)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.delete("/{device_id}")
def delete_device(device_id: int, db: Session = Depends(get_db)):
    crud = CRUDService(db)
    success = crud.delete_device(device_id)
    if not success:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"message": "Device deleted successfully"}

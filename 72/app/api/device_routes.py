import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_device_db
from app.tenant.dependencies import get_tenant_id
from app.device.models import Device
from app.api.schemas import DeviceCreate, DeviceResponse

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("/", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
def create_device(
    device_data: DeviceCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_device_db)
):
    existing_device = db.query(Device).filter(
        Device.device_code == device_data.device_code,
        Device.tenant_id == tenant_id
    ).first()

    if existing_device:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Device with this code already exists"
        )

    device = Device(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        device_code=device_data.device_code,
        device_name=device_data.device_name,
        device_type=device_data.device_type,
        manufacturer=device_data.manufacturer,
        model=device_data.model,
        location=device_data.location,
        tags=device_data.tags
    )

    db.add(device)
    db.commit()
    db.refresh(device)

    return device


@router.get("/{device_id}", response_model=DeviceResponse)
def get_device(
    device_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_device_db)
):
    device = db.query(Device).filter(
        Device.id == device_id,
        Device.tenant_id == tenant_id
    ).first()

    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )
    return device


@router.get("/", response_model=List[DeviceResponse])
def list_devices(
    skip: int = 0,
    limit: int = 100,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_device_db)
):
    devices = db.query(Device).filter(
        Device.tenant_id == tenant_id
    ).offset(skip).limit(limit).all()
    return devices


@router.put("/{device_id}", response_model=DeviceResponse)
def update_device(
    device_id: str,
    device_data: DeviceCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_device_db)
):
    device = db.query(Device).filter(
        Device.id == device_id,
        Device.tenant_id == tenant_id
    ).first()

    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )

    for key, value in device_data.model_dump(exclude_unset=True).items():
        setattr(device, key, value)

    db.commit()
    db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Session = Depends(get_device_db)
):
    device = db.query(Device).filter(
        Device.id == device_id,
        Device.tenant_id == tenant_id
    ).first()

    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found"
        )

    db.delete(device)
    db.commit()

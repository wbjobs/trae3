from sqlalchemy.orm import Session

from app.cache import device_cache
from app.models import Device
from app.repository import DeviceRepository
from app.schemas import DeviceCreate


def create_device(db: Session, data: DeviceCreate) -> Device:
    repo = DeviceRepository(db)
    existing = repo.get_by_sn(data.device_sn)
    if existing:
        raise ValueError("Device SN already exists")
    device = repo.create(**data.model_dump())
    db.commit()
    db.refresh(device)
    device_cache.delete(f"device:sn:{data.device_sn}")
    return device


def get_device(db: Session, device_id: str) -> Device | None:
    repo = DeviceRepository(db)
    return repo.get_by_id(device_id)


def get_device_by_sn(db: Session, device_sn: str) -> Device | None:
    repo = DeviceRepository(db)
    return repo.get_by_sn(device_sn)


def list_devices(
    db: Session,
    product_model: str | None = None,
    region: str | None = None,
    is_online: bool | None = None,
    skip: int = 0,
    limit: int = 20,
) -> list[Device]:
    repo = DeviceRepository(db)
    return repo.list_by_filters(product_model, region, is_online, skip, limit)


def update_device_version(db: Session, device_id: str, new_version: str) -> Device | None:
    repo = DeviceRepository(db)
    device = repo.get_by_id(device_id)
    if not device:
        return None
    repo.update(device, current_version=new_version)
    db.commit()
    db.refresh(device)
    device_cache.delete(f"device:sn:{device.device_sn}")
    return device

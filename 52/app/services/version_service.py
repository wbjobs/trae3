import logging

from sqlalchemy.orm import Session

from app.cache import version_cache
from app.models import FirmwareVersion, VersionStatus
from app.repository import VersionRepository
from app.schemas import FirmwareVersionCreate, VersionStatusUpdate

logger = logging.getLogger(__name__)


def create_version(db: Session, data: FirmwareVersionCreate) -> FirmwareVersion:
    repo = VersionRepository(db)
    existing = repo.get_by_code(data.version_code)
    if existing:
        raise ValueError("Version code already exists")
    version = repo.create(**data.model_dump())
    db.commit()
    db.refresh(version)
    version_cache.delete(f"version:code:{data.version_code}")
    return version


def get_version(db: Session, version_id: str) -> FirmwareVersion | None:
    repo = VersionRepository(db)
    return repo.get_by_id(version_id)


def get_version_by_code(db: Session, version_code: str) -> FirmwareVersion | None:
    repo = VersionRepository(db)
    return repo.get_by_code(version_code)


def list_versions(
    db: Session,
    product_model: str | None = None,
    status: VersionStatus | None = None,
    skip: int = 0,
    limit: int = 20,
) -> list[FirmwareVersion]:
    repo = VersionRepository(db)
    if status:
        versions = repo.list_by_status([status], skip, limit)
    else:
        versions = repo.list_all(skip, limit)
    if product_model:
        versions = [v for v in versions if v.product_model == product_model]
    return versions


def update_version_status(db: Session, version_id: str, data: VersionStatusUpdate) -> FirmwareVersion | None:
    repo = VersionRepository(db)
    version = get_version(db, version_id)
    if not version:
        return None

    valid_transitions = {
        VersionStatus.DRAFT: [VersionStatus.TESTING],
        VersionStatus.TESTING: [VersionStatus.GRAYSCALE, VersionStatus.DRAFT],
        VersionStatus.GRAYSCALE: [VersionStatus.RELEASED, VersionStatus.TESTING],
        VersionStatus.RELEASED: [VersionStatus.DEPRECATED, VersionStatus.ROLLED_BACK],
        VersionStatus.ROLLED_BACK: [VersionStatus.TESTING],
        VersionStatus.DEPRECATED: [],
    }

    allowed = valid_transitions.get(version.status, [])
    if data.status not in allowed:
        raise ValueError(f"Cannot transition from {version.status.value} to {data.status.value}")

    repo.update(version, status=data.status)
    db.commit()
    db.refresh(version)
    version_cache.delete(f"version:code:{version.version_code}")
    return version


def delete_version(db: Session, version_id: str) -> bool:
    repo = VersionRepository(db)
    version = get_version(db, version_id)
    if not version:
        return False
    if version.status not in (VersionStatus.DRAFT, VersionStatus.DEPRECATED):
        raise ValueError("Only DRAFT or DEPRECATED versions can be deleted")
    version_code = version.version_code
    repo.delete(version)
    db.commit()
    version_cache.delete(f"version:code:{version_code}")
    return True

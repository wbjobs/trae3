import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import (
    Device,
    FirmwareVersion,
    UpgradeRecord,
    UpgradeStatus,
    VersionStatus,
)
from app.repository import DeviceRepository, UpgradeRecordRepository, VersionRepository
from app.schemas import PushRequest, RollbackRequest, UpgradeStatusUpdate
from app.services import grayscale_service, retry_service

logger = logging.getLogger(__name__)

_BATCH_SIZE = 200


def push_upgrade(db: Session, data: PushRequest) -> list[UpgradeRecord]:
    version_repo = VersionRepository(db)
    version = version_repo.get_by_id(data.version_id)
    if not version:
        raise ValueError("Version not found")
    if version.status not in (VersionStatus.RELEASED, VersionStatus.GRAYSCALE):
        raise ValueError("Version must be RELEASED or GRAYSCALE to push")

    target_device_ids = set()

    if data.device_ids:
        target_device_ids.update(data.device_ids)
    else:
        if version.status == VersionStatus.GRAYSCALE:
            grayscale_ids = grayscale_service.match_grayscale_devices(db, version.id)
            target_device_ids.update(grayscale_ids)
        else:
            device_repo = DeviceRepository(db)
            filters = {"product_model": version.product_model}
            if data.region:
                filters["region"] = data.region
            devices = device_repo.list_by_filters(**filters, limit=50000)
            target_device_ids.update(d.id for d in devices)

    if not target_device_ids:
        raise ValueError("No target devices found")

    record_repo = UpgradeRecordRepository(db)
    existing_records = record_repo.list_active_by_device_ids(list(target_device_ids), version.id)
    target_device_ids -= set(existing_records.keys())

    if not target_device_ids:
        raise ValueError("All target devices already have active upgrade tasks")

    device_ids_list = list(target_device_ids)
    records = []

    for i in range(0, len(device_ids_list), _BATCH_SIZE):
        batch_ids = device_ids_list[i : i + _BATCH_SIZE]
        device_repo = DeviceRepository(db)
        device_map = device_repo.list_by_ids(batch_ids)

        batch_records = []
        for device_id in batch_ids:
            device = device_map.get(device_id)
            if not device:
                continue
            record = UpgradeRecord(
                device_id=device_id,
                version_id=version.id,
                from_version=device.current_version,
                to_version=version.version_code,
                status=UpgradeStatus.PENDING,
                started_at=datetime.utcnow(),
            )
            db.add(record)
            batch_records.append(record)

        try:
            db.flush()
        except Exception:
            db.rollback()
            logger.exception("Flush failed for batch starting at index %d", i)
            continue

        records.extend(batch_records)

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Commit failed during push_upgrade")
        raise

    for r in records:
        try:
            db.refresh(r)
        except Exception:
            logger.exception("Refresh failed for record %s", r.id)

    logger.info("Push upgrade: version=%s, targets=%d, new_records=%d", version.version_code, len(target_device_ids), len(records))
    return records


def update_upgrade_status(db: Session, record_id: str, data: UpgradeStatusUpdate) -> UpgradeRecord | None:
    record_repo = UpgradeRecordRepository(db)
    record = record_repo.get_by_id(record_id)
    if not record:
        return None

    record.status = data.status
    record.error_message = data.error_message

    if data.status in (UpgradeStatus.SUCCESS, UpgradeStatus.FAILED, UpgradeStatus.ROLLED_BACK):
        record.completed_at = datetime.utcnow()

    if data.status == UpgradeStatus.SUCCESS:
        device_repo = DeviceRepository(db)
        device = device_repo.get_by_id(record.device_id)
        if device:
            device.current_version = record.to_version
    elif data.status == UpgradeStatus.FAILED:
        retry_service.enqueue_retry(db, record, data.error_message)

    try:
        db.commit()
        db.refresh(record)
    except Exception:
        db.rollback()
        logger.exception("Commit failed during update_upgrade_status for record %s", record_id)
        raise

    return record


def rollback_upgrade(db: Session, data: RollbackRequest) -> list[UpgradeRecord]:
    version_repo = VersionRepository(db)
    version = version_repo.get_by_id(data.version_id)
    if not version:
        raise ValueError("Version not found")

    if not data.device_ids:
        raise ValueError("device_ids must not be empty for rollback")

    records = db.query(UpgradeRecord).filter(
        UpgradeRecord.version_id == data.version_id,
        UpgradeRecord.device_id.in_(data.device_ids),
        UpgradeRecord.status == UpgradeStatus.SUCCESS,
    ).all()

    rolled_back = []
    for record in records:
        record.status = UpgradeStatus.ROLLED_BACK
        record.completed_at = datetime.utcnow()
        device_repo = DeviceRepository(db)
        device = device_repo.get_by_id(record.device_id)
        if device:
            device.current_version = record.from_version
        rolled_back.append(record)

    if rolled_back:
        version.status = VersionStatus.ROLLED_BACK

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Commit failed during rollback_upgrade")
        raise

    for r in rolled_back:
        try:
            db.refresh(r)
        except Exception:
            logger.exception("Refresh failed for record %s during rollback", r.id)

    logger.info("Rollback: version=%s, devices=%d", version.version_code, len(rolled_back))
    return rolled_back


def get_upgrade_records(
    db: Session,
    device_id: str | None = None,
    version_id: str | None = None,
    status: UpgradeStatus | None = None,
    skip: int = 0,
    limit: int = 20,
) -> list[UpgradeRecord]:
    record_repo = UpgradeRecordRepository(db)
    q = db.query(UpgradeRecord)
    if device_id:
        q = q.filter(UpgradeRecord.device_id == device_id)
    if version_id:
        q = q.filter(UpgradeRecord.version_id == version_id)
    if status:
        q = q.filter(UpgradeRecord.status == status)
    return q.order_by(UpgradeRecord.created_at.desc()).offset(skip).limit(limit).all()

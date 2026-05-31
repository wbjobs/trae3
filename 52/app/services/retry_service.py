import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import (
    Device,
    RetryQueue,
    RetryStatus,
    UpgradeRecord,
    UpgradeStatus,
    VersionStatus,
)
from app.repository import DeviceRepository, RetryQueueRepository, UpgradeRecordRepository
from app.schemas import UpgradeStatusUpdate
from app.services import upgrade_service

logger = logging.getLogger(__name__)

_MAX_RETRY_INTERVAL_HOURS = 24


def _calculate_next_retry(retry_count: int) -> datetime:
    backoff = min(30 * (2 ** retry_count), 60 * _MAX_RETRY_INTERVAL_HOURS)
    return datetime.utcnow() + timedelta(seconds=backoff)


def enqueue_retry(db: Session, record: UpgradeRecord, error_message: str = "") -> RetryQueue | None:
    if record.retry_count >= record.max_retries:
        record.status = UpgradeStatus.FAILED
        record.error_message = f"Max retries ({record.max_retries}) exceeded: {error_message}"
        record.completed_at = datetime.utcnow()
        db.commit()
        return None

    repo = RetryQueueRepository(db)
    existing = repo.get_active_for_device(record.device_id, record.version_id)
    if existing:
        return existing

    priority = 100 if record.status == UpgradeStatus.DOWNLOADING else 50

    queue_item = repo.create(
        device_id=record.device_id,
        version_id=record.version_id,
        upgrade_record_id=record.id,
        status=RetryStatus.PENDING,
        retry_count=record.retry_count,
        max_retries=record.max_retries,
        next_retry_at=_calculate_next_retry(record.retry_count),
        last_error=error_message,
        priority=priority,
    )

    record.retry_count += 1
    record.last_retry_at = datetime.utcnow()
    db.commit()
    db.refresh(queue_item)
    return queue_item


def process_due_retries(db: Session, batch_size: int = 100) -> list[RetryQueue]:
    repo = RetryQueueRepository(db)
    device_repo = DeviceRepository(db)
    record_repo = UpgradeRecordRepository(db)

    due_items = repo.list_due_retry(batch_size)
    processed = []

    for item in due_items:
        item.status = RetryStatus.RETRYING
        item.retry_count += 1
        item.next_retry_at = _calculate_next_retry(item.retry_count)

        device = device_repo.get_by_id(item.device_id)
        if not device or not device.is_online:
            item.status = RetryStatus.PENDING
            item.next_retry_at = _calculate_next_retry(item.retry_count)
            db.flush()
            continue

        record = record_repo.get_by_id(item.upgrade_record_id)
        if not record:
            item.status = RetryStatus.FAILED
            item.last_error = "Upgrade record not found"
            db.flush()
            continue

        if record.status in (UpgradeStatus.SUCCESS, UpgradeStatus.ROLLED_BACK):
            item.status = RetryStatus.SUCCESS
            db.flush()
            continue

        if item.retry_count >= item.max_retries:
            item.status = RetryStatus.MAX_RETRIES_EXCEEDED
            record.status = UpgradeStatus.FAILED
            record.error_message = f"Max retries exceeded after {item.retry_count} attempts"
            record.completed_at = datetime.utcnow()
            db.flush()
            continue

        record.status = UpgradeStatus.PENDING
        record.started_at = datetime.utcnow()
        record.error_message = f"Retry {item.retry_count} initiated at {datetime.utcnow().isoformat()}"
        db.flush()

        item.status = RetryStatus.PENDING
        processed.append(item)

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Commit failed during process_due_retries")
        raise

    for item in processed:
        db.refresh(item)

    logger.info("Processed %d retry items, %d success", len(due_items), len(processed))
    return processed


def find_offline_devices_for_retry(db: Session, version_id: str) -> list[str]:
    from sqlalchemy import and_

    threshold = datetime.utcnow() - timedelta(hours=24)
    records = db.query(UpgradeRecord).filter(
        UpgradeRecord.version_id == version_id,
        UpgradeRecord.status == UpgradeStatus.PENDING,
        UpgradeRecord.started_at < threshold,
    ).all()

    offline_ids = []
    device_repo = DeviceRepository(db)
    for record in records:
        device = device_repo.get_by_id(record.device_id)
        if device and not device.is_online:
            offline_ids.append(device.id)
            enqueue_retry(db, record, "Device was offline during push window")

    return offline_ids


def update_device_heartbeat(db: Session, device_sn: str, is_online: bool = True) -> Device | None:
    device_repo = DeviceRepository(db)
    device = device_repo.get_by_sn(device_sn)
    if not device:
        return None

    was_offline = not device.is_online
    updated = device_repo.update_heartbeat(device.id, is_online)

    if was_offline and is_online:
        logger.info("Device %s came online, triggering retry check", device_sn)
        _trigger_retries_for_device(db, device.id)

    return updated


def _trigger_retries_for_device(db: Session, device_id: str) -> None:
    records = db.query(UpgradeRecord).filter(
        UpgradeRecord.device_id == device_id,
        UpgradeRecord.status == UpgradeStatus.PENDING,
    ).all()

    for record in records:
        if record.retry_count < record.max_retries:
            record.retry_count += 1
            record.started_at = datetime.utcnow()
            record.last_retry_at = datetime.utcnow()
            record.error_message = f"Retry after device online at {datetime.utcnow().isoformat()}"

            queue_repo = RetryQueueRepository(db)
            existing = queue_repo.get_active_for_device(device_id, record.version_id)
            if not existing:
                queue_repo.create(
                    device_id=device_id,
                    version_id=record.version_id,
                    upgrade_record_id=record.id,
                    status=RetryStatus.PENDING,
                    retry_count=record.retry_count,
                    max_retries=record.max_retries,
                    next_retry_at=datetime.utcnow(),
                    last_error="Device back online",
                    priority=100,
                )

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to trigger retries for device %s", device_id)


def get_retry_queue(
    db: Session,
    device_id: str | None = None,
    status: RetryStatus | None = None,
    skip: int = 0,
    limit: int = 50,
) -> list[RetryQueue]:
    repo = RetryQueueRepository(db)
    q = db.query(RetryQueue)
    if device_id:
        q = q.filter(RetryQueue.device_id == device_id)
    if status:
        q = q.filter(RetryQueue.status == status)
    return q.order_by(RetryQueue.priority.desc(), RetryQueue.next_retry_at.asc()).offset(skip).limit(limit).all()

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.models import (
    Device,
    FirmwareVersion,
    PushTask,
    PushTaskStatus,
    UpgradeRecord,
    UpgradeStatus,
    VersionStatus,
)
from app.repository import DeviceRepository, PushTaskRepository, UpgradeRecordRepository, VersionRepository
from app.schemas import PushTaskCreate, PushTaskStatusUpdate
from app.services import grayscale_service

logger = logging.getLogger(__name__)

_BATCH_SIZE = 200


def _validate_task_transition(current: PushTaskStatus, target: PushTaskStatus) -> bool:
    valid = {
        PushTaskStatus.DRAFT: [PushTaskStatus.RUNNING, PushTaskStatus.CANCELLED],
        PushTaskStatus.RUNNING: [PushTaskStatus.PAUSED, PushTaskStatus.COMPLETED, PushTaskStatus.CANCELLED],
        PushTaskStatus.PAUSED: [PushTaskStatus.RUNNING, PushTaskStatus.CANCELLED],
        PushTaskStatus.COMPLETED: [],
        PushTaskStatus.CANCELLED: [],
    }
    return target in valid.get(current, [])


def create_push_task(db: Session, data: PushTaskCreate) -> PushTask:
    version_repo = VersionRepository(db)
    version = version_repo.get_by_id(data.version_id)
    if not version:
        raise ValueError("Version not found")
    if version.status not in (VersionStatus.RELEASED, VersionStatus.GRAYSCALE):
        raise ValueError("Version must be RELEASED or GRAYSCALE")

    task_repo = PushTaskRepository(db)
    task = task_repo.create(
        version_id=data.version_id,
        name=data.name,
        description=data.description,
        max_retries=data.max_retries,
        created_by=data.created_by,
    )
    db.flush()

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

    task.total_devices = len(target_device_ids)

    device_ids_list = list(target_device_ids)
    for i in range(0, len(device_ids_list), _BATCH_SIZE):
        batch_ids = device_ids_list[i : i + _BATCH_SIZE]
        device_repo = DeviceRepository(db)
        device_map = device_repo.list_by_ids(batch_ids)

        for device_id in batch_ids:
            device = device_map.get(device_id)
            if not device:
                continue
            record = UpgradeRecord(
                device_id=device_id,
                version_id=version.id,
                push_task_id=task.id,
                from_version=device.current_version,
                to_version=version.version_code,
                status=UpgradeStatus.PENDING,
                max_retries=data.max_retries,
                started_at=datetime.utcnow(),
            )
            db.add(record)

        try:
            db.flush()
        except Exception:
            db.rollback()
            logger.exception("Flush failed for batch %d", i)
            raise

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Commit failed during create_push_task")
        raise

    db.refresh(task)
    return task


def get_push_task(db: Session, task_id: str) -> PushTask | None:
    repo = PushTaskRepository(db)
    return repo.get_by_id(task_id)


def list_push_tasks(
    db: Session,
    status: PushTaskStatus | None = None,
    version_id: str | None = None,
    skip: int = 0,
    limit: int = 20,
) -> list[PushTask]:
    repo = PushTaskRepository(db)
    if status:
        return [t for t in repo.list_pausable(skip, limit) if t.status == status]
    if version_id:
        return [t for t in repo.list_pausable(skip, limit) if t.version_id == version_id]
    return repo.list_pausable(skip, limit)


def update_push_task_status(db: Session, task_id: str, data: PushTaskStatusUpdate) -> PushTask | None:
    repo = PushTaskRepository(db)
    task = repo.get_by_id(task_id)
    if not task:
        return None

    if not _validate_task_transition(task.status, data.status):
        raise ValueError(f"Cannot transition from {task.status.value} to {data.status.value}")

    now = datetime.utcnow()
    if data.status == PushTaskStatus.RUNNING:
        if task.status == PushTaskStatus.DRAFT:
            task.started_at = now
        elif task.status == PushTaskStatus.PAUSED:
            task.resumed_at = now
    elif data.status == PushTaskStatus.PAUSED:
        task.paused_at = now
    elif data.status in (PushTaskStatus.COMPLETED, PushTaskStatus.CANCELLED):
        task.completed_at = now

    task.status = data.status
    db.commit()
    db.refresh(task)

    if data.status in (PushTaskStatus.PAUSED, PushTaskStatus.CANCELLED):
        _suspend_task_records(db, task.id, data.status)

    return task


def _suspend_task_records(db: Session, task_id: str, task_status: PushTaskStatus) -> None:
    repo = UpgradeRecordRepository(db)
    records = db.query(UpgradeRecord).filter(
        UpgradeRecord.push_task_id == task_id,
        UpgradeRecord.status.in_([UpgradeStatus.PENDING, UpgradeStatus.DOWNLOADING]),
    ).all()

    for record in records:
        if task_status == PushTaskStatus.CANCELLED:
            record.status = UpgradeStatus.FAILED
            record.error_message = "Push task cancelled"
            record.completed_at = datetime.utcnow()
        elif task_status == PushTaskStatus.PAUSED:
            record.error_message = f"Push task paused at {datetime.utcnow().isoformat()}"

    db.commit()
    logger.info("Suspended %d records for task %s (status=%s)", len(records), task_id, task_status.value)


def refresh_task_stats(db: Session, task_id: str) -> PushTask | None:
    repo = PushTaskRepository(db)
    task = repo.get_by_id(task_id)
    if not task:
        return None

    from sqlalchemy import func

    task.success_count = db.query(func.count(UpgradeRecord.id)).filter(
        UpgradeRecord.push_task_id == task_id,
        UpgradeRecord.status == UpgradeStatus.SUCCESS,
    ).scalar() or 0

    task.failed_count = db.query(func.count(UpgradeRecord.id)).filter(
        UpgradeRecord.push_task_id == task_id,
        UpgradeRecord.status.in_([UpgradeStatus.FAILED, UpgradeStatus.ROLLED_BACK]),
    ).scalar() or 0

    pending_count = db.query(func.count(UpgradeRecord.id)).filter(
        UpgradeRecord.push_task_id == task_id,
        UpgradeRecord.status.in_([UpgradeStatus.PENDING, UpgradeStatus.DOWNLOADING, UpgradeStatus.INSTALLING]),
    ).scalar() or 0

    if task.status == PushTaskStatus.RUNNING and pending_count == 0 and task.total_devices > 0:
        task.status = PushTaskStatus.COMPLETED
        task.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(task)
    return task

from collections.abc import Iterable
from typing import Any, TypeVar, Generic, Type

from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session, Query

from app.cache import version_cache, device_cache, grayscale_cache
from app.database import Base
from app.models import (
    DailyStatistic,
    Device,
    FirmwareVersion,
    GrayscaleRule,
    PushTask,
    PushTaskStatus,
    RateLimitDimension,
    RateLimitRule,
    RetryQueue,
    RetryStatus,
    UpgradeRecord,
    UpgradeStatus,
)

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    def __init__(self, db: Session, model: Type[ModelT]):
        self._db = db
        self._model = model

    def get_by_id(self, id: str) -> ModelT | None:
        return self._db.query(self._model).filter(self._model.id == id).first()

    def list_all(self, skip: int = 0, limit: int = 100) -> list[ModelT]:
        return self._db.query(self._model).order_by(self._model.created_at.desc()).offset(skip).limit(limit).all()

    def create(self, **kwargs) -> ModelT:
        instance = self._model(**kwargs)
        self._db.add(instance)
        return instance

    def bulk_create(self, instances: Iterable[ModelT]) -> list[ModelT]:
        items = list(instances)
        self._db.bulk_save_objects(items)
        return items

    def update(self, instance: ModelT, **kwargs) -> ModelT:
        for key, value in kwargs.items():
            setattr(instance, key, value)
        return instance

    def delete(self, instance: ModelT) -> None:
        self._db.delete(instance)


class DeviceRepository(BaseRepository[Device]):
    def __init__(self, db: Session):
        super().__init__(db, Device)

    def get_by_sn(self, sn: str) -> Device | None:
        cache_key = f"device:sn:{sn}"
        cached = device_cache.get(cache_key)
        if cached is not None:
            try:
                return self._db.merge(cached)
            except Exception:
                pass
        instance = self._db.query(Device).filter(Device.device_sn == sn).first()
        if instance is not None:
            device_cache.set(cache_key, instance)
        return instance

    def list_by_filters(self, product_model: str | None = None, region: str | None = None,
                        is_online: bool | None = None, skip: int = 0, limit: int = 100) -> list[Device]:
        q = self._db.query(Device)
        if product_model:
            q = q.filter(Device.product_model == product_model)
        if region:
            q = q.filter(Device.region == region)
        if is_online is not None:
            q = q.filter(Device.is_online == is_online)
        return q.order_by(Device.created_at.desc()).offset(skip).limit(limit).all()

    def list_by_ids(self, ids: list[str]) -> dict[str, Device]:
        if not ids:
            return {}
        devices = self._db.query(Device).filter(Device.id.in_(ids)).all()
        return {d.id: d for d in devices}

    def list_offline_to_retry(self, product_model: str, online_within_minutes: int = 60) -> list[Device]:
        from datetime import datetime, timedelta
        threshold = datetime.utcnow() - timedelta(minutes=online_within_minutes)
        return self._db.query(Device).filter(
            Device.product_model == product_model,
            Device.is_online == True,
        ).all()

    def update_heartbeat(self, device_id: str, is_online: bool = True) -> Device | None:
        from datetime import datetime
        device = self.get_by_id(device_id)
        if not device:
            return None
        device.is_online = is_online
        device.last_seen_at = datetime.utcnow()
        device_cache.delete(f"device:sn:{device.device_sn}")
        return device


class VersionRepository(BaseRepository[FirmwareVersion]):
    def __init__(self, db: Session):
        super().__init__(db, FirmwareVersion)

    def get_by_code(self, code: str) -> FirmwareVersion | None:
        cache_key = f"version:code:{code}"
        cached = version_cache.get(cache_key)
        if cached is not None:
            try:
                return self._db.merge(cached)
            except Exception:
                pass
        instance = self._db.query(FirmwareVersion).filter(FirmwareVersion.version_code == code).first()
        if instance is not None:
            version_cache.set(cache_key, instance)
        return instance

    def list_by_status(self, statuses: list, skip: int = 0, limit: int = 100) -> list[FirmwareVersion]:
        return self._db.query(FirmwareVersion).filter(
            FirmwareVersion.status.in_(statuses)
        ).order_by(FirmwareVersion.created_at.desc()).offset(skip).limit(limit).all()


class GrayscaleRepository(BaseRepository[GrayscaleRule]):
    def __init__(self, db: Session):
        super().__init__(db, GrayscaleRule)

    def list_active_by_version(self, version_id: str) -> list[GrayscaleRule]:
        cache_key = f"grayscale:version:{version_id}"
        cached = grayscale_cache.get(cache_key)
        if cached is not None:
            try:
                return [self._db.merge(x) for x in cached]
            except Exception:
                pass
        instances = self._db.query(GrayscaleRule).filter(
            GrayscaleRule.version_id == version_id,
            GrayscaleRule.is_active == True,
        ).order_by(GrayscaleRule.priority.desc()).all()
        if instances:
            grayscale_cache.set(cache_key, instances)
        return instances


class UpgradeRecordRepository(BaseRepository[UpgradeRecord]):
    def __init__(self, db: Session):
        super().__init__(db, UpgradeRecord)

    def list_active_by_device_ids(self, device_ids: list[str], version_id: str) -> dict[str, UpgradeRecord]:
        if not device_ids:
            return {}
        records = self._db.query(UpgradeRecord).filter(
            UpgradeRecord.version_id == version_id,
            UpgradeRecord.device_id.in_(device_ids),
            UpgradeRecord.status.in_([
                UpgradeStatus.PENDING, UpgradeStatus.DOWNLOADING, UpgradeStatus.INSTALLING
            ]),
        ).all()
        return {r.device_id: r for r in records}

    def list_by_device(self, device_id: str, skip: int = 0, limit: int = 20) -> list[UpgradeRecord]:
        return self._db.query(UpgradeRecord).filter(
            UpgradeRecord.device_id == device_id
        ).order_by(UpgradeRecord.created_at.desc()).offset(skip).limit(limit).all()

    def list_pending_offline(self, version_id: str, max_age_hours: int = 24) -> list[UpgradeRecord]:
        from datetime import datetime, timedelta
        threshold = datetime.utcnow() - timedelta(hours=max_age_hours)
        return self._db.query(UpgradeRecord).filter(
            UpgradeRecord.version_id == version_id,
            UpgradeRecord.status == UpgradeStatus.PENDING,
            UpgradeRecord.started_at < threshold,
        ).all()


class PushTaskRepository(BaseRepository[PushTask]):
    def __init__(self, db: Session):
        super().__init__(db, PushTask)

    def list_running(self, version_id: str | None = None) -> list[PushTask]:
        q = self._db.query(PushTask).filter(PushTask.status == PushTaskStatus.RUNNING)
        if version_id:
            q = q.filter(PushTask.version_id == version_id)
        return q.all()

    def list_pausable(self, skip: int = 0, limit: int = 100) -> list[PushTask]:
        return self._db.query(PushTask).filter(
            PushTask.status.in_([PushTaskStatus.RUNNING, PushTaskStatus.PAUSED])
        ).order_by(PushTask.updated_at.desc()).offset(skip).limit(limit).all()


class RetryQueueRepository(BaseRepository[RetryQueue]):
    def __init__(self, db: Session):
        super().__init__(db, RetryQueue)

    def list_due_retry(self, limit: int = 100) -> list[RetryQueue]:
        from datetime import datetime
        now = datetime.utcnow()
        return self._db.query(RetryQueue).filter(
            RetryQueue.status.in_([RetryStatus.PENDING, RetryStatus.RETRYING]),
            RetryQueue.retry_count < RetryQueue.max_retries,
            RetryQueue.next_retry_at <= now,
        ).order_by(RetryQueue.priority.desc(), RetryQueue.next_retry_at.asc()).limit(limit).all()

    def get_active_for_device(self, device_id: str, version_id: str) -> RetryQueue | None:
        return self._db.query(RetryQueue).filter(
            RetryQueue.device_id == device_id,
            RetryQueue.version_id == version_id,
            RetryQueue.status.in_([RetryStatus.PENDING, RetryStatus.RETRYING]),
        ).first()


class RateLimitRepository(BaseRepository[RateLimitRule]):
    def __init__(self, db: Session):
        super().__init__(db, RateLimitRule)

    def list_active(self) -> list[RateLimitRule]:
        return self._db.query(RateLimitRule).filter(RateLimitRule.is_active == True).all()

    def get_by_dimension(self, dimension: RateLimitDimension) -> list[RateLimitRule]:
        return self._db.query(RateLimitRule).filter(
            RateLimitRule.dimension == dimension,
            RateLimitRule.is_active == True,
        ).all()


class StatisticRepository(BaseRepository[DailyStatistic]):
    def __init__(self, db: Session):
        super().__init__(db, DailyStatistic)

    def get_by_date_and_version(self, stat_date: str, version_id: str) -> DailyStatistic | None:
        return self._db.query(DailyStatistic).filter(
            DailyStatistic.stat_date == stat_date,
            DailyStatistic.version_id == version_id,
        ).first()

    def list_by_filters(self, params) -> list[DailyStatistic]:
        q = self._db.query(DailyStatistic)
        if params.start_date:
            q = q.filter(DailyStatistic.stat_date >= params.start_date)
        if params.end_date:
            q = q.filter(DailyStatistic.stat_date <= params.end_date)
        if params.version_id:
            q = q.filter(DailyStatistic.version_id == params.version_id)
        return q.order_by(DailyStatistic.stat_date.desc()).offset(params.skip).limit(params.limit).all()

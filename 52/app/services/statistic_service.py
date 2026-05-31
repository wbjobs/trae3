import logging
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import DailyStatistic, UpgradeStatus, UpgradeRecord
from app.repository import StatisticRepository
from app.schemas import StatQueryParams

logger = logging.getLogger(__name__)


def get_daily_statistics(db: Session, params: StatQueryParams) -> list[DailyStatistic]:
    repo = StatisticRepository(db)
    return repo.list_by_filters(params)


def refresh_daily_statistics(db: Session, stat_date: str | None = None) -> list[DailyStatistic]:
    if not stat_date:
        stat_date = datetime.utcnow().strftime("%Y-%m-%d")

    records = db.query(
        UpgradeRecord.version_id,
        func.count(UpgradeRecord.id).label("total"),
        func.sum(func.iif(UpgradeRecord.status == UpgradeStatus.SUCCESS, 1, 0)).label("success_count"),
        func.sum(func.iif(UpgradeRecord.status == UpgradeStatus.FAILED, 1, 0)).label("failed_count"),
        func.sum(func.iif(UpgradeRecord.status == UpgradeStatus.ROLLED_BACK, 1, 0)).label("rollback_count"),
    ).filter(
        UpgradeRecord.completed_at.isnot(None),
        func.date(UpgradeRecord.completed_at) == stat_date,
    ).group_by(UpgradeRecord.version_id).all()

    repo = StatisticRepository(db)

    for row in records:
        total = row.total or 0
        success = row.success_count or 0
        failed = row.failed_count or 0
        rollback = row.rollback_count or 0
        rate = round(success / total * 100, 2) if total > 0 else 0.0

        existing = repo.get_by_date_and_version(stat_date, row.version_id)

        if existing:
            repo.update(
                existing,
                total_pushed=total,
                total_success=success,
                total_failed=failed,
                total_rolled_back=rollback,
                success_rate=rate,
            )
        else:
            repo.create(
                stat_date=stat_date,
                version_id=row.version_id,
                total_pushed=total,
                total_success=success,
                total_failed=failed,
                total_rolled_back=rollback,
                success_rate=rate,
            )

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Commit failed during refresh_daily_statistics")
        raise

    results = []
    for row in records:
        existing = repo.get_by_date_and_version(stat_date, row.version_id)
        if existing:
            results.append(existing)

    return results


def get_version_summary(db: Session, version_id: str) -> dict:
    total = db.query(func.count(UpgradeRecord.id)).filter(UpgradeRecord.version_id == version_id).scalar() or 0
    success = db.query(func.count(UpgradeRecord.id)).filter(
        UpgradeRecord.version_id == version_id,
        UpgradeRecord.status == UpgradeStatus.SUCCESS,
    ).scalar() or 0
    failed = db.query(func.count(UpgradeRecord.id)).filter(
        UpgradeRecord.version_id == version_id,
        UpgradeRecord.status == UpgradeStatus.FAILED,
    ).scalar() or 0
    pending = db.query(func.count(UpgradeRecord.id)).filter(
        UpgradeRecord.version_id == version_id,
        UpgradeRecord.status.in_([UpgradeStatus.PENDING, UpgradeStatus.DOWNLOADING, UpgradeStatus.INSTALLING]),
    ).scalar() or 0
    rolled_back = db.query(func.count(UpgradeRecord.id)).filter(
        UpgradeRecord.version_id == version_id,
        UpgradeRecord.status == UpgradeStatus.ROLLED_BACK,
    ).scalar() or 0

    return {
        "version_id": version_id,
        "total": total,
        "success": success,
        "failed": failed,
        "pending": pending,
        "rolled_back": rolled_back,
        "success_rate": round(success / total * 100, 2) if total > 0 else 0.0,
    }

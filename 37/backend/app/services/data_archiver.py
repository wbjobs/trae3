import os
import sqlite3
import shutil
import csv
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
import logging
from dataclasses import dataclass, field
from contextlib import contextmanager

from sqlalchemy import func, and_, text, Table, MetaData, create_engine, inspect
from sqlalchemy.orm import Session

from app.models.vibration_data import VibrationData
from app.models.vibration_aggregation import VibrationAggregation

logger = logging.getLogger(__name__)


@dataclass
class ArchiveConfig:
    hot_data_days: int = 7
    cold_data_days: int = 30
    archive_dir: str = "data/archive"
    cold_db_path: str = "data/cold_vibration.db"
    cold_db_table: str = "vibration_data_cold"
    enable_csv_backup: bool = True
    enable_aggregation: bool = True
    auto_archive_hour: int = 2


@dataclass
class ArchiveStats:
    hot_record_count: int = 0
    cold_record_count: int = 0
    archived_count: int = 0
    csv_file_count: int = 0
    aggregated_count: int = 0
    last_archive_time: Optional[datetime] = None
    next_archive_time: Optional[datetime] = None


class DataArchiver:
    def __init__(self, db_session: Session, config: Optional[ArchiveConfig] = None):
        self.db_session = db_session
        self.config = config or ArchiveConfig()
        self.stats = ArchiveStats()
        self._cold_engine = None
        self._cold_metadata = MetaData()
        self._ensure_directories()
        self._ensure_cold_storage()

    def _ensure_directories(self):
        Path(self.config.archive_dir).mkdir(parents=True, exist_ok=True)
        Path(os.path.dirname(self.config.cold_db_path)).mkdir(parents=True, exist_ok=True)

    def _ensure_cold_storage(self):
        cold_db_exists = os.path.exists(self.config.cold_db_path)

        self._cold_engine = create_engine(f"sqlite:///{self.config.cold_db_path}")

        if not cold_db_exists:
            self._create_cold_database()

        inspector = inspect(self._cold_engine)
        if self.config.cold_db_table not in inspector.get_table_names():
            self._create_cold_database()

    def _create_cold_database(self):
        metadata = MetaData()

        cold_table = Table(
            self.config.cold_db_table,
            metadata,
            *self._get_vibration_table_columns()
        )

        metadata.create_all(self._cold_engine)
        logger.info(f"Created cold storage table: {self.config.cold_db_table}")

    def _get_vibration_table_columns(self):
        from sqlalchemy import Column, Integer, String, Float, DateTime, Index

        return [
            Column('id', Integer, primary_key=True),
            Column('device_code', String(50), index=True, nullable=False),
            Column('timestamp', DateTime(timezone=True), index=True, nullable=False),
            Column('x_axis', Float, nullable=False),
            Column('y_axis', Float, nullable=False),
            Column('z_axis', Float, nullable=False),
            Column('temperature', Float),
            Column('speed', Float),
            Column('sample_rate', Integer, default=1000),
            Column('created_at', DateTime(timezone=True)),
            Index("idx_cold_device_time", "device_code", "timestamp"),
        ]

    @contextmanager
    def _cold_session(self):
        from sqlalchemy.orm import sessionmaker
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self._cold_engine)
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    def get_cutoff_date(self) -> datetime:
        return datetime.now() - timedelta(days=self.config.hot_data_days)

    def count_hot_data(self, device_code: Optional[str] = None) -> int:
        query = self.db_session.query(func.count(VibrationData.id))
        if device_code:
            query = query.filter(VibrationData.device_code == device_code)
        return query.scalar() or 0

    def count_cold_data(self, device_code: Optional[str] = None) -> int:
        with self._cold_session() as session:
            table = self._get_cold_table()
            query = session.query(func.count(table.c.id))
            if device_code:
                query = query.filter(table.c.device_code == device_code)
            return query.scalar() or 0

    def _get_cold_table(self) -> Table:
        if not self._cold_metadata.tables.get(self.config.cold_db_table):
            self._cold_metadata.reflect(bind=self._cold_engine, only=[self.config.cold_db_table])
        return self._cold_metadata.tables[self.config.cold_db_table]

    def archive_old_data(self, device_code: Optional[str] = None) -> ArchiveStats:
        cutoff = self.get_cutoff_date()
        logger.info(f"Starting data archive, cutoff: {cutoff}")

        query = self.db_session.query(VibrationData).filter(VibrationData.timestamp < cutoff)
        if device_code:
            query = query.filter(VibrationData.device_code == device_code)

        total_to_archive = query.count()
        if total_to_archive == 0:
            logger.info("No data to archive")
            self.stats.hot_record_count = self.count_hot_data(device_code)
            self.stats.cold_record_count = self.count_cold_data(device_code)
            self.stats.last_archive_time = datetime.now()
            self.stats.next_archive_time = self._get_next_archive_time()
            return self.stats

        batch_size = 10000
        archived = 0
        csv_file_count = 0
        aggregated_count = 0

        while True:
            batch = query.limit(batch_size).all()
            if not batch:
                break

            if self.config.enable_aggregation:
                agg_count = self._aggregate_batch(batch)
                aggregated_count += agg_count

            if self.config.enable_csv_backup:
                csv_count = self._backup_to_csv(batch)
                csv_file_count += csv_count

            self._copy_to_cold_storage(batch)

            ids_to_delete = [record.id for record in batch]
            self.db_session.query(VibrationData).filter(
                VibrationData.id.in_(ids_to_delete)
            ).delete(synchronize_session=False)
            self.db_session.commit()

            archived += len(batch)
            logger.info(f"Archived {archived}/{total_to_archive} records")

        self.stats.archived_count = archived
        self.stats.csv_file_count = csv_file_count
        self.stats.aggregated_count = aggregated_count
        self.stats.hot_record_count = self.count_hot_data(device_code)
        self.stats.cold_record_count = self.count_cold_data(device_code)
        self.stats.last_archive_time = datetime.now()
        self.stats.next_archive_time = self._get_next_archive_time()

        logger.info(f"Archive complete: {archived} records archived")
        return self.stats

    def _aggregate_batch(self, batch: List[VibrationData]) -> int:
        if not batch:
            return 0

        device_data: Dict[Tuple[str, datetime], List[VibrationData]] = {}

        for record in batch:
            time_bucket = self._get_minute_bucket(record.timestamp)
            key = (record.device_code, time_bucket)
            device_data.setdefault(key, []).append(record)

        agg_count = 0
        for (device_code, time_bucket), records in device_data.items():
            rms_values = [self._calculate_rms(r) for r in records]
            temps = [r.temperature for r in records if r.temperature is not None]
            speeds = [r.speed for r in records if r.speed is not None]

            if rms_values:
                import numpy as np
                arr = np.array(rms_values)

                agg = VibrationAggregation(
                    device_code=device_code,
                    time_bucket=time_bucket,
                    window_size=timedelta(minutes=1),
                    metric_name='archived_rms',
                    mean_value=float(np.mean(arr)),
                    max_value=float(np.max(arr)),
                    min_value=float(np.min(arr)),
                    std_value=float(np.std(arr)),
                    count=len(records),
                    rms_value=float(np.sqrt(np.mean(arr ** 2))),
                    peak_value=float(np.max(np.abs(arr))),
                    p50=float(np.percentile(arr, 50)),
                    p95=float(np.percentile(arr, 95)),
                    p99=float(np.percentile(arr, 99)),
                )
                self.db_session.add(agg)
                agg_count += 1

        self.db_session.commit()
        return agg_count

    def _calculate_rms(self, record: VibrationData) -> float:
        import math
        return math.sqrt(record.x_axis ** 2 + record.y_axis ** 2 + record.z_axis ** 2)

    def _get_minute_bucket(self, dt: datetime) -> datetime:
        return dt.replace(second=0, microsecond=0)

    def _backup_to_csv(self, batch: List[VibrationData]) -> int:
        if not batch:
            return 0

        date_str = batch[0].timestamp.strftime("%Y-%m-%d")
        device_code = batch[0].device_code
        csv_path = os.path.join(self.config.archive_dir, f"{device_code}_{date_str}.csv")

        file_exists = os.path.exists(csv_path)

        with open(csv_path, 'a', newline='') as f:
            writer = csv.writer(f)

            if not file_exists:
                writer.writerow([
                    'id', 'device_code', 'timestamp',
                    'x_axis', 'y_axis', 'z_axis',
                    'temperature', 'speed', 'sample_rate', 'created_at'
                ])

            for record in batch:
                writer.writerow([
                    record.id,
                    record.device_code,
                    record.timestamp.isoformat(),
                    record.x_axis,
                    record.y_axis,
                    record.z_axis,
                    record.temperature,
                    record.speed,
                    record.sample_rate,
                    record.created_at.isoformat() if record.created_at else ''
                ])

        return 1

    def _copy_to_cold_storage(self, batch: List[VibrationData]):
        if not batch:
            return

        table = self._get_cold_table()

        with self._cold_session() as session:
            for record in batch:
                session.execute(table.insert().values(
                    device_code=record.device_code,
                    timestamp=record.timestamp,
                    x_axis=record.x_axis,
                    y_axis=record.y_axis,
                    z_axis=record.z_axis,
                    temperature=record.temperature,
                    speed=record.speed,
                    sample_rate=record.sample_rate,
                    created_at=record.created_at
                ))
            session.commit()

    def query_hot_and_cold(
        self,
        device_code: str,
        start_time: datetime,
        end_time: datetime,
        include_cold: bool = True
    ) -> List[Dict[str, Any]]:
        cutoff = self.get_cutoff_date()
        results = []

        hot_start = max(start_time, cutoff)
        if hot_start < end_time:
            hot_data = self.db_session.query(VibrationData).filter(
                and_(
                    VibrationData.device_code == device_code,
                    VibrationData.timestamp >= hot_start,
                    VibrationData.timestamp < end_time
                )
            ).order_by(VibrationData.timestamp).all()

            results.extend([self._record_to_dict(r) for r in hot_data])

        if include_cold and start_time < cutoff:
            cold_end = min(end_time, cutoff)
            if start_time < cold_end:
                cold_data = self._query_cold_data(device_code, start_time, cold_end)
                results.extend(cold_data)

        results.sort(key=lambda x: x['timestamp'])
        return results

    def _query_cold_data(
        self,
        device_code: str,
        start_time: datetime,
        end_time: datetime
    ) -> List[Dict[str, Any]]:
        table = self._get_cold_table()

        with self._cold_session() as session:
            query = session.query(table).filter(
                and_(
                    table.c.device_code == device_code,
                    table.c.timestamp >= start_time,
                    table.c.timestamp < end_time
                )
            ).order_by(table.c.timestamp)

            return [self._cold_row_to_dict(row) for row in query.all()]

    def _record_to_dict(self, record: VibrationData) -> Dict[str, Any]:
        return {
            'id': record.id,
            'device_code': record.device_code,
            'timestamp': record.timestamp,
            'x_axis': record.x_axis,
            'y_axis': record.y_axis,
            'z_axis': record.z_axis,
            'temperature': record.temperature,
            'speed': record.speed,
            'sample_rate': record.sample_rate,
            'storage_type': 'hot'
        }

    def _cold_row_to_dict(self, row) -> Dict[str, Any]:
        return {
            'id': row.id,
            'device_code': row.device_code,
            'timestamp': row.timestamp,
            'x_axis': row.x_axis,
            'y_axis': row.y_axis,
            'z_axis': row.z_axis,
            'temperature': row.temperature,
            'speed': row.speed,
            'sample_rate': row.sample_rate,
            'storage_type': 'cold'
        }

    def _get_next_archive_time(self) -> datetime:
        now = datetime.now()
        next_run = now.replace(hour=self.config.auto_archive_hour, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        return next_run

    def restore_from_cold(
        self,
        device_code: str,
        start_time: datetime,
        end_time: datetime
    ) -> int:
        cold_data = self._query_cold_data(device_code, start_time, end_time)

        for data in cold_data:
            record = VibrationData(
                device_code=data['device_code'],
                timestamp=data['timestamp'],
                x_axis=data['x_axis'],
                y_axis=data['y_axis'],
                z_axis=data['z_axis'],
                temperature=data['temperature'],
                speed=data['speed'],
                sample_rate=data['sample_rate']
            )
            self.db_session.add(record)

        self.db_session.commit()

        table = self._get_cold_table()
        with self._cold_session() as session:
            session.query(table).filter(
                and_(
                    table.c.device_code == device_code,
                    table.c.timestamp >= start_time,
                    table.c.timestamp < end_time
                )
            ).delete(synchronize_session=False)
            session.commit()

        return len(cold_data)

    def purge_cold_data(self, older_than_days: int = 365) -> int:
        cutoff = datetime.now() - timedelta(days=older_than_days)
        table = self._get_cold_table()

        with self._cold_session() as session:
            count = session.query(table).filter(table.c.timestamp < cutoff).delete()
            session.commit()

        return count

    def get_stats(self) -> ArchiveStats:
        self.stats.hot_record_count = self.count_hot_data()
        self.stats.cold_record_count = self.count_cold_data()
        self.stats.next_archive_time = self._get_next_archive_time()
        return self.stats


_global_archiver: Optional[DataArchiver] = None


def get_data_archiver(db_session: Session, config: Optional[ArchiveConfig] = None) -> DataArchiver:
    global _global_archiver
    if _global_archiver is None:
        _global_archiver = DataArchiver(db_session, config)
    return _global_archiver

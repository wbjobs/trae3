import json
import asyncio
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
from contextlib import contextmanager
from sqlalchemy import (
    create_engine,
    Column,
    String,
    Float,
    Integer,
    DateTime,
    Boolean,
    Text,
    Index,
    text,
    Table,
    MetaData,
)
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from sqlalchemy.exc import SQLAlchemyError, IntegrityError, ProgrammingError

from config.settings import get_settings
from models.models import (
    InterpolationResult,
    TaskResult,
    GridPoint,
)
from utils.logger import get_logger
from utils.helpers import retry_with_backoff, chunk_list

logger = get_logger(__name__)

Base = declarative_base()


class PartitionStrategy:
    TIME = "time"
    REGION = "region"
    VARIABLE = "variable"
    HYBRID = "hybrid"


class ShardedInterpolationResultDB(Base):
    __tablename__ = "interpolation_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    result_id = Column(String(64), nullable=False, unique=True, index=True)
    task_id = Column(String(64), nullable=False, index=True)
    variable = Column(String(32), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    value = Column(Float, nullable=False)
    uncertainty = Column(Float, nullable=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    interpolation_method = Column(String(32), nullable=False)
    input_station_count = Column(Integer, nullable=False)
    quality_score = Column(Float, nullable=True)
    region_name = Column(String(128), nullable=True, index=True)
    region_hash = Column(String(16), nullable=True, index=True)
    time_partition = Column(String(16), nullable=True, index=True)
    grid_resolution = Column(Float, nullable=True)
    result_metadata = Column("metadata", Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_result_task_variable", "task_id", "variable"),
        Index("idx_result_spatial", "latitude", "longitude"),
        Index("idx_result_region_time", "region_hash", "time_partition"),
        Index("idx_result_time_variable", "timestamp", "variable"),
    )


class PartitionedResultStorage:
    def __init__(
        self,
        connection_url: Optional[str] = None,
        partition_strategy: str = PartitionStrategy.HYBRID,
        partition_months: int = 3,
        regions_per_shard: int = 10,
    ):
        settings = get_settings()
        self.settings = settings
        self.connection_url = connection_url or settings.database.connection_url
        self.min_points = settings.interpolation.min_points
        self.partition_strategy = partition_strategy
        self.partition_months = partition_months
        self.regions_per_shard = regions_per_shard

        self.engine = create_engine(
            self.connection_url,
            pool_size=settings.database.pool_size,
            max_overflow=settings.database.max_overflow,
            pool_pre_ping=True,
            pool_recycle=3600,
        )
        self.SessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=self.engine
        )

        self._partition_cache: Dict[str, bool] = {}
        self._region_hash_cache: Dict[str, str] = {}
        self._metadata = MetaData()

        Base.metadata.create_all(bind=self.engine)
        self._initialize_partitions()

        logger.info(
            f"PartitionedResultStorage initialized - strategy: {partition_strategy}, "
            f"partition_months: {partition_months}, regions_per_shard: {regions_per_shard}"
        )

    def _initialize_partitions(self) -> None:
        try:
            current_date = datetime.utcnow()
            for i in range(-1, 6):
                partition_date = current_date + timedelta(days=i * 30 * self.partition_months)
                time_partition = self._get_time_partition(partition_date)
                self._ensure_partition_exists(time_partition)
        except Exception as e:
            logger.warning(f"Failed to initialize partitions: {e}")

    def _get_time_partition(self, timestamp: datetime) -> str:
        year = timestamp.year
        month = ((timestamp.month - 1) // self.partition_months) * self.partition_months + 1
        return f"y{year}_m{month:02d}"

    def _get_region_hash(self, region_name: str) -> str:
        if region_name in self._region_hash_cache:
            return self._region_hash_cache[region_name]

        hash_obj = hashlib.md5(region_name.encode())
        hash_digest = int(hash_obj.hexdigest()[:8], 16)
        shard_id = hash_digest % self.regions_per_shard
        region_hash = f"r{shard_id:02d}"

        self._region_hash_cache[region_name] = region_hash
        return region_hash

    def _get_partition_name(self, result: InterpolationResult) -> str:
        time_partition = self._get_time_partition(result.timestamp)
        region_hash = self._get_region_hash(result.metadata.get("region", {}).get("name", "default"))

        if self.partition_strategy == PartitionStrategy.TIME:
            return f"interpolation_results_{time_partition}"
        elif self.partition_strategy == PartitionStrategy.REGION:
            return f"interpolation_results_{region_hash}"
        elif self.partition_strategy == PartitionStrategy.VARIABLE:
            return f"interpolation_results_{result.variable}"
        else:
            return f"interpolation_results_{region_hash}_{time_partition}"

    def _ensure_partition_exists(self, partition_key: str) -> bool:
        if partition_key in self._partition_cache:
            return True

        try:
            with self.engine.connect() as conn:
                result = conn.execute(
                    text("""
                        SELECT EXISTS (
                            SELECT FROM information_schema.tables
                            WHERE table_name = :table_name
                        )
                    """),
                    {"table_name": f"interpolation_results_{partition_key}"},
                )
                exists = result.scalar()

            if exists:
                self._partition_cache[partition_key] = True
                return True

            with self.engine.connect() as conn:
                conn.execute(
                    text(f"""
                        CREATE TABLE IF NOT EXISTS interpolation_results_{partition_key}
                        PARTITION OF interpolation_results
                        FOR VALUES IN ('{partition_key}')
                    """)
                )
                conn.commit()

            self._partition_cache[partition_key] = True
            logger.info(f"Created partition: interpolation_results_{partition_key}")
            return True

        except ProgrammingError:
            self._partition_cache[partition_key] = True
            return True
        except Exception as e:
            logger.warning(f"Partition creation warning: {e}")
            return False

    def _get_db_record(
        self, result: InterpolationResult, grid_point: GridPoint, value: float, uncertainty: Optional[float]
    ) -> ShardedInterpolationResultDB:
        region_data = result.metadata.get("region", {}) if result.metadata else {}
        region_name = region_data.get("name", "")

        time_partition = self._get_time_partition(result.timestamp)
        region_hash = self._get_region_hash(region_name)

        return ShardedInterpolationResultDB(
            result_id=f"{result.task_id}_{result.variable}_{grid_point.latitude:.4f}_{grid_point.longitude:.4f}",
            task_id=result.task_id,
            variable=result.variable,
            latitude=grid_point.latitude,
            longitude=grid_point.longitude,
            value=value,
            uncertainty=uncertainty,
            timestamp=result.timestamp,
            interpolation_method=result.interpolation_method,
            input_station_count=result.input_station_count,
            quality_score=result.quality_score,
            region_name=region_name,
            region_hash=region_hash,
            time_partition=time_partition,
            grid_resolution=result.grid_resolution,
            result_metadata=json.dumps(result.metadata) if result.metadata else None,
        )

    def store_result_batch(
        self,
        results: List[InterpolationResult],
        batch_size: int = 1000,
    ) -> Dict[str, Any]:
        if not results:
            return {"stored": 0, "total": 0, "failed": 0, "success_rate": 1.0}

        total_records = 0
        total_stored = 0
        all_failed = []
        all_failure_reasons = []

        for result in results:
            grid_points = result.grid_points
            values = result.values
            uncertainties = result.uncertainties or [None] * len(grid_points)

            partitioned_records: Dict[str, List[ShardedInterpolationResultDB]] = {}

            for i, (gp, val, unc) in enumerate(zip(grid_points, values, uncertainties)):
                try:
                    db_record = self._get_db_record(result, gp, val, unc)
                    partition_name = self._get_partition_name(result)

                    if partition_name not in partitioned_records:
                        partitioned_records[partition_name] = []
                    partitioned_records[partition_name].append(db_record)
                    total_records += 1
                except Exception as e:
                    all_failed.append(
                        {
                            "task_id": result.task_id,
                            "variable": result.variable,
                            "grid_point": gp.model_dump(),
                            "value": val,
                            "reason": str(e),
                        }
                    )
                    all_failure_reasons.append(str(e))

            for partition_name, records in partitioned_records.items():
                partition_stored, partition_failed, partition_reasons = self._store_partition_batch(
                    records, partition_name, batch_size
                )
                total_stored += partition_stored
                all_failed.extend(partition_failed)
                all_failure_reasons.extend(partition_reasons)

        success_rate = total_stored / total_records if total_records > 0 else 0.0

        if all_failed:
            self._save_failed_records(all_failed)

        stats = {
            "stored": total_stored,
            "total": total_records,
            "failed": len(all_failed),
            "success_rate": success_rate,
            "partitions_used": list(partitioned_records.keys()) if partitioned_records else [],
        }

        logger.info(
            f"Batch storage completed: {stats['stored']}/{stats['total']} "
            f"({success_rate:.1%}), failed: {len(all_failed)}"
        )

        if success_rate < 0.9 and total_stored < self.min_points:
            raise RuntimeError(
                f"Storage success rate too low ({success_rate:.1%}): {stats}"
            )

        return stats

    def _store_partition_batch(
        self,
        records: List[ShardedInterpolationResultDB],
        partition_name: str,
        batch_size: int,
    ) -> Tuple[int, List[Dict[str, Any]], List[str]]:
        stored = 0
        failed: List[Dict[str, Any]] = []
        failure_reasons: List[str] = []

        existing_ids = self._check_existing_records(records)

        new_records = [r for r in records if r.result_id not in existing_ids]
        skipped = len(records) - len(new_records)
        if skipped > 0:
            logger.debug(f"Skipped {skipped} duplicate records in {partition_name}")

        for chunk in chunk_list(new_records, batch_size):
            chunk_stored, chunk_failed, chunk_reasons = self._insert_chunk(chunk, partition_name)
            stored += chunk_stored
            failed.extend(chunk_failed)
            failure_reasons.extend(chunk_reasons)

        return stored + skipped, failed, failure_reasons

    def _check_existing_records(self, records: List[ShardedInterpolationResultDB]) -> set:
        result_ids = [r.result_id for r in records]
        existing = set()

        try:
            with self.SessionLocal() as session:
                query = text("""
                    SELECT result_id FROM interpolation_results
                    WHERE result_id = ANY(:result_ids)
                """)
                result = session.execute(query, {"result_ids": result_ids})
                existing = {row[0] for row in result}
        except Exception as e:
            logger.debug(f"Existing record check failed: {e}")

        return existing

    def _insert_chunk(
        self,
        chunk: List[ShardedInterpolationResultDB],
        partition_name: str,
    ) -> Tuple[int, List[Dict[str, Any]], List[str]]:
        stored = 0
        failed: List[Dict[str, Any]] = []
        failure_reasons: List[str] = []

        try:
            with self.SessionLocal() as session:
                session.bulk_save_objects(chunk)
                session.commit()
                stored = len(chunk)

        except IntegrityError as e:
            logger.warning(
                f"Duplicate entries in {partition_name}, falling back to single insert mode"
            )
            session.rollback()
            for record in chunk:
                single_stored, single_failed, single_reason = self._store_single_fallback(record)
                stored += single_stored
                if single_failed:
                    failed.append(single_failed)
                    failure_reasons.append(single_reason)

        except SQLAlchemyError as e:
            logger.warning(
                f"Batch insert failed for {partition_name}, falling back to single insert mode: {e}"
            )
            session.rollback()
            for record in chunk:
                single_stored, single_failed, single_reason = self._store_single_fallback(record)
                stored += single_stored
                if single_failed:
                    failed.append(single_failed)
                    failure_reasons.append(single_reason)

        except Exception as e:
            logger.error(f"Unexpected error in chunk insert: {e}", exc_info=True)
            failure_reasons.append(str(e))
            failed.extend(
                [
                    {
                        "result_id": r.result_id,
                        "task_id": r.task_id,
                        "variable": r.variable,
                        "reason": str(e),
                    }
                    for r in chunk
                ]
            )

        return stored, failed, failure_reasons

    def _store_single_fallback(
        self, record: ShardedInterpolationResultDB
    ) -> Tuple[int, Optional[Dict[str, Any]], Optional[str]]:
        try:
            with self.SessionLocal() as session:
                session.add(record)
                session.commit()
                return 1, None, None

        except IntegrityError as e:
            logger.debug(f"Record already exists (duplicate): {record.result_id}")
            return 1, None, None

        except SQLAlchemyError as e:
            logger.warning(f"Single insert failed: {e}")
            return 0, {
                "result_id": record.result_id,
                "task_id": record.task_id,
                "variable": record.variable,
                "reason": str(e),
            }, str(e)

    def _save_failed_records(self, failed_records: List[Dict[str, Any]]) -> None:
        try:
            failed_dir = Path("data/failed_records")
            failed_dir.mkdir(parents=True, exist_ok=True)

            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            failed_file = failed_dir / f"failed_records_{timestamp}.json"

            with open(failed_file, "w") as f:
                json.dump(failed_records, f, indent=2, default=str)

            logger.warning(
                f"Saved {len(failed_records)} failed records to: {failed_file}"
            )
        except Exception as e:
            logger.error(f"Failed to save failed records: {e}")

    def retry_failed_records(self, failed_file_path: str) -> Dict[str, Any]:
        try:
            with open(failed_file_path, "r") as f:
                failed_records = json.load(f)

            logger.info(f"Retrying {len(failed_records)} failed records")

            retried = 0
            still_failed = []

            for record in failed_records:
                try:
                    db_record = ShardedInterpolationResultDB(
                        result_id=record.get("result_id"),
                        task_id=record.get("task_id"),
                        variable=record.get("variable"),
                        latitude=record.get("grid_point", {}).get("latitude"),
                        longitude=record.get("grid_point", {}).get("longitude"),
                        value=record.get("value"),
                        uncertainty=record.get("uncertainty"),
                        timestamp=datetime.utcnow(),
                        interpolation_method=record.get("interpolation_method", "retry"),
                        input_station_count=record.get("input_station_count", 0),
                        quality_score=record.get("quality_score"),
                        region_name=record.get("region_name"),
                    )

                    with self.SessionLocal() as session:
                        session.add(db_record)
                        session.commit()
                        retried += 1

                except IntegrityError:
                    retried += 1
                except Exception as e:
                    record["retry_reason"] = str(e)
                    still_failed.append(record)

            if still_failed:
                self._save_failed_records(still_failed)

            result = {
                "total": len(failed_records),
                "retried": retried,
                "still_failed": len(still_failed),
            }

            logger.info(
                f"Retry completed: {retried}/{len(failed_records)} succeeded, "
                f"{len(still_failed)} still failed"
            )

            return result

        except Exception as e:
            logger.error(f"Failed to retry records: {e}", exc_info=True)
            raise

    def query_results(
        self,
        variable: Optional[str] = None,
        region_name: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        min_quality: Optional[float] = None,
        limit: int = 10000,
    ) -> List[Dict[str, Any]]:
        query_parts = ["SELECT * FROM interpolation_results WHERE 1=1"]
        params: Dict[str, Any] = {}

        if variable:
            query_parts.append("AND variable = :variable")
            params["variable"] = variable

        if region_name:
            query_parts.append("AND region_name = :region_name")
            params["region_name"] = region_name

        if start_time:
            query_parts.append("AND timestamp >= :start_time")
            params["start_time"] = start_time

        if end_time:
            query_parts.append("AND timestamp <= :end_time")
            params["end_time"] = end_time

        if min_quality is not None:
            query_parts.append("AND quality_score >= :min_quality")
            params["min_quality"] = min_quality

        query_parts.append("ORDER BY timestamp DESC LIMIT :limit")
        params["limit"] = limit

        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(" ".join(query_parts)), params)
                columns = result.keys()
                return [dict(zip(columns, row)) for row in result]
        except Exception as e:
            logger.error(f"Query failed: {e}")
            raise

    def get_partition_stats(self) -> Dict[str, Any]:
        try:
            with self.engine.connect() as conn:
                result = conn.execute(
                    text("""
                        SELECT
                            time_partition,
                            region_hash,
                            variable,
                            COUNT(*) as count,
                            MIN(timestamp) as min_time,
                            MAX(timestamp) as max_time,
                            AVG(quality_score) as avg_quality
                        FROM interpolation_results
                        GROUP BY time_partition, region_hash, variable
                        ORDER BY count DESC
                    """)
                )
                columns = result.keys()
                stats = [dict(zip(columns, row)) for row in result]

            return {
                "total_records": sum(s["count"] for s in stats),
                "partition_count": len(stats),
                "partitions": stats,
            }
        except Exception as e:
            logger.error(f"Failed to get partition stats: {e}")
            return {"error": str(e)}

    def optimize_partitions(self) -> Dict[str, Any]:
        stats = self.get_partition_stats()
        logger.info(f"Optimizing {stats.get('partition_count', 0)} partitions")

        results = {}
        try:
            with self.engine.connect() as conn:
                conn.execute(text("VACUUM ANALYZE interpolation_results"))
                conn.commit()
            results["vacuum"] = "success"
        except Exception as e:
            results["vacuum"] = str(e)

        results["stats"] = stats
        return results

    def close(self) -> None:
        self.engine.dispose()
        logger.info("PartitionedResultStorage connection closed")

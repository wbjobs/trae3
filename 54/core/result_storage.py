import json
import asyncio
from datetime import datetime
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
)
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from sqlalchemy.exc import SQLAlchemyError, IntegrityError

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


class InterpolationResultDB(Base):
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
    grid_resolution = Column(Float, nullable=True)
    result_metadata = Column("metadata", Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_result_task_variable", "task_id", "variable"),
        Index("idx_result_spatial", "latitude", "longitude"),
        Index("idx_result_time_variable", "timestamp", "variable"),
    )


class TaskRecordDB(Base):
    __tablename__ = "task_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String(64), nullable=False, unique=True, index=True)
    status = Column(String(32), nullable=False, index=True)
    region_name = Column(String(128), nullable=True)
    variables = Column(Text, nullable=True)
    grid_resolution = Column(Float, nullable=True)
    interpolation_method = Column(String(32), nullable=True)
    priority = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False)
    scheduled_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    failed_at = Column(DateTime, nullable=True)
    assigned_node = Column(String(64), nullable=True)
    execution_time_seconds = Column(Float, nullable=True)
    retry_count = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    input_station_count = Column(Integer, nullable=True)
    task_metadata = Column("metadata", Text, nullable=True)


class ResultStorage:
    def __init__(self, connection_url: Optional[str] = None):
        settings = get_settings()
        self.settings = settings
        self.connection_url = connection_url or settings.database.connection_url
        self.min_points = settings.interpolation.min_points
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

        logger.info(f"ResultStorage initialized - database: {settings.database.database}")

    def init_database(self) -> None:
        logger.info("Initializing database schema...")
        Base.metadata.create_all(bind=self.engine)
        logger.info("Database schema initialized")

    @contextmanager
    def get_session(self) -> Session:
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    def store_result(self, result: InterpolationResult, task_id: str) -> bool:
        try:
            with self.get_session() as session:
                grid_points = result.grid_points
                values = result.values
                uncertainties = result.uncertainties or [None] * len(values)

                for i, (gp, value, unc) in enumerate(zip(grid_points, values, uncertainties)):
                    db_result = InterpolationResultDB(
                        result_id=f"{result.result_id}_{i}",
                        task_id=task_id,
                        variable=result.variable,
                        latitude=gp.latitude,
                        longitude=gp.longitude,
                        value=value,
                        uncertainty=unc,
                        timestamp=result.timestamp,
                        interpolation_method=result.interpolation_method,
                        input_station_count=result.input_station_count,
                        quality_score=result.quality_score,
                        region_name=result.metadata.get("region", {}).get("name"),
                        grid_resolution=result.metadata.get("grid_resolution"),
                        result_metadata=json.dumps(result.metadata, default=str),
                    )
                    session.add(db_result)

            logger.info(
                f"Stored {len(values)} grid points for variable {result.variable}, "
                f"task {task_id}"
            )
            return True

        except IntegrityError as e:
            logger.warning(f"Duplicate result detected for task {task_id}: {e}")
            return False
        except SQLAlchemyError as e:
            logger.error(f"Database error storing result: {e}", exc_info=True)
            raise

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    def store_result_batch(
        self, result: InterpolationResult, task_id: str, batch_size: int = 1000
    ) -> int:
        total_stored = 0
        failed_indices: List[int] = []
        failed_reasons: List[str] = []

        grid_points = result.grid_points
        values = result.values
        uncertainties = result.uncertainties or [None] * len(values)

        indices = list(range(len(values)))
        batches = chunk_list(indices, batch_size)

        for batch_idx, batch in enumerate(batches):
            try:
                with self.get_session() as session:
                    for i in batch:
                        gp = grid_points[i]
                        value = values[i]
                        unc = uncertainties[i]

                        existing = session.query(InterpolationResultDB).filter(
                            InterpolationResultDB.result_id == f"{result.result_id}_{i}"
                        ).first()

                        if existing is not None:
                            logger.debug(
                                f"Record {result.result_id}_{i} already exists, skipping"
                            )
                            continue

                        db_result = InterpolationResultDB(
                            result_id=f"{result.result_id}_{i}",
                            task_id=task_id,
                            variable=result.variable,
                            latitude=gp.latitude,
                            longitude=gp.longitude,
                            value=value,
                            uncertainty=unc,
                            timestamp=result.timestamp,
                            interpolation_method=result.interpolation_method,
                            input_station_count=result.input_station_count,
                            quality_score=result.quality_score,
                            region_name=result.metadata.get("region", {}).get("name"),
                            grid_resolution=result.metadata.get("grid_resolution"),
                            result_metadata=json.dumps(result.metadata, default=str),
                        )
                        session.add(db_result)

                    total_stored += len(batch)
                    logger.debug(
                        f"Stored batch {batch_idx + 1}/{len(batches)} "
                        f"({len(batch)} points) for variable {result.variable}"
                    )

            except IntegrityError as e:
                logger.warning(
                    f"Duplicate entries in batch {batch_idx + 1} for task {task_id}, "
                    f"falling back to single insert mode"
                )
                batch_stored, batch_failed, batch_reasons = self._store_single_fallback(
                    result, task_id, batch, grid_points, values, uncertainties
                )
                total_stored += batch_stored
                failed_indices.extend(batch_failed)
                failed_reasons.extend(batch_reasons)

            except SQLAlchemyError as e:
                logger.warning(
                    f"Batch {batch_idx + 1} failed for task {task_id}: {e}, "
                    f"falling back to single insert mode"
                )
                batch_stored, batch_failed, batch_reasons = self._store_single_fallback(
                    result, task_id, batch, grid_points, values, uncertainties
                )
                total_stored += batch_stored
                failed_indices.extend(batch_failed)
                failed_reasons.extend(batch_reasons)

        if failed_indices:
            logger.warning(
                f"Failed to store {len(failed_indices)} records for task {task_id}, "
                f"variable {result.variable}. "
                f"Reasons: {list(set(failed_reasons))[:5]}"
            )

            self._save_failed_records(
                task_id,
                result.variable,
                result.result_id,
                failed_indices,
                failed_reasons,
                grid_points,
                values,
                uncertainties,
            )

        total_attempted = len(values)
        success_rate = total_stored / total_attempted if total_attempted > 0 else 1.0

        logger.info(
            f"Storage complete for variable {result.variable}, task {task_id}: "
            f"stored={total_stored}/{total_attempted} "
            f"({success_rate:.1%}), failed={len(failed_indices)}"
        )

        if success_rate < 0.9 and total_stored < self.min_points:
            raise RuntimeError(
                f"Storage success rate too low ({success_rate:.1%}) "
                f"for task {task_id}, variable {result.variable}"
            )

        return total_stored

    def _store_single_fallback(
        self,
        result: InterpolationResult,
        task_id: str,
        indices: List[int],
        grid_points: List[GridPoint],
        values: List[float],
        uncertainties: List[Optional[float]],
    ) -> Tuple[int, List[int], List[str]]:
        stored = 0
        failed: List[int] = []
        reasons: List[str] = []

        for i in indices:
            try:
                with self.get_session() as session:
                    gp = grid_points[i]
                    value = values[i]
                    unc = uncertainties[i]
                    result_id = f"{result.result_id}_{i}"

                    existing = session.query(InterpolationResultDB).filter(
                        InterpolationResultDB.result_id == result_id
                    ).first()

                    if existing is not None:
                        stored += 1
                        continue

                    db_result = InterpolationResultDB(
                        result_id=result_id,
                        task_id=task_id,
                        variable=result.variable,
                        latitude=gp.latitude,
                        longitude=gp.longitude,
                        value=value,
                        uncertainty=unc,
                        timestamp=result.timestamp,
                        interpolation_method=result.interpolation_method,
                        input_station_count=result.input_station_count,
                        quality_score=result.quality_score,
                        region_name=result.metadata.get("region", {}).get("name"),
                        grid_resolution=result.metadata.get("grid_resolution"),
                        result_metadata=json.dumps(result.metadata, default=str),
                    )
                    session.add(db_result)
                    stored += 1

            except IntegrityError as e:
                failed.append(i)
                reasons.append(f"IntegrityError: {str(e)[:100]}")
            except SQLAlchemyError as e:
                failed.append(i)
                reasons.append(f"SQLAlchemyError: {str(e)[:100]}")
            except Exception as e:
                failed.append(i)
                reasons.append(f"UnexpectedError: {str(e)[:100]}")

        return stored, failed, reasons

    def _save_failed_records(
        self,
        task_id: str,
        variable: str,
        result_id: str,
        failed_indices: List[int],
        failed_reasons: List[str],
        grid_points: List[GridPoint],
        values: List[float],
        uncertainties: List[Optional[float]],
    ) -> None:
        try:
            failed_data = []
            for idx, reason in zip(failed_indices, failed_reasons):
                gp = grid_points[idx]
                failed_data.append({
                    "index": idx,
                    "result_id": f"{result_id}_{idx}",
                    "latitude": gp.latitude,
                    "longitude": gp.longitude,
                    "value": values[idx],
                    "uncertainty": uncertainties[idx],
                    "reason": reason,
                })

            failed_file = (
                Path(self.settings.data_dir) / "failed_records" /
                f"{task_id}_{variable}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
            )
            failed_file.parent.mkdir(parents=True, exist_ok=True)

            with open(failed_file, "w") as f:
                json.dump({
                    "task_id": task_id,
                    "variable": variable,
                    "result_id": result_id,
                    "failed_count": len(failed_data),
                    "failed_records": failed_data,
                    "timestamp": datetime.utcnow().isoformat(),
                }, f, default=str, indent=2)

            logger.warning(
                f"Failed records saved to {failed_file} for later retry"
            )

        except Exception as e:
            logger.error(
                f"Failed to save failed records for task {task_id}: {e}",
                exc_info=True
            )

    def retry_failed_records(self, failed_file_path: str) -> int:
        try:
            with open(failed_file_path, "r") as f:
                data = json.load(f)

            task_id = data["task_id"]
            variable = data["variable"]
            failed_records = data["failed_records"]

            stored = 0
            for record in failed_records:
                try:
                    with self.get_session() as session:
                        existing = session.query(InterpolationResultDB).filter(
                            InterpolationResultDB.result_id == record["result_id"]
                        ).first()

                        if existing is not None:
                            stored += 1
                            continue

                        db_result = InterpolationResultDB(
                            result_id=record["result_id"],
                            task_id=task_id,
                            variable=variable,
                            latitude=record["latitude"],
                            longitude=record["longitude"],
                            value=record["value"],
                            uncertainty=record["uncertainty"],
                            timestamp=datetime.utcnow(),
                            interpolation_method="retry",
                            input_station_count=0,
                            quality_score=None,
                            result_metadata=json.dumps({"retry": True, "original_reason": record["reason"]}, default=str),
                        )
                        session.add(db_result)
                        stored += 1

                except Exception as e:
                    logger.warning(
                        f"Failed to retry record {record['result_id']}: {e}"
                    )

            logger.info(
                f"Retry complete: stored {stored}/{len(failed_records)} "
                f"records from {failed_file_path}"
            )
            return stored

        except Exception as e:
            logger.error(f"Failed to process retry file {failed_file_path}: {e}", exc_info=True)
            raise

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    def store_task_result(self, task_result: TaskResult) -> bool:
        try:
            with self.get_session() as session:
                record = TaskRecordDB(
                    task_id=task_result.task_id,
                    status=task_result.status.value,
                    execution_time_seconds=task_result.execution_time_seconds,
                    assigned_node=task_result.node_id,
                    completed_at=task_result.completed_at,
                    error_message=task_result.error,
                    task_metadata=json.dumps(
                        {"result_count": len(task_result.results)}, default=str
                    ),
                )
                session.merge(record)

            logger.info(
                f"Stored task record for {task_result.task_id} "
                f"with status {task_result.status}"
            )
            return True

        except SQLAlchemyError as e:
            logger.error(f"Database error storing task record: {e}", exc_info=True)
            raise

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    def store_task_metadata(
        self, task_id: str, task_metadata: Dict[str, Any]
    ) -> bool:
        try:
            with self.get_session() as session:
                record = TaskRecordDB(
                    task_id=task_id,
                    status=task_metadata.get("status", "pending"),
                    region_name=task_metadata.get("region_name"),
                    variables=json.dumps(task_metadata.get("variables", []), default=str)
                    if task_metadata.get("variables")
                    else None,
                    grid_resolution=task_metadata.get("grid_resolution"),
                    interpolation_method=task_metadata.get("interpolation_method"),
                    priority=task_metadata.get("priority"),
                    created_at=task_metadata.get("created_at"),
                    scheduled_at=task_metadata.get("scheduled_at"),
                    started_at=task_metadata.get("started_at"),
                    retry_count=task_metadata.get("retry_count"),
                    input_station_count=task_metadata.get("input_station_count"),
                    task_metadata=json.dumps(task_metadata.get("metadata", {}), default=str),
                )
                session.merge(record)

            logger.info(f"Stored task metadata for {task_id}")
            return True

        except SQLAlchemyError as e:
            logger.error(f"Database error storing task metadata: {e}", exc_info=True)
            raise

    async def store_task_results_async(
        self, task_result: TaskResult, batch_size: int = 1000
    ) -> bool:
        try:
            loop = asyncio.get_event_loop()

            if task_result.status.value == "completed" and task_result.results:
                for result in task_result.results:
                    await loop.run_in_executor(
                        None,
                        lambda r=result: self.store_result_batch(r, task_result.task_id, batch_size),
                    )

            await loop.run_in_executor(None, lambda: self.store_task_result(task_result))

            return True

        except Exception as e:
            logger.error(f"Async storage error: {e}", exc_info=True)
            return False

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    def query_results(
        self,
        variable: Optional[str] = None,
        region: Optional[Tuple[float, float, float, float]] = None,
        time_range: Optional[Tuple[datetime, datetime]] = None,
        task_id: Optional[str] = None,
        limit: int = 10000,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        try:
            with self.get_session() as session:
                query = session.query(InterpolationResultDB)

                if variable:
                    query = query.filter(InterpolationResultDB.variable == variable)
                if task_id:
                    query = query.filter(InterpolationResultDB.task_id == task_id)
                if region:
                    min_lat, max_lat, min_lon, max_lon = region
                    query = query.filter(
                        InterpolationResultDB.latitude.between(min_lat, max_lat),
                        InterpolationResultDB.longitude.between(min_lon, max_lon),
                    )
                if time_range:
                    start_time, end_time = time_range
                    query = query.filter(
                        InterpolationResultDB.timestamp.between(start_time, end_time)
                    )

                query = query.order_by(InterpolationResultDB.timestamp.desc())
                results = query.offset(offset).limit(limit).all()

                return [
                    {
                        "result_id": r.result_id,
                        "task_id": r.task_id,
                        "variable": r.variable,
                        "latitude": r.latitude,
                        "longitude": r.longitude,
                        "value": r.value,
                        "uncertainty": r.uncertainty,
                        "timestamp": r.timestamp,
                        "interpolation_method": r.interpolation_method,
                        "quality_score": r.quality_score,
                        "region_name": r.region_name,
                    }
                    for r in results
                ]

        except SQLAlchemyError as e:
            logger.error(f"Database error querying results: {e}", exc_info=True)
            raise

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    def get_result_statistics(
        self,
        variable: Optional[str] = None,
        time_range: Optional[Tuple[datetime, datetime]] = None,
    ) -> Dict[str, Any]:
        try:
            with self.get_session() as session:
                query = session.query(
                    InterpolationResultDB.variable,
                    func.count(InterpolationResultDB.id).label("count"),
                    func.avg(InterpolationResultDB.value).label("avg_value"),
                    func.min(InterpolationResultDB.value).label("min_value"),
                    func.max(InterpolationResultDB.value).label("max_value"),
                    func.avg(InterpolationResultDB.quality_score).label("avg_quality"),
                )

                if variable:
                    query = query.filter(InterpolationResultDB.variable == variable)
                if time_range:
                    start_time, end_time = time_range
                    query = query.filter(
                        InterpolationResultDB.timestamp.between(start_time, end_time)
                    )

                query = query.group_by(InterpolationResultDB.variable)
                results = query.all()

                return {
                    row.variable: {
                        "count": row.count,
                        "avg_value": row.avg_value,
                        "min_value": row.min_value,
                        "max_value": row.max_value,
                        "avg_quality": row.avg_quality,
                    }
                    for row in results
                }

        except SQLAlchemyError as e:
            logger.error(f"Database error getting statistics: {e}", exc_info=True)
            raise

    @retry_with_backoff(max_attempts=3, initial_delay=1.0)
    def delete_task_results(self, task_id: str) -> int:
        try:
            with self.get_session() as session:
                result_count = (
                    session.query(InterpolationResultDB)
                    .filter(InterpolationResultDB.task_id == task_id)
                    .delete()
                )

                session.query(TaskRecordDB).filter(
                    TaskRecordDB.task_id == task_id
                ).delete()

            logger.info(f"Deleted {result_count} results for task {task_id}")
            return result_count

        except SQLAlchemyError as e:
            logger.error(f"Database error deleting results: {e}", exc_info=True)
            raise

    def get_database_size(self) -> Optional[Dict[str, Any]]:
        try:
            with self.get_session() as session:
                result = session.execute(
                    text(
                        "SELECT pg_size_pretty(pg_database_size(current_database())) as size, "
                        "pg_database_size(current_database()) as size_bytes"
                    )
                ).first()

                total_count = session.query(InterpolationResultDB).count()
                task_count = session.query(TaskRecordDB).count()

                return {
                    "size_pretty": result.size,
                    "size_bytes": result.size_bytes,
                    "total_results": total_count,
                    "total_tasks": task_count,
                }

        except SQLAlchemyError as e:
            logger.error(f"Database error getting size: {e}", exc_info=True)
            return None

    def close(self) -> None:
        logger.info("Closing ResultStorage connection pool")
        self.engine.dispose()


from sqlalchemy import func

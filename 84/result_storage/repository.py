from typing import Optional, List, Dict, Any, Type, TypeVar, Generic
from datetime import datetime
from sqlalchemy import select, update, delete, func, and_, or_, Integer
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from sqlalchemy.dialects.postgresql import insert
from common.exceptions import DatabaseError, DataValidationError, QueryError
from common.models import TaskResult, TemperatureSalinity, NodeMetrics

ModelType = TypeVar("ModelType")


class BaseRepository(Generic[ModelType]):
    def __init__(self, model: Type[ModelType], session: Session) -> None:
        self.model = model
        self.session = session

    def _validate(self, instance: ModelType) -> None:
        if instance is None:
            raise DataValidationError("Instance cannot be None")

    def get_by_id(self, id: int) -> Optional[ModelType]:
        try:
            return self.session.get(self.model, id)
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get by id: {str(e)}") from e

    def list_all(self, skip: int = 0, limit: int = 100) -> List[ModelType]:
        try:
            return self.session.execute(
                select(self.model).offset(skip).limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list all: {str(e)}") from e

    def count(self) -> int:
        try:
            return self.session.execute(
                select(func.count()).select_from(self.model)
            ).scalar_one()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to count: {str(e)}") from e

    def create(self, instance: ModelType) -> ModelType:
        self._validate(instance)
        try:
            self.session.add(instance)
            self.session.flush()
            return instance
        except IntegrityError as e:
            self.session.rollback()
            raise DataValidationError(f"Integrity error: {str(e)}") from e
        except SQLAlchemyError as e:
            self.session.rollback()
            raise DatabaseError(f"Failed to create: {str(e)}") from e

    def bulk_create(self, instances: List[ModelType]) -> List[ModelType]:
        if not instances:
            return []
        for instance in instances:
            self._validate(instance)
        try:
            self.session.bulk_save_objects(instances)
            self.session.flush()
            return instances
        except IntegrityError as e:
            self.session.rollback()
            raise DataValidationError(f"Integrity error in bulk create: {str(e)}") from e
        except SQLAlchemyError as e:
            self.session.rollback()
            raise DatabaseError(f"Failed to bulk create: {str(e)}") from e

    def update(self, id: int, data: Dict[str, Any]) -> Optional[ModelType]:
        try:
            result = self.session.execute(
                update(self.model)
                .where(self.model.id == id)
                .values(**data)
                .execution_options(synchronize_session="fetch")
                .returning(self.model)
            )
            self.session.flush()
            return result.scalar_one_or_none()
        except IntegrityError as e:
            self.session.rollback()
            raise DataValidationError(f"Integrity error: {str(e)}") from e
        except SQLAlchemyError as e:
            self.session.rollback()
            raise DatabaseError(f"Failed to update: {str(e)}") from e

    def delete(self, id: int) -> bool:
        try:
            result = self.session.execute(
                delete(self.model).where(self.model.id == id)
            )
            self.session.flush()
            return result.rowcount > 0
        except SQLAlchemyError as e:
            self.session.rollback()
            raise DatabaseError(f"Failed to delete: {str(e)}") from e

    def bulk_delete(self, ids: List[int]) -> int:
        if not ids:
            return 0
        try:
            result = self.session.execute(
                delete(self.model).where(self.model.id.in_(ids))
            )
            self.session.flush()
            return result.rowcount
        except SQLAlchemyError as e:
            self.session.rollback()
            raise DatabaseError(f"Failed to bulk delete: {str(e)}") from e

    def upsert(self, data: Dict[str, Any], conflict_columns: List[str]) -> ModelType:
        try:
            stmt = insert(self.model).values(**data)
            update_dict = {k: v for k, v in data.items() if k not in conflict_columns}
            stmt = stmt.on_conflict_do_update(
                index_elements=conflict_columns,
                set_=update_dict
            ).returning(self.model)
            result = self.session.execute(stmt)
            self.session.flush()
            return result.scalar_one()
        except SQLAlchemyError as e:
            self.session.rollback()
            raise DatabaseError(f"Failed to upsert: {str(e)}") from e

    def bulk_upsert(self, data_list: List[Dict[str, Any]], conflict_columns: List[str]) -> List[ModelType]:
        if not data_list:
            return []
        try:
            stmt = insert(self.model).values(data_list)
            update_columns = [k for k in data_list[0].keys() if k not in conflict_columns]
            update_dict = {c: getattr(stmt.excluded, c) for c in update_columns}
            stmt = stmt.on_conflict_do_update(
                index_elements=conflict_columns,
                set_=update_dict
            ).returning(self.model)
            result = self.session.execute(stmt)
            self.session.flush()
            return result.scalars().all()
        except SQLAlchemyError as e:
            self.session.rollback()
            raise DatabaseError(f"Failed to bulk upsert: {str(e)}") from e


class TaskResultRepository(BaseRepository[TaskResult]):
    def __init__(self, session: Session) -> None:
        super().__init__(TaskResult, session)

    def get_by_task_id(self, task_id: str) -> Optional[TaskResult]:
        try:
            return self.session.execute(
                select(TaskResult).where(TaskResult.task_id == task_id)
            ).scalar_one_or_none()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get by task_id: {str(e)}") from e

    def list_by_status(self, status: str, skip: int = 0, limit: int = 100) -> List[TaskResult]:
        try:
            return self.session.execute(
                select(TaskResult)
                .where(TaskResult.status == status)
                .order_by(TaskResult.submitted_at.desc())
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by status: {str(e)}") from e

    def list_by_task_type(self, task_type: str, skip: int = 0, limit: int = 100) -> List[TaskResult]:
        try:
            return self.session.execute(
                select(TaskResult)
                .where(TaskResult.task_type == task_type)
                .order_by(TaskResult.submitted_at.desc())
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by task type: {str(e)}") from e

    def list_by_time_range(
        self,
        start_time: datetime,
        end_time: datetime,
        skip: int = 0,
        limit: int = 100,
    ) -> List[TaskResult]:
        try:
            return self.session.execute(
                select(TaskResult)
                .where(
                    and_(
                        TaskResult.submitted_at >= start_time,
                        TaskResult.submitted_at < end_time,
                    )
                )
                .order_by(TaskResult.submitted_at.desc())
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by time range: {str(e)}") from e

    def list_by_node_id(self, node_id: str, skip: int = 0, limit: int = 100) -> List[TaskResult]:
        try:
            return self.session.execute(
                select(TaskResult)
                .where(TaskResult.node_id == node_id)
                .order_by(TaskResult.submitted_at.desc())
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by node_id: {str(e)}") from e

    def update_status(self, task_id: str, status: str, **kwargs) -> Optional[TaskResult]:
        try:
            update_data = {"status": status, "updated_at": datetime.utcnow()}
            update_data.update(kwargs)
            result = self.session.execute(
                update(TaskResult)
                .where(TaskResult.task_id == task_id)
                .values(**update_data)
                .execution_options(synchronize_session="fetch")
                .returning(TaskResult)
            )
            self.session.flush()
            return result.scalar_one_or_none()
        except SQLAlchemyError as e:
            self.session.rollback()
            raise DatabaseError(f"Failed to update status: {str(e)}") from e

    def count_by_status(self, status: str) -> int:
        try:
            return self.session.execute(
                select(func.count())
                .select_from(TaskResult)
                .where(TaskResult.status == status)
            ).scalar_one()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to count by status: {str(e)}") from e

    def get_statistics(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        try:
            query = select(
                func.count(TaskResult.id).label("total"),
                func.sum(func.cast(TaskResult.status == "completed", Integer)).label("completed"),
                func.sum(func.cast(TaskResult.status == "failed", Integer)).label("failed"),
                func.sum(func.cast(TaskResult.status == "running", Integer)).label("running"),
                func.sum(func.cast(TaskResult.status == "pending", Integer)).label("pending"),
                func.avg(TaskResult.duration_ms).label("avg_duration_ms"),
            )
            conditions = []
            if start_time:
                conditions.append(TaskResult.submitted_at >= start_time)
            if end_time:
                conditions.append(TaskResult.submitted_at < end_time)
            if conditions:
                query = query.where(and_(*conditions))
            result = self.session.execute(query).mappings().one()
            return dict(result)
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get statistics: {str(e)}") from e


class TemperatureSalinityRepository(BaseRepository[TemperatureSalinity]):
    def __init__(self, session: Session) -> None:
        super().__init__(TemperatureSalinity, session)

    def list_by_time_range(
        self,
        start_time: datetime,
        end_time: datetime,
        skip: int = 0,
        limit: int = 10000,
    ) -> List[TemperatureSalinity]:
        try:
            return self.session.execute(
                select(TemperatureSalinity)
                .where(
                    and_(
                        TemperatureSalinity.timestamp >= start_time,
                        TemperatureSalinity.timestamp < end_time,
                    )
                )
                .order_by(TemperatureSalinity.timestamp, TemperatureSalinity.depth)
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by time range: {str(e)}") from e

    def list_by_region(
        self,
        min_lon: float,
        max_lon: float,
        min_lat: float,
        max_lat: float,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 10000,
    ) -> List[TemperatureSalinity]:
        try:
            conditions = [
                TemperatureSalinity.longitude >= min_lon,
                TemperatureSalinity.longitude <= max_lon,
                TemperatureSalinity.latitude >= min_lat,
                TemperatureSalinity.latitude <= max_lat,
            ]
            if start_time:
                conditions.append(TemperatureSalinity.timestamp >= start_time)
            if end_time:
                conditions.append(TemperatureSalinity.timestamp < end_time)
            return self.session.execute(
                select(TemperatureSalinity)
                .where(and_(*conditions))
                .order_by(TemperatureSalinity.timestamp, TemperatureSalinity.depth)
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by region: {str(e)}") from e

    def list_by_depth_range(
        self,
        min_depth: float,
        max_depth: float,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 10000,
    ) -> List[TemperatureSalinity]:
        try:
            conditions = [
                TemperatureSalinity.depth >= min_depth,
                TemperatureSalinity.depth <= max_depth,
            ]
            if start_time:
                conditions.append(TemperatureSalinity.timestamp >= start_time)
            if end_time:
                conditions.append(TemperatureSalinity.timestamp < end_time)
            return self.session.execute(
                select(TemperatureSalinity)
                .where(and_(*conditions))
                .order_by(TemperatureSalinity.timestamp, TemperatureSalinity.depth)
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by depth range: {str(e)}") from e

    def get_by_coordinates(
        self,
        longitude: float,
        latitude: float,
        timestamp: Optional[datetime] = None,
    ) -> List[TemperatureSalinity]:
        try:
            conditions = [
                TemperatureSalinity.longitude == longitude,
                TemperatureSalinity.latitude == latitude,
            ]
            if timestamp:
                conditions.append(TemperatureSalinity.timestamp == timestamp)
            return self.session.execute(
                select(TemperatureSalinity)
                .where(and_(*conditions))
                .order_by(TemperatureSalinity.depth)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get by coordinates: {str(e)}") from e

    def list_by_data_source(
        self,
        data_source: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 10000,
    ) -> List[TemperatureSalinity]:
        try:
            conditions = [TemperatureSalinity.data_source == data_source]
            if start_time:
                conditions.append(TemperatureSalinity.timestamp >= start_time)
            if end_time:
                conditions.append(TemperatureSalinity.timestamp < end_time)
            return self.session.execute(
                select(TemperatureSalinity)
                .where(and_(*conditions))
                .order_by(TemperatureSalinity.timestamp)
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by data source: {str(e)}") from e

    def list_by_quality_flag(
        self,
        quality_flag: int,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 10000,
    ) -> List[TemperatureSalinity]:
        try:
            conditions = [TemperatureSalinity.quality_flag == quality_flag]
            if start_time:
                conditions.append(TemperatureSalinity.timestamp >= start_time)
            if end_time:
                conditions.append(TemperatureSalinity.timestamp < end_time)
            return self.session.execute(
                select(TemperatureSalinity)
                .where(and_(*conditions))
                .order_by(TemperatureSalinity.timestamp)
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by quality flag: {str(e)}") from e

    def get_statistics(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        try:
            query = select(
                func.count(TemperatureSalinity.id).label("total"),
                func.avg(TemperatureSalinity.temperature).label("avg_temperature"),
                func.min(TemperatureSalinity.temperature).label("min_temperature"),
                func.max(TemperatureSalinity.temperature).label("max_temperature"),
                func.avg(TemperatureSalinity.salinity).label("avg_salinity"),
                func.min(TemperatureSalinity.salinity).label("min_salinity"),
                func.max(TemperatureSalinity.salinity).label("max_salinity"),
                func.avg(TemperatureSalinity.depth).label("avg_depth"),
                func.min(TemperatureSalinity.depth).label("min_depth"),
                func.max(TemperatureSalinity.depth).label("max_depth"),
            )
            conditions = []
            if start_time:
                conditions.append(TemperatureSalinity.timestamp >= start_time)
            if end_time:
                conditions.append(TemperatureSalinity.timestamp < end_time)
            if conditions:
                query = query.where(and_(*conditions))
            result = self.session.execute(query).mappings().one()
            return dict(result)
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get statistics: {str(e)}") from e

    def delete_by_time_range(self, start_time: datetime, end_time: datetime) -> int:
        try:
            result = self.session.execute(
                delete(TemperatureSalinity).where(
                    and_(
                        TemperatureSalinity.timestamp >= start_time,
                        TemperatureSalinity.timestamp < end_time,
                    )
                )
            )
            self.session.flush()
            return result.rowcount
        except SQLAlchemyError as e:
            self.session.rollback()
            raise DatabaseError(f"Failed to delete by time range: {str(e)}") from e


class NodeMetricsRepository(BaseRepository[NodeMetrics]):
    def __init__(self, session: Session) -> None:
        super().__init__(NodeMetrics, session)

    def get_latest_by_node_id(self, node_id: str) -> Optional[NodeMetrics]:
        try:
            return self.session.execute(
                select(NodeMetrics)
                .where(NodeMetrics.node_id == node_id)
                .order_by(NodeMetrics.timestamp.desc())
                .limit(1)
            ).scalar_one_or_none()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get latest by node_id: {str(e)}") from e

    def list_by_node_id(
        self,
        node_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 1000,
    ) -> List[NodeMetrics]:
        try:
            conditions = [NodeMetrics.node_id == node_id]
            if start_time:
                conditions.append(NodeMetrics.timestamp >= start_time)
            if end_time:
                conditions.append(NodeMetrics.timestamp < end_time)
            return self.session.execute(
                select(NodeMetrics)
                .where(and_(*conditions))
                .order_by(NodeMetrics.timestamp.desc())
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by node_id: {str(e)}") from e

    def list_by_node_type(
        self,
        node_type: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 1000,
    ) -> List[NodeMetrics]:
        try:
            conditions = [NodeMetrics.node_type == node_type]
            if start_time:
                conditions.append(NodeMetrics.timestamp >= start_time)
            if end_time:
                conditions.append(NodeMetrics.timestamp < end_time)
            return self.session.execute(
                select(NodeMetrics)
                .where(and_(*conditions))
                .order_by(NodeMetrics.timestamp.desc())
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by node type: {str(e)}") from e

    def list_by_time_range(
        self,
        start_time: datetime,
        end_time: datetime,
        skip: int = 0,
        limit: int = 10000,
    ) -> List[NodeMetrics]:
        try:
            return self.session.execute(
                select(NodeMetrics)
                .where(
                    and_(
                        NodeMetrics.timestamp >= start_time,
                        NodeMetrics.timestamp < end_time,
                    )
                )
                .order_by(NodeMetrics.timestamp.desc())
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by time range: {str(e)}") from e

    def list_by_status(
        self,
        status: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 1000,
    ) -> List[NodeMetrics]:
        try:
            conditions = [NodeMetrics.status == status]
            if start_time:
                conditions.append(NodeMetrics.timestamp >= start_time)
            if end_time:
                conditions.append(NodeMetrics.timestamp < end_time)
            return self.session.execute(
                select(NodeMetrics)
                .where(and_(*conditions))
                .order_by(NodeMetrics.timestamp.desc())
                .offset(skip)
                .limit(limit)
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to list by status: {str(e)}") from e

    def get_node_ids(self) -> List[str]:
        try:
            return self.session.execute(
                select(NodeMetrics.node_id).distinct()
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get node ids: {str(e)}") from e

    def get_statistics(
        self,
        node_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        try:
            query = select(
                func.count(NodeMetrics.id).label("total"),
                func.avg(NodeMetrics.cpu_usage).label("avg_cpu_usage"),
                func.max(NodeMetrics.cpu_usage).label("max_cpu_usage"),
                func.avg(NodeMetrics.memory_usage).label("avg_memory_usage"),
                func.max(NodeMetrics.memory_usage).label("max_memory_usage"),
                func.avg(NodeMetrics.disk_usage).label("avg_disk_usage"),
                func.max(NodeMetrics.disk_usage).label("max_disk_usage"),
                func.avg(NodeMetrics.gpu_usage).label("avg_gpu_usage"),
                func.max(NodeMetrics.gpu_usage).label("max_gpu_usage"),
                func.avg(NodeMetrics.load_average).label("avg_load_average"),
                func.max(NodeMetrics.load_average).label("max_load_average"),
            )
            conditions = []
            if node_id:
                conditions.append(NodeMetrics.node_id == node_id)
            if start_time:
                conditions.append(NodeMetrics.timestamp >= start_time)
            if end_time:
                conditions.append(NodeMetrics.timestamp < end_time)
            if conditions:
                query = query.where(and_(*conditions))
            result = self.session.execute(query).mappings().one()
            return dict(result)
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get statistics: {str(e)}") from e

    def get_alerts(
        self,
        cpu_threshold: float = 90.0,
        memory_threshold: float = 90.0,
        disk_threshold: float = 90.0,
        start_time: Optional[datetime] = None,
    ) -> List[NodeMetrics]:
        try:
            conditions = [
                or_(
                    NodeMetrics.cpu_usage >= cpu_threshold,
                    NodeMetrics.memory_usage >= memory_threshold,
                    NodeMetrics.disk_usage >= disk_threshold,
                )
            ]
            if start_time:
                conditions.append(NodeMetrics.timestamp >= start_time)
            return self.session.execute(
                select(NodeMetrics)
                .where(and_(*conditions))
                .order_by(NodeMetrics.timestamp.desc())
            ).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get alerts: {str(e)}") from e

    def delete_by_time_range(self, start_time: datetime, end_time: datetime) -> int:
        try:
            result = self.session.execute(
                delete(NodeMetrics).where(
                    and_(
                        NodeMetrics.timestamp >= start_time,
                        NodeMetrics.timestamp < end_time,
                    )
                )
            )
            self.session.flush()
            return result.rowcount
        except SQLAlchemyError as e:
            self.session.rollback()
            raise DatabaseError(f"Failed to delete by time range: {str(e)}") from e

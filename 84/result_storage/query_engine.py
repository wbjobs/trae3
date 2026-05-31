from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from dataclasses import dataclass
from sqlalchemy import select, func, and_, or_, between, cast, Numeric
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.dialects.postgresql import JSONB
from result_storage.database import DatabaseManager, get_db
from common.exceptions import QueryError, DataValidationError
from common.models import TemperatureSalinity, TaskResult, NodeMetrics


@dataclass
class QueryFilter:
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    min_lon: Optional[float] = None
    max_lon: Optional[float] = None
    min_lat: Optional[float] = None
    max_lat: Optional[float] = None
    min_depth: Optional[float] = None
    max_depth: Optional[float] = None
    data_source: Optional[str] = None
    quality_flag: Optional[int] = None
    min_temperature: Optional[float] = None
    max_temperature: Optional[float] = None
    min_salinity: Optional[float] = None
    max_salinity: Optional[float] = None


@dataclass
class AggregationResult:
    timestamp: Optional[datetime]
    longitude: Optional[float]
    latitude: Optional[float]
    depth: Optional[float]
    avg_temperature: Optional[float]
    min_temperature: Optional[float]
    max_temperature: Optional[float]
    avg_salinity: Optional[float]
    min_salinity: Optional[float]
    max_salinity: Optional[float]
    count: int


class QueryEngine:
    def __init__(
        self,
        db_manager: Optional[DatabaseManager] = None,
        default_limit: int = 10000,
    ) -> None:
        self.db_manager = db_manager or get_db()
        self.default_limit = default_limit

    def _validate_filter(self, query_filter: QueryFilter) -> None:
        if query_filter.start_time and query_filter.end_time:
            if query_filter.start_time >= query_filter.end_time:
                raise DataValidationError("start_time must be less than end_time")
        if query_filter.min_lon is not None and query_filter.max_lon is not None:
            if query_filter.min_lon > query_filter.max_lon:
                raise DataValidationError("min_lon must be less than or equal to max_lon")
            if query_filter.min_lon < -180 or query_filter.max_lon > 180:
                raise DataValidationError("Longitude must be between -180 and 180")
        if query_filter.min_lat is not None and query_filter.max_lat is not None:
            if query_filter.min_lat > query_filter.max_lat:
                raise DataValidationError("min_lat must be less than or equal to max_lat")
            if query_filter.min_lat < -90 or query_filter.max_lat > 90:
                raise DataValidationError("Latitude must be between -90 and 90")
        if query_filter.min_depth is not None and query_filter.max_depth is not None:
            if query_filter.min_depth < 0 or query_filter.max_depth < 0:
                raise DataValidationError("Depth must be non-negative")
            if query_filter.min_depth > query_filter.max_depth:
                raise DataValidationError("min_depth must be less than or equal to max_depth")

    def _build_conditions(self, query_filter: QueryFilter) -> List[Any]:
        conditions = []
        if query_filter.start_time:
            conditions.append(TemperatureSalinity.timestamp >= query_filter.start_time)
        if query_filter.end_time:
            conditions.append(TemperatureSalinity.timestamp < query_filter.end_time)
        if query_filter.min_lon is not None:
            conditions.append(TemperatureSalinity.longitude >= query_filter.min_lon)
        if query_filter.max_lon is not None:
            conditions.append(TemperatureSalinity.longitude <= query_filter.max_lon)
        if query_filter.min_lat is not None:
            conditions.append(TemperatureSalinity.latitude >= query_filter.min_lat)
        if query_filter.max_lat is not None:
            conditions.append(TemperatureSalinity.latitude <= query_filter.max_lat)
        if query_filter.min_depth is not None:
            conditions.append(TemperatureSalinity.depth >= query_filter.min_depth)
        if query_filter.max_depth is not None:
            conditions.append(TemperatureSalinity.depth <= query_filter.max_depth)
        if query_filter.data_source:
            conditions.append(TemperatureSalinity.data_source == query_filter.data_source)
        if query_filter.quality_flag is not None:
            conditions.append(TemperatureSalinity.quality_flag == query_filter.quality_flag)
        if query_filter.min_temperature is not None:
            conditions.append(TemperatureSalinity.temperature >= query_filter.min_temperature)
        if query_filter.max_temperature is not None:
            conditions.append(TemperatureSalinity.temperature <= query_filter.max_temperature)
        if query_filter.min_salinity is not None:
            conditions.append(TemperatureSalinity.salinity >= query_filter.min_salinity)
        if query_filter.max_salinity is not None:
            conditions.append(TemperatureSalinity.salinity <= query_filter.max_salinity)
        return conditions

    def query(
        self,
        query_filter: QueryFilter,
        skip: int = 0,
        limit: Optional[int] = None,
        order_by: Optional[List[str]] = None,
        session: Optional[Session] = None,
    ) -> List[TemperatureSalinity]:
        self._validate_filter(query_filter)
        limit = limit or self.default_limit
        try:
            conditions = self._build_conditions(query_filter)
            query = select(TemperatureSalinity)
            if conditions:
                query = query.where(and_(*conditions))
            if order_by:
                order_columns = []
                for field in order_by:
                    if field.startswith("-"):
                        col = getattr(TemperatureSalinity, field[1:]).desc()
                    else:
                        col = getattr(TemperatureSalinity, field).asc()
                    order_columns.append(col)
                query = query.order_by(*order_columns)
            else:
                query = query.order_by(
                    TemperatureSalinity.timestamp.desc(),
                    TemperatureSalinity.depth.asc(),
                )
            query = query.offset(skip).limit(limit)
            if session:
                return session.execute(query).scalars().all()
            with self.db_manager.get_session() as s:
                return s.execute(query).scalars().all()
        except AttributeError as e:
            raise QueryError(f"Invalid order field: {str(e)}") from e
        except SQLAlchemyError as e:
            raise QueryError(f"Query failed: {str(e)}") from e

    def query_by_time(
        self,
        start_time: datetime,
        end_time: datetime,
        skip: int = 0,
        limit: Optional[int] = None,
    ) -> List[TemperatureSalinity]:
        return self.query(
            QueryFilter(start_time=start_time, end_time=end_time),
            skip=skip,
            limit=limit,
        )

    def query_by_region(
        self,
        min_lon: float,
        max_lon: float,
        min_lat: float,
        max_lat: float,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        skip: int = 0,
        limit: Optional[int] = None,
    ) -> List[TemperatureSalinity]:
        return self.query(
            QueryFilter(
                start_time=start_time,
                end_time=end_time,
                min_lon=min_lon,
                max_lon=max_lon,
                min_lat=min_lat,
                max_lat=max_lat,
            ),
            skip=skip,
            limit=limit,
        )

    def query_by_depth(
        self,
        min_depth: float,
        max_depth: float,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        skip: int = 0,
        limit: Optional[int] = None,
    ) -> List[TemperatureSalinity]:
        return self.query(
            QueryFilter(
                start_time=start_time,
                end_time=end_time,
                min_depth=min_depth,
                max_depth=max_depth,
            ),
            skip=skip,
            limit=limit,
        )

    def query_by_point(
        self,
        longitude: float,
        latitude: float,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        skip: int = 0,
        limit: Optional[int] = None,
    ) -> List[TemperatureSalinity]:
        return self.query(
            QueryFilter(
                start_time=start_time,
                end_time=end_time,
                min_lon=longitude,
                max_lon=longitude,
                min_lat=latitude,
                max_lat=latitude,
            ),
            skip=skip,
            limit=limit,
        )

    def query_by_depth_profile(
        self,
        longitude: float,
        latitude: float,
        timestamp: datetime,
        skip: int = 0,
        limit: Optional[int] = None,
    ) -> List[TemperatureSalinity]:
        return self.query(
            QueryFilter(
                start_time=timestamp,
                end_time=timestamp,
                min_lon=longitude,
                max_lon=longitude,
                min_lat=latitude,
                max_lat=latitude,
            ),
            skip=skip,
            limit=limit,
            order_by=["depth"],
        )

    def query_time_series(
        self,
        longitude: float,
        latitude: float,
        depth: float,
        start_time: datetime,
        end_time: datetime,
        skip: int = 0,
        limit: Optional[int] = None,
    ) -> List[TemperatureSalinity]:
        return self.query(
            QueryFilter(
                start_time=start_time,
                end_time=end_time,
                min_lon=longitude,
                max_lon=longitude,
                min_lat=latitude,
                max_lat=latitude,
                min_depth=depth,
                max_depth=depth,
            ),
            skip=skip,
            limit=limit,
            order_by=["timestamp"],
        )

    def count(self, query_filter: QueryFilter) -> int:
        self._validate_filter(query_filter)
        try:
            conditions = self._build_conditions(query_filter)
            query = select(func.count(TemperatureSalinity.id))
            if conditions:
                query = query.where(and_(*conditions))
            with self.db_manager.get_session() as session:
                return session.execute(query).scalar_one()
        except SQLAlchemyError as e:
            raise QueryError(f"Count query failed: {str(e)}") from e

    def get_statistics(self, query_filter: QueryFilter) -> Dict[str, Any]:
        self._validate_filter(query_filter)
        try:
            conditions = self._build_conditions(query_filter)
            query = select(
                func.count(TemperatureSalinity.id).label("count"),
                func.avg(TemperatureSalinity.temperature).label("avg_temperature"),
                func.min(TemperatureSalinity.temperature).label("min_temperature"),
                func.max(TemperatureSalinity.temperature).label("max_temperature"),
                func.avg(TemperatureSalinity.salinity).label("avg_salinity"),
                func.min(TemperatureSalinity.salinity).label("min_salinity"),
                func.max(TemperatureSalinity.salinity).label("max_salinity"),
                func.avg(TemperatureSalinity.depth).label("avg_depth"),
                func.min(TemperatureSalinity.depth).label("min_depth"),
                func.max(TemperatureSalinity.depth).label("max_depth"),
                func.avg(TemperatureSalinity.pressure).label("avg_pressure"),
                func.avg(TemperatureSalinity.density).label("avg_density"),
                func.avg(TemperatureSalinity.sound_velocity).label("avg_sound_velocity"),
            )
            if conditions:
                query = query.where(and_(*conditions))
            with self.db_manager.get_session() as session:
                result = session.execute(query).mappings().one()
                return dict(result)
        except SQLAlchemyError as e:
            raise QueryError(f"Statistics query failed: {str(e)}") from e

    def aggregate_by_time(
        self,
        query_filter: QueryFilter,
        time_interval: str = "hour",
    ) -> List[AggregationResult]:
        self._validate_filter(query_filter)
        valid_intervals = ["minute", "hour", "day", "week", "month", "year"]
        if time_interval not in valid_intervals:
            raise DataValidationError(
                f"Invalid time_interval. Must be one of: {valid_intervals}"
            )
        try:
            conditions = self._build_conditions(query_filter)
            time_func = {
                "minute": func.date_trunc("minute", TemperatureSalinity.timestamp),
                "hour": func.date_trunc("hour", TemperatureSalinity.timestamp),
                "day": func.date_trunc("day", TemperatureSalinity.timestamp),
                "week": func.date_trunc("week", TemperatureSalinity.timestamp),
                "month": func.date_trunc("month", TemperatureSalinity.timestamp),
                "year": func.date_trunc("year", TemperatureSalinity.timestamp),
            }[time_interval]
            query = select(
                time_func.label("timestamp"),
                func.avg(TemperatureSalinity.temperature).label("avg_temperature"),
                func.min(TemperatureSalinity.temperature).label("min_temperature"),
                func.max(TemperatureSalinity.temperature).label("max_temperature"),
                func.avg(TemperatureSalinity.salinity).label("avg_salinity"),
                func.min(TemperatureSalinity.salinity).label("min_salinity"),
                func.max(TemperatureSalinity.salinity).label("max_salinity"),
                func.count(TemperatureSalinity.id).label("count"),
            )
            if conditions:
                query = query.where(and_(*conditions))
            query = query.group_by("timestamp").order_by("timestamp")
            with self.db_manager.get_session() as session:
                rows = session.execute(query).mappings().all()
                return [
                    AggregationResult(
                    timestamp=row["timestamp"],
                    longitude=None,
                    latitude=None,
                    depth=None,
                    avg_temperature=row["avg_temperature"],
                    min_temperature=row["min_temperature"],
                    max_temperature=row["max_temperature"],
                    avg_salinity=row["avg_salinity"],
                    min_salinity=row["min_salinity"],
                    max_salinity=row["max_salinity"],
                    count=row["count"],
                )
                for row in rows
            ]
        except SQLAlchemyError as e:
            raise QueryError(f"Aggregation query failed: {str(e)}") from e

    def aggregate_by_depth(
        self,
        query_filter: QueryFilter,
        depth_bin_size: float = 10.0,
    ) -> List[AggregationResult]:
        self._validate_filter(query_filter)
        if depth_bin_size <= 0:
            raise DataValidationError("depth_bin_size must be positive")
        try:
            conditions = self._build_conditions(query_filter)
            depth_bin = func.floor(
                TemperatureSalinity.depth / depth_bin_size
            ) * depth_bin_size
            query = select(
                depth_bin.label("depth"),
                func.avg(TemperatureSalinity.temperature).label("avg_temperature"),
                func.min(TemperatureSalinity.temperature).label("min_temperature"),
                func.max(TemperatureSalinity.temperature).label("max_temperature"),
                func.avg(TemperatureSalinity.salinity).label("avg_salinity"),
                func.min(TemperatureSalinity.salinity).label("min_salinity"),
                func.max(TemperatureSalinity.salinity).label("max_salinity"),
                func.count(TemperatureSalinity.id).label("count"),
            )
            if conditions:
                query = query.where(and_(*conditions))
            query = query.group_by("depth").order_by("depth")
            with self.db_manager.get_session() as session:
                rows = session.execute(query).mappings().all()
                return [
                    AggregationResult(
                    timestamp=None,
                    longitude=None,
                    latitude=None,
                    depth=row["depth"],
                    avg_temperature=row["avg_temperature"],
                    min_temperature=row["min_temperature"],
                    max_temperature=row["max_temperature"],
                    avg_salinity=row["avg_salinity"],
                    min_salinity=row["min_salinity"],
                    max_salinity=row["max_salinity"],
                    count=row["count"],
                )
                for row in rows
            ]
        except SQLAlchemyError as e:
            raise QueryError(f"Depth aggregation failed: {str(e)}") from e

    def aggregate_by_region(
        self,
        query_filter: QueryFilter,
        grid_size: float = 1.0,
    ) -> List[AggregationResult]:
        self._validate_filter(query_filter)
        if grid_size <= 0:
            raise DataValidationError("grid_size must be positive")
        try:
            conditions = self._build_conditions(query_filter)
            lon_bin = func.floor(
                cast(TemperatureSalinity.longitude, Numeric) / grid_size
            ) * grid_size
            lat_bin = func.floor(
                cast(TemperatureSalinity.latitude, Numeric) / grid_size
            ) * grid_size
            query = select(
                lon_bin.label("longitude"),
                lat_bin.label("latitude"),
                func.avg(TemperatureSalinity.temperature).label("avg_temperature"),
                func.min(TemperatureSalinity.temperature).label("min_temperature"),
                func.max(TemperatureSalinity.temperature).label("max_temperature"),
                func.avg(TemperatureSalinity.salinity).label("avg_salinity"),
                func.min(TemperatureSalinity.salinity).label("min_salinity"),
                func.max(TemperatureSalinity.salinity).label("max_salinity"),
                func.count(TemperatureSalinity.id).label("count"),
            )
            if conditions:
                query = query.where(and_(*conditions))
            query = query.group_by("longitude", "latitude").order_by("longitude", "latitude")
            with self.db_manager.get_session() as session:
                rows = session.execute(query).mappings().all()
                return [
                    AggregationResult(
                    timestamp=None,
                    longitude=float(row["longitude"]),
                    latitude=float(row["latitude"]),
                    depth=None,
                    avg_temperature=row["avg_temperature"],
                    min_temperature=row["min_temperature"],
                    max_temperature=row["max_temperature"],
                    avg_salinity=row["avg_salinity"],
                    min_salinity=row["min_salinity"],
                    max_salinity=row["max_salinity"],
                    count=row["count"],
                )
                for row in rows
            ]
        except SQLAlchemyError as e:
            raise QueryError(f"Region aggregation failed: {str(e)}") from e

    def get_available_depths(
        self,
        longitude: Optional[float] = None,
        latitude: Optional[float] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> List[float]:
        try:
            conditions = []
            if longitude is not None:
                conditions.append(TemperatureSalinity.longitude == longitude)
            if latitude is not None:
                conditions.append(TemperatureSalinity.latitude == latitude)
            if start_time:
                conditions.append(TemperatureSalinity.timestamp >= start_time)
            if end_time:
                conditions.append(TemperatureSalinity.timestamp < end_time)
            query = select(
                func.distinct(TemperatureSalinity.depth)
            ).order_by(TemperatureSalinity.depth)
            if conditions:
                query = query.where(and_(*conditions))
            with self.db_manager.get_session() as session:
                return session.execute(query).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get available depths: {str(e)}") from e

    def get_data_sources(self) -> List[str]:
        try:
            query = select(
                func.distinct(TemperatureSalinity.data_source)
            ).where(TemperatureSalinity.data_source.isnot(None)
            ).order_by(TemperatureSalinity.data_source)
            with self.db_manager.get_session() as session:
                return session.execute(query).scalars().all()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get data sources: {str(e)}") from e

    def get_time_range(self) -> Tuple[Optional[datetime], Optional[datetime]]:
        try:
            query = select(
                func.min(TemperatureSalinity.timestamp),
                func.max(TemperatureSalinity.timestamp),
            )
            with self.db_manager.get_session() as session:
                return session.execute(query).one()
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get time range: {str(e)}") from e

    def get_spatial_range(self) -> Tuple[float, float, float, float]:
        try:
            query = select(
                func.min(TemperatureSalinity.longitude),
                func.max(TemperatureSalinity.longitude),
                func.min(TemperatureSalinity.latitude),
                func.max(TemperatureSalinity.latitude),
            )
            with self.db_manager.get_session() as session:
                result = session.execute(query).one()
                return (
                    float(result[0]),
                    float(result[1]),
                    float(result[2]),
                    float(result[3]),
                )
        except SQLAlchemyError as e:
            raise QueryError(f"Failed to get spatial range: {str(e)}") from e

    def export_to_json(
        self,
        query_filter: QueryFilter,
        file_path: str,
        limit: Optional[int] = None,
    ) -> int:
        import json
        data = self.query(query_filter, limit=limit)
        records = []
        for ts in data:
            records.append({
                "timestamp": ts.timestamp.isoformat() if ts.timestamp else None,
                "longitude": float(ts.longitude),
                "latitude": float(ts.latitude),
                "depth": ts.depth,
                "temperature": ts.temperature,
                "salinity": ts.salinity,
                "pressure": ts.pressure,
                "conductivity": ts.conductivity,
                "density": ts.density,
                "sound_velocity": ts.sound_velocity,
                "data_source": ts.data_source,
                "quality_flag": ts.quality_flag,
            })
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
        return len(records)

    def export_to_csv(
        self,
        query_filter: QueryFilter,
        file_path: str,
        limit: Optional[int] = None,
    ) -> int:
        import csv
        data = self.query(query_filter, limit=limit)
        fieldnames = [
            "timestamp", "longitude", "latitude", "depth",
            "temperature", "salinity", "pressure", "conductivity",
            "density", "sound_velocity", "data_source", "quality_flag",
        ]
        with open(file_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for ts in data:
                writer.writerow({
                    "timestamp": ts.timestamp.isoformat() if ts.timestamp else None,
                    "longitude": float(ts.longitude),
                    "latitude": float(ts.latitude),
                    "depth": ts.depth,
                    "temperature": ts.temperature,
                    "salinity": ts.salinity,
                    "pressure": ts.pressure,
                    "conductivity": ts.conductivity,
                    "density": ts.density,
                    "sound_velocity": ts.sound_velocity,
                    "data_source": ts.data_source,
                    "quality_flag": ts.quality_flag,
                })
        return len(data)

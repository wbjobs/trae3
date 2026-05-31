from typing import List, Tuple
from datetime import datetime, timedelta
from uuid import uuid4

from common.models import (
    Task,
    TaskPriority,
    Region,
    TemperatureSaltFieldConfig,
)
from common.exceptions import InvalidRegionError, InvalidConfigError


class TaskGenerator:
    def __init__(
        self,
        default_priority: TaskPriority = TaskPriority.MEDIUM,
        default_max_retries: int = 3,
    ) -> None:
        self._default_priority: TaskPriority = default_priority
        self._default_max_retries: int = default_max_retries

    def generate_tasks(
        self,
        config: TemperatureSaltFieldConfig,
        priority: TaskPriority = None,
        max_retries: int = None,
        split_lat: int = 1,
        split_lon: int = 1,
        split_time: int = 1,
    ) -> List[Task]:
        self._validate_config(config)

        priority = priority or self._default_priority
        max_retries = max_retries or self._default_max_retries

        regions = self._split_region(config.region, split_lat, split_lon)
        time_ranges = self._split_time_range(config.time_start, config.time_end, split_time)

        tasks: List[Task] = []
        parent_task_id = uuid4()

        for idx, (region, (time_start, time_end)) in enumerate(
            [(r, t) for r in regions for t in time_ranges]
        ):
            sub_config = TemperatureSaltFieldConfig(
                region=region,
                time_start=time_start,
                time_end=time_end,
                resolution_lat=config.resolution_lat,
                resolution_lon=config.resolution_lon,
                resolution_depth=config.resolution_depth,
                resolution_time=config.resolution_time,
                parameters=config.parameters,
            )

            task = Task(
                name=f"temp_salt_field_{idx:04d}",
                task_type="temperature_salt_field",
                priority=priority,
                config=sub_config,
                region=region,
                max_retries=max_retries,
                parent_task_id=parent_task_id,
                metadata={
                    "split_index": idx,
                    "total_splits": len(regions) * len(time_ranges),
                    "split_lat": split_lat,
                    "split_lon": split_lon,
                    "split_time": split_time,
                },
            )
            tasks.append(task)

        return tasks

    def generate_single_task(
        self,
        config: TemperatureSaltFieldConfig,
        priority: TaskPriority = None,
        max_retries: int = None,
    ) -> Task:
        self._validate_config(config)

        return Task(
            name="temp_salt_field_single",
            task_type="temperature_salt_field",
            priority=priority or self._default_priority,
            config=config,
            region=config.region,
            max_retries=max_retries or self._default_max_retries,
        )

    def _split_region(
        self,
        region: Region,
        split_lat: int,
        split_lon: int,
    ) -> List[Region]:
        if split_lat < 1 or split_lon < 1:
            raise InvalidConfigError("Split count must be greater than or equal to 1")

        lat_step = (region.lat_max - region.lat_min) / split_lat
        lon_step = (region.lon_max - region.lon_min) / split_lon

        regions: List[Region] = []
        for i in range(split_lat):
            lat_min = region.lat_min + i * lat_step
            lat_max = lat_min + lat_step
            for j in range(split_lon):
                lon_min = region.lon_min + j * lon_step
                lon_max = lon_min + lon_step
                regions.append(
                    Region(
                        lat_min=lat_min,
                        lat_max=lat_max,
                        lon_min=lon_min,
                        lon_max=lon_max,
                        depth_min=region.depth_min,
                        depth_max=region.depth_max,
                    )
                )
        return regions

    def _split_time_range(
        self,
        time_start: datetime,
        time_end: datetime,
        split_time: int,
    ) -> List[Tuple[datetime, datetime]]:
        if split_time < 1:
            raise InvalidConfigError("Time split count must be greater than or equal to 1")

        total_duration = time_end - time_start
        split_duration = total_duration / split_time

        time_ranges: List[Tuple[datetime, datetime]] = []
        for i in range(split_time):
            start = time_start + i * split_duration
            end = start + split_duration
            time_ranges.append((start, end))
        return time_ranges

    def _validate_config(self, config: TemperatureSaltFieldConfig) -> None:
        if config.time_start >= config.time_end:
            raise InvalidConfigError("time_start must be before time_end")

        if config.resolution_lat <= 0:
            raise InvalidConfigError("resolution_lat must be greater than 0")
        if config.resolution_lon <= 0:
            raise InvalidConfigError("resolution_lon must be greater than 0")
        if config.resolution_depth <= 0:
            raise InvalidConfigError("resolution_depth must be greater than 0")
        if config.resolution_time <= 0:
            raise InvalidConfigError("resolution_time must be greater than 0")

        self._validate_region(config.region)

    def _validate_region(self, region: Region) -> None:
        if region.lat_min < -90 or region.lat_max > 90:
            raise InvalidRegionError("Latitude must be between -90 and 90")
        if region.lon_min < -180 or region.lon_max > 180:
            raise InvalidRegionError("Longitude must be between -180 and 180")
        if region.depth_min < 0:
            raise InvalidRegionError("Depth must be non-negative")

    def estimate_task_count(
        self,
        config: TemperatureSaltFieldConfig,
        split_lat: int = 1,
        split_lon: int = 1,
        split_time: int = 1,
    ) -> int:
        return split_lat * split_lon * split_time

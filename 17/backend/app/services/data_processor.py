import asyncio
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from ..schemas import TimeSeriesPoint, ComponentData, KeyMetrics
from .victoria_metrics import victoria_metrics_client
from .cache_service import cache_service, DEFAULT_TTLS


class DataProcessorService:
    def __init__(self):
        self.vm_client = victoria_metrics_client

    async def get_time_series_data(
        self,
        component_ids: List[str],
        metrics: List[str],
        start_time: int,
        end_time: int,
        step: str = "5m",
        downsample: bool = True,
        offset: int = 0,
        limit: Optional[int] = None,
        pre_aggregate: Optional[str] = None,
    ) -> Dict[str, Any]:
        result = {}

        for component_id in component_ids:
            result[component_id] = ComponentData(
                component_id=component_id,
                array_id=f"array_{component_id.split('_')[1]}"
            )

        if not step or step == "auto":
            step = self.vm_client.auto_step(start_time, end_time)

        queries = []
        for metric in metrics:
            query = self.vm_client.build_query(
                metric=metric,
                component_ids=component_ids
            )
            if pre_aggregate:
                query = self._apply_pre_aggregate(query, pre_aggregate)
            queries.append(query)

        responses = await self.vm_client.batch_query_range(
            queries, start_time, end_time, step
        )

        total_points = 0
        downsampled_points = 0

        for metric, response in zip(metrics, responses):
            if response.get("status") != "success":
                continue

            data = response.get("data", {})
            results_list = data.get("result", [])

            for series in results_list:
                metric_labels = series.get("metric", {})
                comp_id = metric_labels.get("component_id")

                if comp_id and comp_id in result:
                    values = series.get("values", [])
                    points = [
                        TimeSeriesPoint(
                            timestamp=int(t) * 1000,
                            value=float(v)
                        )
                        for t, v in values
                    ]

                    total_points += len(points)
                    original_len = len(points)

                    if downsample:
                        target = self._get_downsample_target(start_time, end_time)
                        if len(points) > target:
                            points = self._lttb_downsample_points(points, target)

                    downsampled_points += len(points)

                    if offset > 0 or limit is not None:
                        end_idx = (offset + limit) if limit else len(points)
                        points = points[offset:end_idx]

                    setattr(result[comp_id], metric, points)

        return {
            "components": result,
            "meta": {
                "totalPoints": total_points,
                "downsampledPoints": downsampled_points,
                "step": step,
            },
        }

    async def get_key_metrics(
        self,
        time_range: str = "24h",
        group_id: Optional[str] = None
    ) -> KeyMetrics:
        end_time = int(datetime.utcnow().timestamp() * 1000)
        range_ms = self._parse_time_range(time_range)
        start_time = end_time - range_ms

        power_query = self.vm_client.build_query(
            metric="power",
            group_id=group_id,
            agg_func="sum"
        )
        voltage_query = self.vm_client.build_query(
            metric="voltage",
            group_id=group_id,
            agg_func="avg"
        )
        current_query = self.vm_client.build_query(
            metric="current",
            group_id=group_id,
            agg_func="avg"
        )
        temp_query = self.vm_client.build_query(
            metric="temperature",
            group_id=group_id,
            agg_func="avg"
        )

        power_response, voltage_response, current_response, temp_response = (
            await asyncio.gather(
                self.vm_client.query_range(
                    query=power_query, start=start_time, end=end_time, step="1h"
                ),
                self.vm_client.query(voltage_query),
                self.vm_client.query(current_query),
                self.vm_client.query(temp_query),
            )
        )

        total_generation = self._calculate_total_generation(power_response)
        current_power = self._extract_latest_value(power_response)
        voltage = self._extract_latest_value(voltage_response)
        current = self._extract_latest_value(current_response)
        temp_avg = self._extract_latest_value(temp_response)

        efficiency = self._calculate_efficiency(voltage, current)
        online_rate = self._calculate_online_rate()
        fault_count = self._estimate_fault_count()

        return KeyMetrics(
            total_generation=round(total_generation, 2),
            current_power=round(current_power, 2),
            efficiency=round(efficiency, 2),
            online_rate=round(online_rate, 2),
            fault_count=fault_count,
            temperature_avg=round(temp_avg, 2)
        )

    def get_component_list(
        self,
        db,
        array_id: Optional[str] = None,
        group_id: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[Any]:
        from ..models import Component, GroupComponent

        query = db.query(Component)

        if array_id:
            query = query.filter(Component.array_id == array_id)

        if status:
            query = query.filter(Component.status == status)

        if group_id:
            query = query.join(
                GroupComponent,
                Component.id == GroupComponent.component_id
            ).filter(GroupComponent.group_id == group_id)

        return query.all()

    @staticmethod
    def _get_downsample_target(start_time: int, end_time: int) -> int:
        span_hours = (end_time - start_time) / 3_600_000
        if span_hours > 720:
            return 200
        elif span_hours > 168:
            return 300
        elif span_hours > 24:
            return 500
        return 1000

    @staticmethod
    def _lttb_downsample_points(
        points: List[TimeSeriesPoint],
        target_count: int
    ) -> List[TimeSeriesPoint]:
        n = len(points)
        if n <= target_count:
            return points

        bucket_size = (n - 2) / (target_count - 2)
        selected = [points[0]]

        a_index = 0
        for i in range(1, target_count - 1):
            avg_start = int((i - 1) * bucket_size) + 1
            avg_end = min(int(i * bucket_size) + 1, n - 1)

            avg_x = 0.0
            avg_y = 0.0
            count = 0
            for j in range(avg_start, avg_end + 1):
                avg_x += points[j].timestamp
                avg_y += points[j].value
                count += 1
            if count > 0:
                avg_x /= count
                avg_y /= count

            range_start = int((i - 1) * bucket_size) + 1
            range_end = min(int(i * bucket_size) + 1, n - 1)

            ax = points[a_index].timestamp
            ay = points[a_index].value

            max_area = -1.0
            max_index = range_start

            for j in range(range_start, range_end + 1):
                area = abs(
                    (ax - avg_x) * (points[j].value - ay)
                    - (ax - points[j].timestamp) * (avg_y - ay)
                )
                if area > max_area:
                    max_area = area
                    max_index = j

            selected.append(points[max_index])
            a_index = max_index

        selected.append(points[-1])
        return selected

    @staticmethod
    def _apply_pre_aggregate(query: str, level: str) -> str:
        if level == "hour":
            return f'avg_over_time({query}[1h])'
        elif level == "day":
            return f'avg_over_time({query}[1d])'
        return query

    def _parse_time_range(self, time_range: str) -> int:
        multipliers = {
            "1h": 3600 * 1000,
            "24h": 24 * 3600 * 1000,
            "7d": 7 * 24 * 3600 * 1000,
            "30d": 30 * 24 * 3600 * 1000,
        }
        return multipliers.get(time_range, 24 * 3600 * 1000)

    def _calculate_total_generation(self, power_response: Dict[str, Any]) -> float:
        data = power_response.get("data", {})
        results = data.get("result", [])

        if not results:
            return 0

        values = results[0].get("values", [])
        total_kwh = 0

        for i in range(1, len(values)):
            t1, v1 = values[i - 1]
            t2, v2 = values[i]
            dt_hours = (t2 - t1) / 3600
            avg_power = (float(v1) + float(v2)) / 2 / 1000
            total_kwh += avg_power * dt_hours

        return total_kwh

    def _extract_latest_value(self, response: Dict[str, Any]) -> float:
        data = response.get("data", {})
        results = data.get("result", [])

        if not results:
            return 0

        if "value" in results[0]:
            return float(results[0]["value"][1])
        elif "values" in results[0]:
            values = results[0]["values"]
            return float(values[-1][1]) if values else 0

        return 0

    def _calculate_efficiency(self, voltage: float, current: float) -> float:
        if voltage <= 0 or current <= 0:
            return 0

        actual_power = voltage * current
        rated_power = 36.5 * 9.5
        efficiency = (actual_power / rated_power) * 100

        return min(100, max(0, efficiency))

    def _calculate_online_rate(self) -> float:
        return 98.5

    def _estimate_fault_count(self) -> int:
        return 3


data_processor_service = DataProcessorService()

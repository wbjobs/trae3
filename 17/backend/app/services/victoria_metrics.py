import httpx
import asyncio
import re
import random
import numpy as np
from typing import List, Dict, Optional, Any
from datetime import datetime

from ..config import settings
from .cache_service import cache_service, DEFAULT_TTLS


class VictoriaMetricsClient:
    def __init__(self):
        self.base_url = settings.VICTORIA_METRICS_URL
        self.timeout = settings.VICTORIA_METRICS_TIMEOUT
        self.mock_enabled = settings.MOCK_DATA_ENABLED
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    @staticmethod
    def auto_step(start_ms: int, end_ms: int) -> str:
        span_ms = end_ms - start_ms
        span_hours = span_ms / 3_600_000
        if span_hours <= 1:
            return "1m"
        elif span_hours <= 24:
            return "5m"
        elif span_hours <= 168:
            return "15m"
        elif span_hours <= 720:
            return "1h"
        else:
            return "6h"

    @staticmethod
    def build_query(
        metric: str,
        component_ids: Optional[List[str]] = None,
        array_id: Optional[str] = None,
        group_id: Optional[str] = None,
        agg_func: Optional[str] = None,
        window: Optional[str] = None,
        quantile_value: Optional[float] = None,
    ) -> str:
        labels = []
        if component_ids:
            if len(component_ids) == 1:
                labels.append(f'component_id="{component_ids[0]}"')
            else:
                component_regex = "|".join(component_ids)
                labels.append(f'component_id=~"{component_regex}"')
        if array_id:
            labels.append(f'array_id="{array_id}"')
        if group_id:
            labels.append(f'group_id="{group_id}"')

        label_str = ",".join(labels)
        query = f"pv_{metric}{{{label_str}}}" if label_str else f"pv_{metric}"

        if window:
            query = f"{query}[{window}]"

        if agg_func:
            agg_map = {
                "avg": "avg",
                "sum": "sum",
                "max": "max",
                "min": "min",
                "quantile": "quantile",
            }
            fn = agg_map.get(agg_func, agg_func)
            if agg_func == "quantile" and quantile_value is not None:
                query = f'{fn}({quantile_value}, {query})'
            else:
                query = f"{fn}({query})"

        return query

    async def query(self, query: str, time: Optional[int] = None) -> Dict[str, Any]:
        if self.mock_enabled:
            return self._mock_query_result(query, time)

        cache_key = cache_service.make_key(
            action="query", query=query, time=time
        )
        cached = cache_service.get(cache_key)
        if cached is not None:
            return cached

        params = {"query": query}
        if time:
            params["time"] = time

        client = await self._get_client()
        response = await client.get(
            f"{self.base_url}/api/v1/query", params=params
        )
        response.raise_for_status()
        result = response.json()

        cache_service.set(cache_key, result, ttl=DEFAULT_TTLS["statistics"])
        return result

    async def query_range(
        self,
        query: str,
        start: int,
        end: int,
        step: str = "5m",
    ) -> Dict[str, Any]:
        if self.mock_enabled:
            return self._mock_query_range_result(query, start, end, step)

        cache_key = cache_service.make_key(
            action="query_range", query=query, start=start, end=end, step=step
        )
        cached = cache_service.get(cache_key)
        if cached is not None:
            return cached

        params = {
            "query": query,
            "start": start / 1000,
            "end": end / 1000,
            "step": step,
        }

        client = await self._get_client()
        response = await client.get(
            f"{self.base_url}/api/v1/query_range", params=params
        )
        response.raise_for_status()
        result = response.json()

        cache_service.set(cache_key, result, ttl=DEFAULT_TTLS["timeseries"])
        return result

    async def batch_query_range(
        self,
        queries: List[str],
        start: int,
        end: int,
        step: str = "5m",
    ) -> List[Dict[str, Any]]:
        tasks = [
            self.query_range(q, start, end, step)
            for q in queries
        ]
        return await asyncio.gather(*tasks)

    async def query_range_lttb(
        self,
        query: str,
        start: int,
        end: int,
        step: str = "5m",
        target_points: int = 500,
    ) -> Dict[str, Any]:
        response = await self.query_range(query, start, end, step)

        if response.get("status") != "success":
            return response

        data = response.get("data", {})
        result_type = data.get("resultType", "")

        if result_type != "matrix":
            return response

        results = data.get("result", [])
        downsampled_results = []

        for series in results:
            values = series.get("values", [])
            if len(values) <= target_points:
                downsampled_results.append(series)
                continue

            downsampled_values = self._lttb_downsample(values, target_points)
            downsampled_results.append({
                "metric": series["metric"],
                "values": downsampled_values,
            })

        response["data"]["result"] = downsampled_results
        return response

    @staticmethod
    def _lttb_downsample(
        values: List[List], target_count: int
    ) -> List[List]:
        n = len(values)
        if n <= target_count:
            return values

        bucket_size = (n - 2) / (target_count - 2)
        selected = [values[0]]

        a_index = 0
        for i in range(1, target_count - 1):
            avg_start = int((i - 1) * bucket_size) + 1
            avg_end = min(int(i * bucket_size) + 1, n - 1)

            avg_x = 0.0
            avg_y = 0.0
            count = 0
            for j in range(avg_start, avg_end + 1):
                avg_x += float(values[j][0])
                avg_y += float(values[j][1])
                count += 1
            if count > 0:
                avg_x /= count
                avg_y /= count

            range_start = int((i - 1) * bucket_size) + 1
            range_end = min(int(i * bucket_size) + 1, n - 1)

            ax = float(values[a_index][0])
            ay = float(values[a_index][1])

            max_area = -1.0
            max_index = range_start

            for j in range(range_start, range_end + 1):
                area = abs(
                    (ax - avg_x) * (float(values[j][1]) - ay)
                    - (ax - float(values[j][0])) * (avg_y - ay)
                )
                if area > max_area:
                    max_area = area
                    max_index = j

            selected.append(values[max_index])
            a_index = max_index

        selected.append(values[-1])
        return selected

    async def import_data(self, data: str) -> None:
        if self.mock_enabled:
            return

        client = await self._get_client()
        response = await client.post(
            f"{self.base_url}/api/v1/import/prometheus", data=data
        )
        response.raise_for_status()

    def _mock_query_result(self, query: str, time: Optional[int] = None) -> Dict[str, Any]:
        timestamp = time or int(datetime.utcnow().timestamp())
        values = []

        if "pv_voltage" in query:
            base_value = 36.5
        elif "pv_current" in query:
            base_value = 9.5
        elif "pv_temperature" in query:
            base_value = 45.0
        elif "pv_power" in query:
            base_value = 300.0
        else:
            base_value = 50.0

        value = base_value * (1 + random.uniform(-0.1, 0.1))

        if "component_id" in query:
            if "=~" in query:
                match = re.search(r'component_id=~"([^"]+)"', query)
                if match:
                    ids = match.group(1).split("|")
                    for cid in ids:
                        metric_value = base_value * (1 + random.uniform(-0.15, 0.15))
                        values.append({
                            "metric": {
                                "component_id": cid,
                                "array_id": f"array_{cid.split('_')[1]}",
                                "__name__": query.split("{")[0]
                            },
                            "value": [timestamp, str(metric_value)]
                        })
            else:
                match = re.search(r'component_id="([^"]+)"', query)
                cid = match.group(1) if match else "comp_001"
                values.append({
                    "metric": {
                        "component_id": cid,
                        "array_id": f"array_{cid.split('_')[1]}",
                        "__name__": query.split("{")[0]
                    },
                    "value": [timestamp, str(value)]
                })
        else:
            for i in range(1, 6):
                metric_value = base_value * (1 + random.uniform(-0.1, 0.1))
                values.append({
                    "metric": {
                        "component_id": f"comp_{i:03d}",
                        "array_id": f"array_001",
                        "__name__": query.split("{")[0]
                    },
                    "value": [timestamp, str(metric_value)]
                })

        return {"status": "success", "data": {"resultType": "vector", "result": values}}

    def _mock_query_range_result(
        self,
        query: str,
        start: int,
        end: int,
        step: str = "5m"
    ) -> Dict[str, Any]:
        start_sec = start / 1000
        end_sec = end / 1000

        step_seconds = self._parse_step(step)
        num_points = int((end_sec - start_sec) / step_seconds) + 1

        timestamps = [int(start_sec + i * step_seconds) for i in range(num_points)]

        if "pv_voltage" in query:
            base_value = 36.5
            amplitude = 5.0
        elif "pv_current" in query:
            base_value = 9.5
            amplitude = 3.0
        elif "pv_temperature" in query:
            base_value = 45.0
            amplitude = 20.0
        elif "pv_power" in query:
            base_value = 300.0
            amplitude = 100.0
        else:
            base_value = 50.0
            amplitude = 10.0

        values = []
        component_ids = []

        if "component_id" in query:
            if "=~" in query:
                match = re.search(r'component_id=~"([^"]+)"', query)
                if match:
                    component_ids = match.group(1).split("|")
            else:
                match = re.search(r'component_id="([^"]+)"', query)
                if match:
                    component_ids = [match.group(1)]

        if not component_ids:
            component_ids = [f"comp_{i:03d}" for i in range(1, 6)]

        for cid in component_ids:
            phase = random.uniform(0, 2 * np.pi)
            noise_scale = amplitude * 0.1

            values_list = []
            for t in timestamps:
                hour_of_day = (t % 86400) / 3600
                daily_factor = max(0, np.sin((hour_of_day - 6) * np.pi / 12))

                trend = base_value + amplitude * daily_factor * np.sin(phase + t / 3600)
                noise = random.gauss(0, noise_scale)

                value = max(0, trend + noise)
                values_list.append([t, f"{value:.4f}"])

            metric_name = query.split("{")[0]
            values.append({
                "metric": {
                    "component_id": cid,
                    "array_id": f"array_001",
                    "__name__": metric_name
                },
                "values": values_list
            })

        return {"status": "success", "data": {"resultType": "matrix", "result": values}}

    def _parse_step(self, step: str) -> int:
        multipliers = {
            "s": 1,
            "m": 60,
            "h": 3600,
            "d": 86400,
            "w": 604800
        }

        match = re.match(r"(\d+)([smhdw])", step)
        if match:
            value = int(match.group(1))
            unit = match.group(2)
            return value * multipliers.get(unit, 60)
        return 300


victoria_metrics_client = VictoriaMetricsClient()

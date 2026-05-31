import time
import hashlib
import json
from typing import Any, Dict, Optional, Callable
from collections import OrderedDict
from threading import Lock


class QueryCache:
    def __init__(self, max_size: int = 100, ttl: int = 300):
        self.cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
        self.max_size = max_size
        self.ttl = ttl
        self.lock = Lock()
        self.hits = 0
        self.misses = 0

    def _get_key(self, params: Dict[str, Any]) -> str:
        sorted_params = json.dumps(params, sort_keys=True, default=str)
        return hashlib.md5(sorted_params.encode()).hexdigest()

    def get(self, params: Dict[str, Any]) -> Optional[Any]:
        key = self._get_key(params)
        with self.lock:
            if key in self.cache:
                entry = self.cache[key]
                if time.time() - entry["timestamp"] < self.ttl:
                    self.hits += 1
                    self.cache.move_to_end(key)
                    return entry["data"]
                else:
                    del self.cache[key]
            self.misses += 1
            return None

    def set(self, params: Dict[str, Any], data: Any) -> None:
        key = self._get_key(params)
        with self.lock:
            if key in self.cache:
                self.cache.move_to_end(key)
            elif len(self.cache) >= self.max_size:
                self.cache.popitem(last=False)
            self.cache[key] = {
                "data": data,
                "timestamp": time.time()
            }

    def clear(self) -> None:
        with self.lock:
            self.cache.clear()
            self.hits = 0
            self.misses = 0

    def invalidate_pattern(self, pattern: str) -> int:
        count = 0
        with self.lock:
            keys_to_remove = [k for k in self.cache if pattern in k]
            for k in keys_to_remove:
                del self.cache[k]
                count += 1
        return count

    def get_stats(self) -> Dict[str, Any]:
        total = self.hits + self.misses
        hit_rate = self.hits / total if total > 0 else 0
        return {
            "size": len(self.cache),
            "max_size": self.max_size,
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": hit_rate,
            "ttl": self.ttl
        }


class DataAggregator:
    def __init__(self, db):
        self.db = db

    def aggregate_vibration_data(
        self,
        device_code: str,
        start_time: datetime,
        end_time: datetime,
        aggregation: str = "1min",
        include_fft: bool = False
    ) -> Dict[str, Any]:
        from app.models.vibration_data import VibrationData
        from sqlalchemy import func, and_
        import pandas as pd
        import numpy as np

        interval_seconds = {
            "1s": 1,
            "10s": 10,
            "30s": 30,
            "1min": 60,
            "5min": 300,
            "15min": 900,
            "1hour": 3600
        }.get(aggregation, 60)

        query = self.db.query(VibrationData).filter(
            and_(
                VibrationData.device_code == device_code,
                VibrationData.timestamp >= start_time,
                VibrationData.timestamp <= end_time
            )
        ).order_by(VibrationData.timestamp).yield_per(10000)

        data = []
        timestamps = []
        for row in query:
            data.append({
                "timestamp": row.timestamp,
                "x": row.x_axis,
                "y": row.y_axis,
                "z": row.z_axis,
                "temp": row.temperature or 0,
                "speed": row.speed or 0
            })
            timestamps.append(row.timestamp)

        if not data:
            return {
                "device_code": device_code,
                "aggregation": aggregation,
                "interval_seconds": interval_seconds,
                "count": 0,
                "timestamps": [],
                "aggregated_data": {}
            }

        df = pd.DataFrame(data)
        df.set_index("timestamp", inplace=True)

        agg_dict = {
            "x": ["mean", "std", "min", "max", "count"],
            "y": ["mean", "std", "min", "max"],
            "z": ["mean", "std", "min", "max"],
            "temp": ["mean", "max"],
            "speed": ["mean"]
        }

        rule = f"{interval_seconds}s"
        aggregated = df.resample(rule).agg(agg_dict)

        result = {
            "device_code": device_code,
            "aggregation": aggregation,
            "interval_seconds": interval_seconds,
            "original_count": len(data),
            "aggregated_count": len(aggregated),
            "timestamps": [t.strftime("%Y-%m-%d %H:%M:%S") for t in aggregated.index],
            "aggregated_data": {}
        }

        for axis in ["x", "y", "z"]:
            result["aggregated_data"][axis] = {
                "mean": aggregated[(axis, "mean")].tolist(),
                "std": aggregated[(axis, "std")].fillna(0).tolist(),
                "min": aggregated[(axis, "min")].tolist(),
                "max": aggregated[(axis, "max")].tolist(),
                "rms": np.sqrt(np.array(aggregated[(axis, "mean")].tolist()) ** 2).tolist()
            }

        result["aggregated_data"]["x"]["count"] = aggregated[("x", "count")].tolist()

        result["aggregated_data"]["temperature"] = {
            "mean": aggregated[("temp", "mean")].tolist(),
            "max": aggregated[("temp", "max")].tolist()
        }
        result["aggregated_data"]["speed"] = {
            "mean": aggregated[("speed", "mean")].tolist()
        }

        if include_fft and len(data) >= 1024:
            from app.services.timeseries_calculator import TimeSeriesCalculator

            fft_result = {}
            for axis in ["x", "y", "z"]:
                values = np.array([d[axis] for d in data])
                frequencies, magnitudes = TimeSeriesCalculator.calculate_fft(values)
                dom_freq, dom_mag = TimeSeriesCalculator.find_dominant_frequency(frequencies, magnitudes)
                harmonics = TimeSeriesCalculator.find_harmonics(frequencies, magnitudes, dom_freq)

                fft_result[axis] = {
                    "dominant_frequency": float(dom_freq),
                    "dominant_magnitude": float(dom_mag),
                    "harmonics": harmonics
                }
            result["fft_summary"] = fft_result

        return result


vibration_query_cache = QueryCache(max_size=100, ttl=300)
analysis_query_cache = QueryCache(max_size=50, ttl=600)


def cached_query(cache: QueryCache, func: Callable, params: Dict[str, Any]) -> Any:
    result = cache.get(params)
    if result is not None:
        return result, True
    result = func()
    cache.set(params, result)
    return result, False


from datetime import datetime

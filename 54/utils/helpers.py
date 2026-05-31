import math
import hashlib
import json
import time
from datetime import datetime
from functools import wraps
from typing import List, Callable, Any, Tuple, TypeVar, Type, Optional, Dict
from pathlib import Path

import numpy as np
from scipy.spatial.distance import cdist

from models.models import Region, GridPoint, WeatherStationData
from utils.logger import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def generate_grid_points(region: Region, resolution: float = 0.01) -> List[GridPoint]:
    lats = np.arange(region.min_latitude, region.max_latitude + resolution, resolution)
    lons = np.arange(region.min_longitude, region.max_longitude + resolution, resolution)

    grid_points = []
    for lat in lats:
        for lon in lons:
            grid_points.append(GridPoint(latitude=float(lat), longitude=float(lon)))

    return grid_points


def compute_data_hash(data: Any) -> str:
    if isinstance(data, Path):
        hasher = hashlib.sha256()
        with open(data, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    if isinstance(data, (list, dict)):
        data_str = json.dumps(data, sort_keys=True, default=str)
    else:
        data_str = str(data)

    return hashlib.sha256(data_str.encode("utf-8")).hexdigest()


def retry_with_backoff(
    max_attempts: int = 3,
    initial_delay: float = 1.0,
    backoff_factor: float = 2.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,),
) -> Callable:
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> T:
            delay = initial_delay
            last_exception: Optional[Exception] = None

            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        time.sleep(delay)
                        delay *= backoff_factor

            assert last_exception is not None
            raise last_exception

        return wrapper

    return decorator


def validate_station_data(station: WeatherStationData, variable: str) -> bool:
    value = station.get_value(variable)
    if value is None:
        return False

    ranges = {
        "temperature": (-60.0, 60.0),
        "humidity": (0.0, 100.0),
        "pressure": (800.0, 1100.0),
        "wind_speed": (0.0, 150.0),
        "precipitation": (0.0, 2000.0),
    }

    if variable in ranges:
        min_val, max_val = ranges[variable]
        return min_val <= value <= max_val

    return True


def chunk_list(items: List[T], chunk_size: int) -> List[List[T]]:
    return [items[i : i + chunk_size] for i in range(0, len(items), chunk_size)]


def detect_outliers_iqr(values: np.ndarray, iqr_factor: float = 1.5) -> np.ndarray:
    q1 = np.percentile(values, 25)
    q3 = np.percentile(values, 75)
    iqr = q3 - q1

    lower_bound = q1 - iqr_factor * iqr
    upper_bound = q3 + iqr_factor * iqr

    return (values < lower_bound) | (values > upper_bound)


def detect_outliers_zscore(values: np.ndarray, threshold: float = 3.0) -> np.ndarray:
    if len(values) < 3:
        return np.zeros(len(values), dtype=bool)

    mean = np.mean(values)
    std = np.std(values)

    if std == 0:
        return np.zeros(len(values), dtype=bool)

    z_scores = np.abs((values - mean) / std)
    return z_scores > threshold


def detect_outliers(values: np.ndarray, method: str = "iqr") -> np.ndarray:
    if method == "iqr":
        return detect_outliers_iqr(values)
    elif method == "zscore":
        return detect_outliers_zscore(values)
    else:
        raise ValueError(f"Unknown outlier detection method: {method}")


def smooth_spatial_data(
    values: np.ndarray,
    coords: np.ndarray,
    smoothing_factor: float = 0.1,
) -> np.ndarray:
    if len(values) < 5:
        return values

    distances = cdist(coords, coords)
    weights = np.exp(-distances ** 2 / (2 * smoothing_factor ** 2))
    weights = weights / weights.sum(axis=1, keepdims=True)

    smoothed = weights @ values
    return smoothed


def estimate_variogram(
    coords: np.ndarray,
    values: np.ndarray,
    max_distance: Optional[float] = None,
    n_bins: int = 20,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    if max_distance is None:
        pairwise_distances = cdist(coords, coords)
        max_distance = np.max(pairwise_distances) * 0.5

    pairwise_distances = cdist(coords, coords)
    pairwise_sq_diff = (values[:, np.newaxis] - values[np.newaxis, :]) ** 2

    bins = np.linspace(0, max_distance, n_bins + 1)
    bin_centers = (bins[:-1] + bins[1:]) / 2

    variogram = np.zeros(n_bins)
    counts = np.zeros(n_bins)

    for i in range(n_bins):
        mask = (pairwise_distances >= bins[i]) & (pairwise_distances < bins[i + 1])
        if np.any(mask):
            variogram[i] = 0.5 * np.mean(pairwise_sq_diff[mask])
            counts[i] = np.sum(mask)

    valid_mask = counts > 0
    return bin_centers[valid_mask], variogram[valid_mask], counts[valid_mask]


def fit_variogram_model(
    bin_centers: np.ndarray,
    variogram: np.ndarray,
    model: str = "spherical",
) -> Dict[str, float]:
    if len(bin_centers) < 3:
        return {
            "nugget": 0.0,
            "sill": np.max(variogram) if len(variogram) > 0 else 1.0,
            "range": np.max(bin_centers) if len(bin_centers) > 0 else 1.0,
        }

    nugget = variogram[0] if len(variogram) > 0 else 0.0
    sill = np.max(variogram)
    range_val = bin_centers[np.argmin(np.abs(variogram - 0.95 * (sill - nugget)))] if sill > nugget else bin_centers[-1]

    if model == "spherical":
        def model_func(h, n, s, r):
            return np.where(
                h <= r,
                n + (s - n) * (1.5 * (h / r) - 0.5 * (h / r) ** 3),
                s,
            )
    elif model == "exponential":
        def model_func(h, n, s, r):
            return n + (s - n) * (1 - np.exp(-h / r))
    elif model == "gaussian":
        def model_func(h, n, s, r):
            return n + (s - n) * (1 - np.exp(-(h / r) ** 2))
    else:
        raise ValueError(f"Unknown variogram model: {model}")

    try:
        from scipy.optimize import curve_fit

        popt, _ = curve_fit(
            model_func,
            bin_centers,
            variogram,
            p0=[nugget, sill, range_val],
            bounds=([0, 0, 0], [np.inf, np.inf, np.inf]),
            maxfev=10000,
        )
        nugget, sill, range_val = popt
    except Exception as e:
        logger.warning(f"Variogram fitting failed, using initial values: {e}")

    return {
        "nugget": float(max(0, nugget)),
        "sill": float(max(nugget, sill)),
        "range": float(max(0.01, range_val)),
    }


def post_process_results(
    values: np.ndarray,
    coords: np.ndarray,
    station_values: np.ndarray,
    station_coords: np.ndarray,
    variable: str,
) -> np.ndarray:
    processed = values.copy()

    phys_ranges = {
        "temperature": (-60.0, 60.0),
        "humidity": (0.0, 100.0),
        "pressure": (800.0, 1100.0),
        "wind_speed": (0.0, 150.0),
        "precipitation": (0.0, 2000.0),
    }

    if variable in phys_ranges:
        min_val, max_val = phys_ranges[variable]
        processed = np.clip(processed, min_val, max_val)

    if len(station_values) > 0:
        station_min = np.min(station_values)
        station_max = np.max(station_values)

        margin = (station_max - station_min) * 0.2
        extended_min = station_min - margin
        extended_max = station_max + margin

        if variable in phys_ranges:
            extended_min = max(extended_min, phys_ranges[variable][0])
            extended_max = min(extended_max, phys_ranges[variable][1])

        processed = np.clip(processed, extended_min, extended_max)

    return processed


def calculate_data_quality_score(
    stations: List[WeatherStationData],
    variable: str,
    region: Region,
) -> Dict[str, Any]:
    values = np.array([s.get_value(variable) for s in stations if s.get_value(variable) is not None])
    coords = np.array([[s.latitude, s.longitude] for s in stations if s.get_value(variable) is not None])

    if len(values) == 0:
        return {"score": 0.0, "issues": ["No valid data"]}

    issues = []
    score = 1.0

    outliers = detect_outliers(values)
    outlier_ratio = np.sum(outliers) / len(values)
    if outlier_ratio > 0.1:
        issues.append(f"High outlier ratio: {outlier_ratio:.1%}")
        score *= (1 - outlier_ratio)

    n = len(values)
    area = region.area if region.area > 0 else 1.0
    density = n / area
    if density < 5:
        issues.append(f"Low station density: {density:.1f} stations/deg²")
        score *= min(1.0, density / 10.0)

    lat_min, lat_max = np.min(coords[:, 0]), np.max(coords[:, 0])
    lon_min, lon_max = np.min(coords[:, 1]), np.max(coords[:, 1])
    coverage = ((lat_max - lat_min) * (lon_max - lon_min)) / (region.area if region.area > 0 else 1.0)
    if coverage < 0.7:
        issues.append(f"Low spatial coverage: {coverage:.1%}")
        score *= min(1.0, coverage / 0.7)

    if hasattr(stations[0], 'timestamp') and stations[0].timestamp:
        timestamps = [s.timestamp for s in stations if s.timestamp]
        if timestamps:
            time_std = np.std([t.timestamp() for t in timestamps])
            if time_std > 3600:
                issues.append(f"High time variance: {time_std/60:.0f} min")
                score *= max(0.5, 1 - time_std / 7200)

    return {
        "score": float(max(0.0, min(1.0, score))),
        "n_stations": n,
        "outlier_ratio": float(outlier_ratio),
        "density": float(density),
        "coverage": float(coverage),
        "issues": issues,
    }


def generate_random_stations(
    region: Region,
    n_stations: int = 20,
    seed: Optional[int] = None,
) -> List[WeatherStationData]:
    if seed is not None:
        np.random.seed(seed)

    stations = []
    for i in range(n_stations):
        lat = region.min_latitude + np.random.rand() * (region.max_latitude - region.min_latitude)
        lon = region.min_longitude + np.random.rand() * (region.max_longitude - region.min_longitude)

        station = WeatherStationData(
            station_id=f"station_{i:03d}",
            latitude=float(lat),
            longitude=float(lon),
            timestamp=datetime.utcnow(),
            temperature=float(20 + np.random.randn() * 5),
            humidity=float(60 + np.random.randn() * 10),
            pressure=float(1013 + np.random.randn() * 5),
            wind_speed=float(5 + np.random.rand() * 10),
            precipitation=float(max(0, np.random.randn() * 2)),
        )
        stations.append(station)

    return stations

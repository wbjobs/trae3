import numpy as np
from typing import List, Optional, Tuple, Dict, Any
from scipy.spatial.distance import cdist
from scipy.interpolate import griddata

from config.settings import get_settings
from models.models import (
    Region,
    GridPoint,
    WeatherStationData,
    InterpolationResult,
)
from utils.logger import get_logger
from utils.helpers import (
    generate_grid_points,
    validate_station_data,
    calculate_distance,
    detect_outliers,
    smooth_spatial_data,
    estimate_variogram,
    fit_variogram_model,
    post_process_results,
    calculate_data_quality_score,
)

logger = get_logger(__name__)


class MeteorologyCalculator:
    def __init__(self, config: Optional[dict] = None):
        settings = get_settings()
        self.default_method = config.get("method", settings.interpolation.method) if config else settings.interpolation.method
        self.default_resolution = (
            config.get("grid_resolution", settings.interpolation.grid_resolution)
            if config
            else settings.interpolation.grid_resolution
        )
        self.search_radius = (
            config.get("search_radius", settings.interpolation.search_radius)
            if config
            else settings.interpolation.search_radius
        )
        self.min_points = (
            config.get("min_points", settings.interpolation.min_points)
            if config
            else settings.interpolation.min_points
        )
        self.max_points = (
            config.get("max_points", settings.interpolation.max_points)
            if config
            else settings.interpolation.max_points
        )

        logger.info(
            f"MeteorologyCalculator initialized - method: {self.default_method}, "
            f"resolution: {self.default_resolution}°"
        )

    def interpolate(
        self,
        stations: List[WeatherStationData],
        region: Region,
        variables: List[str],
        method: Optional[str] = None,
        grid_resolution: Optional[float] = None,
    ) -> List[InterpolationResult]:
        method = method or self.default_method
        grid_resolution = grid_resolution or self.default_resolution

        logger.info(
            f"Starting interpolation - region: {region.name}, "
            f"variables: {variables}, method: {method}"
        )

        grid_points = generate_grid_points(region, grid_resolution)
        logger.info(f"Generated {len(grid_points)} grid points")

        results = []
        for variable in variables:
            try:
                result = self._interpolate_variable(
                    stations=stations,
                    variable=variable,
                    grid_points=grid_points,
                    method=method,
                    region=region,
                )
                results.append(result)
                logger.info(
                    f"Interpolation completed for {variable} - "
                    f"quality score: {result.quality_score:.2f}"
                )
            except Exception as e:
                logger.error(f"Interpolation failed for {variable}: {e}", exc_info=True)
                raise

        return results

    def _interpolate_variable(
        self,
        stations: List[WeatherStationData],
        variable: str,
        grid_points: List[GridPoint],
        method: str,
        region: Region,
    ) -> InterpolationResult:
        data_quality = calculate_data_quality_score(stations, variable, region)
        logger.info(
            f"Data quality for {variable}: {data_quality['score']:.3f} - "
            f"issues: {data_quality.get('issues', [])}"
        )

        valid_stations = [s for s in stations if validate_station_data(s, variable)]
        logger.info(f"Valid stations for {variable}: {len(valid_stations)}/{len(stations)}")

        if len(valid_stations) < self.min_points:
            raise ValueError(
                f"Insufficient valid stations for {variable}: "
                f"{len(valid_stations)} < {self.min_points}"
            )

        station_coords = np.array(
            [[s.latitude, s.longitude] for s in valid_stations]
        )
        station_values = np.array([s.get_value(variable) for s in valid_stations])

        n_outliers = 0
        outlier_mask = detect_outliers(station_values, method="iqr")
        n_outliers = np.sum(outlier_mask)
        if n_outliers > 0:
            logger.warning(
                f"Detected {n_outliers} outliers for {variable} "
                f"({n_outliers/len(station_values):.1%}), removing them"
            )
            station_coords = station_coords[~outlier_mask]
            station_values = station_values[~outlier_mask]
            valid_stations = [s for s, mask in zip(valid_stations, ~outlier_mask) if mask]

            if len(valid_stations) < self.min_points:
                logger.warning(
                    f"After outlier removal, insufficient stations remain: "
                    f"{len(valid_stations)} < {self.min_points}, using original data"
                )
                station_coords = np.array(
                    [[s.latitude, s.longitude] for s in valid_stations]
                )
                station_values = np.array([s.get_value(variable) for s in valid_stations])

        grid_coords = np.array([[gp.latitude, gp.longitude] for gp in grid_points])

        if len(station_values) >= 10:
            smoothing_factor = self.search_radius / 5.0
            station_values = smooth_spatial_data(station_values, station_coords, smoothing_factor)
            logger.debug(f"Applied spatial smoothing with factor={smoothing_factor:.3f}")

        interpolation_methods = {
            "idw": self._idw_interpolation,
            "kriging": self._kriging_interpolation,
            "linear": self._linear_interpolation,
            "nearest": self._nearest_interpolation,
            "cubic": self._cubic_interpolation,
        }

        if method not in interpolation_methods:
            raise ValueError(f"Unsupported interpolation method: {method}")

        method_kwargs = {}
        if method == "kriging" and len(station_values) >= 10:
            try:
                bin_centers, variogram, counts = estimate_variogram(
                    station_coords, station_values
                )
                if len(bin_centers) >= 3:
                    fitted_params = fit_variogram_model(
                        bin_centers, variogram, model="spherical"
                    )
                    method_kwargs["nugget"] = fitted_params["nugget"]
                    method_kwargs["sill"] = fitted_params["sill"]
                    method_kwargs["range_val"] = fitted_params["range"]
                    logger.info(
                        f"Fitted variogram for {variable}: nugget={fitted_params['nugget']:.3f}, "
                        f"sill={fitted_params['sill']:.3f}, range={fitted_params['range']:.3f}"
                    )
            except Exception as e:
                logger.warning(f"Variogram fitting failed, using default parameters: {e}")

        values, uncertainties = interpolation_methods[method](
            station_coords, station_values, grid_coords, **method_kwargs
        )

        values = post_process_results(
            values, grid_coords, station_values, station_coords, variable
        )

        if uncertainties is not None:
            uncertainties = np.maximum(uncertainties, 0.0)

        quality_score = self._calculate_quality_score(
            station_coords, station_values, grid_coords, values, valid_stations, variable
        )

        quality_score = 0.5 * quality_score + 0.5 * data_quality["score"]

        return InterpolationResult(
            task_id="",
            variable=variable,
            grid_points=grid_points,
            values=values.tolist(),
            uncertainties=uncertainties.tolist() if uncertainties is not None else None,
            interpolation_method=method,
            input_station_count=len(valid_stations),
            quality_score=quality_score,
            metadata={
                "region": region.model_dump(),
                "search_radius": self.search_radius,
                "min_points": self.min_points,
                "max_points": self.max_points,
                "data_quality": data_quality,
                "n_outliers_removed": int(n_outliers),
                "smoothing_applied": len(station_values) >= 10,
                "value_range": {
                    "min": float(np.min(values)),
                    "max": float(np.max(values)),
                    "mean": float(np.mean(values)),
                    "std": float(np.std(values)),
                },
            },
        )

    def _idw_interpolation(
        self,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
        power: float = 2.0,
        **kwargs: Any,
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        distances = cdist(grid_coords, station_coords, metric="euclidean")
        distances = np.maximum(distances, 1e-10)

        weights = 1.0 / (distances**power)
        weight_sums = weights.sum(axis=1)

        valid_mask = weight_sums > 0
        interpolated = np.zeros(len(grid_coords))
        interpolated[valid_mask] = (
            weights[valid_mask] * station_values
        ).sum(axis=1) / weight_sums[valid_mask]

        variance = None
        if len(station_values) > 1:
            residuals = np.abs(
                station_values[:, np.newaxis] - interpolated[np.newaxis, :]
            )
            variance = np.var(residuals, axis=0)

        return interpolated, variance

    def _kriging_interpolation(
        self,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
        variogram_model: str = "spherical",
        nugget: float = 0.0,
        sill: Optional[float] = None,
        range_val: Optional[float] = None,
    ) -> Tuple[np.ndarray, np.ndarray]:
        n_stations = len(station_coords)

        if sill is None:
            sill = np.var(station_values)
        if range_val is None:
            max_dist = np.max(cdist(station_coords, station_coords))
            range_val = max_dist / 3.0

        def variogram(h):
            h = np.asarray(h)
            if variogram_model == "spherical":
                with np.errstate(divide="ignore", invalid="ignore"):
                    gamma = np.where(
                        h <= range_val,
                        nugget + (sill - nugget) * (1.5 * (h / range_val) - 0.5 * (h / range_val) ** 3),
                        sill,
                    )
            elif variogram_model == "exponential":
                gamma = nugget + (sill - nugget) * (1 - np.exp(-h / range_val))
            elif variogram_model == "gaussian":
                gamma = nugget + (sill - nugget) * (1 - np.exp(-(h / range_val) ** 2))
            else:
                raise ValueError(f"Unknown variogram model: {variogram_model}")
            return gamma

        pairwise_dist = cdist(station_coords, station_coords)
        C = sill - variogram(pairwise_dist)

        ones = np.ones((n_stations, 1))
        K = np.block([[C, ones], [ones.T, np.zeros((1, 1))]])

        rhs = np.hstack([station_values, 0.0])

        try:
            weights = np.linalg.solve(K, rhs)
        except np.linalg.LinAlgError:
            weights = np.linalg.lstsq(K, rhs, rcond=None)[0]

        grid_distances = cdist(grid_coords, station_coords)
        c_grid = sill - variogram(grid_distances)
        c_grid_aug = np.hstack([c_grid, np.ones((len(grid_coords), 1))])

        interpolated = c_grid_aug @ weights[: n_stations + 1]

        kriging_variance = sill - np.sum(c_grid_aug * np.linalg.solve(K, c_grid_aug.T).T, axis=1)
        kriging_variance = np.maximum(kriging_variance, 0.0)

        return interpolated, np.sqrt(kriging_variance)

    def _linear_interpolation(
        self,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
        **kwargs: Any,
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        interpolated = griddata(
            station_coords, station_values, grid_coords, method="linear"
        )

        nan_mask = np.isnan(interpolated)
        if np.any(nan_mask):
            nearest = griddata(
                station_coords, station_values, grid_coords[nan_mask], method="nearest"
            )
            interpolated[nan_mask] = nearest

        return interpolated, None

    def _nearest_interpolation(
        self,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
        **kwargs: Any,
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        interpolated = griddata(
            station_coords, station_values, grid_coords, method="nearest"
        )
        return interpolated, None

    def _cubic_interpolation(
        self,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
        **kwargs: Any,
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        interpolated = griddata(
            station_coords, station_values, grid_coords, method="cubic"
        )

        nan_mask = np.isnan(interpolated)
        if np.any(nan_mask):
            nearest = griddata(
                station_coords, station_values, grid_coords[nan_mask], method="nearest"
            )
            interpolated[nan_mask] = nearest

        return interpolated, None

    def _calculate_quality_score(
        self,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
        interpolated_values: np.ndarray,
        stations: List[WeatherStationData],
        variable: str,
    ) -> float:
        n = len(station_values)
        if n < 2:
            return 0.5

        errors = []
        for i in range(n):
            train_coords = np.delete(station_coords, i, axis=0)
            train_values = np.delete(station_values, i)
            test_coord = station_coords[i:i+1]

            try:
                distances = cdist(test_coord, train_coords)[0]
                distances = np.maximum(distances, 1e-10)
                weights = 1.0 / (distances**2)
                predicted = np.sum(weights * train_values) / np.sum(weights)
                actual = station_values[i]
                errors.append(abs(predicted - actual))
            except Exception:
                pass

        if not errors:
            return 0.5

        mae = np.mean(errors)

        ranges = {
            "temperature": 40.0,
            "humidity": 50.0,
            "pressure": 50.0,
            "wind_speed": 20.0,
            "precipitation": 50.0,
        }
        value_range = ranges.get(variable, np.ptp(station_values) or 1.0)

        coverage_score = self._calculate_coverage_score(station_coords, grid_coords)
        density_score = self._calculate_density_score(station_coords, grid_coords)

        accuracy_score = max(0.0, 1.0 - mae / value_range)

        quality_score = 0.4 * accuracy_score + 0.3 * coverage_score + 0.3 * density_score

        return float(min(1.0, max(0.0, quality_score)))

    def _calculate_coverage_score(
        self, station_coords: np.ndarray, grid_coords: np.ndarray
    ) -> float:
        if len(station_coords) == 0:
            return 0.0

        distances = cdist(grid_coords, station_coords)
        min_distances = np.min(distances, axis=1)

        covered = min_distances < self.search_radius
        coverage_ratio = np.sum(covered) / len(grid_coords)

        return float(coverage_ratio)

    def _calculate_density_score(
        self, station_coords: np.ndarray, grid_coords: np.ndarray
    ) -> float:
        min_lat = np.min(grid_coords[:, 0])
        max_lat = np.max(grid_coords[:, 0])
        min_lon = np.min(grid_coords[:, 1])
        max_lon = np.max(grid_coords[:, 1])

        area = (max_lat - min_lat) * (max_lon - min_lon)
        if area == 0:
            return 0.0

        density = len(station_coords) / area
        optimal_density = 10.0

        density_score = min(1.0, density / optimal_density)

        return float(density_score)

    def cross_validate(
        self,
        stations: List[WeatherStationData],
        variable: str,
        method: Optional[str] = None,
        k_folds: int = 5,
    ) -> dict:
        method = method or self.default_method

        valid_stations = [s for s in stations if validate_station_data(s, variable)]
        if len(valid_stations) < self.min_points:
            raise ValueError(
                f"Insufficient valid stations: {len(valid_stations)} < {self.min_points}"
            )

        station_coords = np.array([[s.latitude, s.longitude] for s in valid_stations])
        station_values = np.array([s.get_value(variable) for s in valid_stations])

        indices = np.arange(len(valid_stations))
        np.random.shuffle(indices)
        folds = np.array_split(indices, k_folds)

        errors = []
        for fold in folds:
            train_idx = np.setdiff1d(indices, fold)
            test_idx = fold

            train_coords = station_coords[train_idx]
            train_values = station_values[train_idx]
            test_coords = station_coords[test_idx]
            test_values = station_values[test_idx]

            interpolation_methods = {
                "idw": self._idw_interpolation,
                "kriging": self._kriging_interpolation,
                "linear": self._linear_interpolation,
                "nearest": self._nearest_interpolation,
                "cubic": self._cubic_interpolation,
            }

            predicted, _ = interpolation_methods[method](
                train_coords, train_values, test_coords
            )
            errors.extend(predicted - test_values)

        errors = np.array(errors)
        return {
            "variable": variable,
            "method": method,
            "n_stations": len(valid_stations),
            "k_folds": k_folds,
            "mae": float(np.mean(np.abs(errors))),
            "rmse": float(np.sqrt(np.mean(errors**2))),
            "bias": float(np.mean(errors)),
            "r2": float(
                1 - np.sum(errors**2) / np.sum((station_values - np.mean(station_values)) ** 2)
            ),
        }

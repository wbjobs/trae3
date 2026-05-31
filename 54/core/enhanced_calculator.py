import numpy as np
from typing import List, Optional, Tuple, Dict, Any
from scipy.spatial.distance import cdist
from scipy.interpolate import griddata, RBFInterpolator
from scipy.stats import gaussian_kde

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
    detect_outliers,
    smooth_spatial_data,
    estimate_variogram,
    fit_variogram_model,
    post_process_results,
    calculate_data_quality_score,
)

logger = get_logger(__name__)


class EnhancedMeteorologyCalculator:
    def __init__(self, config: Optional[dict] = None):
        settings = get_settings()
        self.default_method = config.get("method", "ensemble") if config else "ensemble"
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

        self.enable_ensemble = True
        self.enable_adaptive_refinement = True
        self.enable_residual_correction = True
        self.max_iterations = 3
        self.convergence_threshold = 0.01

        logger.info(
            f"EnhancedMeteorologyCalculator initialized - method: {self.default_method}, "
            f"ensemble={self.enable_ensemble}, refinement={self.enable_adaptive_refinement}"
        )

    def interpolate(
        self,
        stations: List[WeatherStationData],
        region: Region,
        variables: List[str],
        method: Optional[str] = None,
        grid_resolution: Optional[float] = None,
        **kwargs: Any,
    ) -> List[InterpolationResult]:
        method = method or self.default_method
        grid_resolution = grid_resolution or self.default_resolution

        logger.info(
            f"Starting enhanced interpolation - region: {region.name}, "
            f"variables: {variables}, method: {method}"
        )

        grid_points = generate_grid_points(region, grid_resolution)
        logger.info(f"Generated {len(grid_points)} grid points")

        results = []
        for variable in variables:
            try:
                if method == "ensemble":
                    result = self._ensemble_interpolation(
                        stations=stations,
                        variable=variable,
                        grid_points=grid_points,
                        region=region,
                        **kwargs,
                    )
                elif method == "iterative":
                    result = self._iterative_interpolation(
                        stations=stations,
                        variable=variable,
                        grid_points=grid_points,
                        region=region,
                        **kwargs,
                    )
                elif method == "adaptive":
                    result = self._adaptive_interpolation(
                        stations=stations,
                        variable=variable,
                        region=region,
                        base_resolution=grid_resolution,
                        **kwargs,
                    )
                else:
                    result = self._single_method_interpolation(
                        stations=stations,
                        variable=variable,
                        grid_points=grid_points,
                        method=method,
                        region=region,
                        **kwargs,
                    )

                results.append(result)
                logger.info(
                    f"Interpolation completed for {variable} - "
                    f"quality score: {result.quality_score:.2f}, "
                    f"method: {result.interpolation_method}"
                )
            except Exception as e:
                logger.error(f"Interpolation failed for {variable}: {e}", exc_info=True)
                raise

        return results

    def _ensemble_interpolation(
        self,
        stations: List[WeatherStationData],
        variable: str,
        grid_points: List[GridPoint],
        region: Region,
        methods: Optional[List[str]] = None,
        weights: Optional[List[float]] = None,
    ) -> InterpolationResult:
        methods = methods or ["kriging", "idw", "rbf"]
        logger.info(f"Running ensemble interpolation with methods: {methods}")

        data_quality = calculate_data_quality_score(stations, variable, region)

        valid_stations = [s for s in stations if validate_station_data(s, variable)]
        if len(valid_stations) < self.min_points:
            raise ValueError(
                f"Insufficient valid stations for {variable}: "
                f"{len(valid_stations)} < {self.min_points}"
            )

        station_coords = np.array(
            [[s.latitude, s.longitude] for s in valid_stations]
        )
        station_values = np.array([s.get_value(variable) for s in valid_stations])

        outlier_mask = detect_outliers(station_values, method="iqr")
        n_outliers = np.sum(outlier_mask)
        if n_outliers > 0 and n_outliers < len(valid_stations) - self.min_points:
            logger.warning(f"Removing {n_outliers} outliers for {variable}")
            station_coords = station_coords[~outlier_mask]
            station_values = station_values[~outlier_mask]
            valid_stations = [s for s, m in zip(valid_stations, ~outlier_mask) if m]

        if len(station_values) >= 10:
            station_values = smooth_spatial_data(
                station_values, station_coords, self.search_radius / 5.0
            )

        grid_coords = np.array([[gp.latitude, gp.longitude] for gp in grid_points])

        method_results = []
        method_uncertainties = []
        method_scores = []

        for m in methods:
            try:
                values, unc, score = self._interpolate_with_method(
                    m, station_coords, station_values, grid_coords, variable
                )
                method_results.append(values)
                method_uncertainties.append(unc if unc is not None else np.zeros_like(values))
                method_scores.append(score)
                logger.debug(f"Method {m} completed - quality: {score:.3f}")
            except Exception as e:
                logger.warning(f"Method {m} failed: {e}, using fallback")
                continue

        if not method_results:
            raise ValueError("All interpolation methods failed")

        if weights is None:
            weights = np.array(method_scores)
            weights = weights / weights.sum()
        else:
            weights = np.array(weights[:len(method_results)])
            weights = weights / weights.sum()

        logger.info(f"Ensemble weights: {dict(zip(methods[:len(weights)], weights))}")

        stacked_results = np.vstack(method_results)
        ensemble_values = np.average(stacked_results, axis=0, weights=weights)

        stacked_uncertainties = np.vstack(method_uncertainties)
        weighted_var = np.average(
            stacked_uncertainties**2 + (stacked_results - ensemble_values)**2,
            axis=0,
            weights=weights,
        )
        ensemble_uncertainties = np.sqrt(weighted_var)

        ensemble_values = post_process_results(
            ensemble_values, grid_coords, station_values, station_coords, variable
        )

        ensemble_quality = np.average(method_scores, weights=weights)
        ensemble_quality = 0.7 * ensemble_quality + 0.3 * data_quality["score"]

        diversity_score = 1 - np.mean(np.corrcoef(stacked_results))
        ensemble_quality = ensemble_quality * (1 + 0.1 * diversity_score)

        grid_res = (
            region.width / (len(grid_points) ** 0.5) if len(grid_points) > 0 else 0.01
        )
        return InterpolationResult(
            task_id="",
            variable=variable,
            grid_points=grid_points,
            values=ensemble_values.tolist(),
            uncertainties=ensemble_uncertainties.tolist(),
            interpolation_method=f"ensemble:{'+'.join(methods[:len(method_results)])}",
            input_station_count=len(valid_stations),
            quality_score=float(min(1.0, max(0.0, ensemble_quality))),
            grid_resolution=grid_res,
            metadata={
                "region": region.model_dump(),
                "methods": methods,
                "weights": weights.tolist(),
                "method_scores": method_scores,
                "data_quality": data_quality,
                "n_outliers_removed": int(n_outliers),
                "diversity_score": float(diversity_score),
                "value_range": {
                    "min": float(np.min(ensemble_values)),
                    "max": float(np.max(ensemble_values)),
                    "mean": float(np.mean(ensemble_values)),
                    "std": float(np.std(ensemble_values)),
                },
            },
        )

    def _interpolate_with_method(
        self,
        method: str,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
        variable: str,
    ) -> Tuple[np.ndarray, Optional[np.ndarray], float]:
        if method == "kriging":
            values, unc = self._kriging_interpolation(
                station_coords, station_values, grid_coords
            )
        elif method == "idw":
            values, unc = self._idw_interpolation(
                station_coords, station_values, grid_coords
            )
        elif method == "rbf":
            values, unc = self._rbf_interpolation(
                station_coords, station_values, grid_coords
            )
        elif method == "linear":
            values, unc = self._linear_interpolation(
                station_coords, station_values, grid_coords
            )
        elif method == "cubic":
            values, unc = self._cubic_interpolation(
                station_coords, station_values, grid_coords
            )
        else:
            raise ValueError(f"Unknown method: {method}")

        quality = self._calculate_method_quality(
            values, station_coords, station_values, grid_coords
        )

        return values, unc, quality

    def _iterative_interpolation(
        self,
        stations: List[WeatherStationData],
        variable: str,
        grid_points: List[GridPoint],
        region: Region,
        base_method: str = "kriging",
    ) -> InterpolationResult:
        logger.info(f"Running iterative interpolation with {base_method}")

        data_quality = calculate_data_quality_score(stations, variable, region)

        valid_stations = [s for s in stations if validate_station_data(s, variable)]
        station_coords = np.array(
            [[s.latitude, s.longitude] for s in valid_stations]
        )
        station_values = np.array([s.get_value(variable) for s in valid_stations])

        grid_coords = np.array([[gp.latitude, gp.longitude] for gp in grid_points])

        current_values = np.zeros(len(grid_coords))
        residuals = station_values.copy()
        prev_rmse = float("inf")

        for iteration in range(self.max_iterations):
            iter_values, _ = self._interpolate_with_method(
                base_method, station_coords, residuals, grid_coords, variable
            )[:2]

            current_values += iter_values

            estimated_at_stations = self._interpolate_with_method(
                base_method, grid_coords, current_values, station_coords, variable
            )[0]

            residuals = station_values - estimated_at_stations
            current_rmse = np.sqrt(np.mean(residuals**2))

            improvement = (prev_rmse - current_rmse) / abs(prev_rmse) if prev_rmse > 1e-10 else 0

            logger.info(
                f"Iteration {iteration + 1}: RMSE = {current_rmse:.4f}, "
                f"improvement = {improvement:.2%}"
            )

            if improvement < self.convergence_threshold and iteration > 0:
                logger.info(f"Converged after {iteration + 1} iterations")
                break

            prev_rmse = current_rmse

        final_values = post_process_results(
            current_values, grid_coords, station_values, station_coords, variable
        )

        quality = 0.5 * (1 - min(1.0, current_rmse / (np.std(station_values) + 1e-6)))
        quality += 0.5 * data_quality["score"]

        grid_res = (
            region.width / (len(grid_points) ** 0.5) if len(grid_points) > 0 else 0.01
        )
        return InterpolationResult(
            task_id="",
            variable=variable,
            grid_points=grid_points,
            values=final_values.tolist(),
            uncertainties=None,
            interpolation_method=f"iterative-{base_method}",
            input_station_count=len(valid_stations),
            quality_score=float(min(1.0, max(0.0, quality))),
            grid_resolution=grid_res,
            metadata={
                "region": region.model_dump(),
                "iterations": iteration + 1,
                "final_rmse": float(current_rmse),
                "base_method": base_method,
                "data_quality": data_quality,
            },
        )

    def _adaptive_interpolation(
        self,
        stations: List[WeatherStationData],
        variable: str,
        region: Region,
        base_resolution: float = 0.1,
        refinement_threshold: float = 0.5,
        max_levels: int = 3,
    ) -> InterpolationResult:
        logger.info(
            f"Running adaptive interpolation - base_resolution: {base_resolution}, "
            f"max_levels: {max_levels}"
        )

        data_quality = calculate_data_quality_score(stations, variable, region)

        valid_stations = [s for s in stations if validate_station_data(s, variable)]
        station_coords = np.array(
            [[s.latitude, s.longitude] for s in valid_stations]
        )
        station_values = np.array([s.get_value(variable) for s in valid_stations])

        all_grid_points = []
        all_values = []
        all_uncertainties = []

        current_regions = [region]
        current_resolution = base_resolution

        for level in range(max_levels):
            logger.debug(f"Refinement level {level + 1}: {len(current_regions)} regions")

            next_regions = []
            level_grid_points = []
            level_values = []
            level_uncertainties = []

            for sub_region in current_regions:
                sub_grid = generate_grid_points(sub_region, current_resolution)
                sub_coords = np.array([[gp.latitude, gp.longitude] for gp in sub_grid])

                values, unc = self._kriging_interpolation(
                    station_coords, station_values, sub_coords
                )

                if unc is None:
                    unc = np.zeros_like(values)

                uncertainty_score = np.mean(unc) / (np.std(values) + 1e-6)

                if (
                    level < max_levels - 1
                    and uncertainty_score > refinement_threshold
                    and sub_region.area > (current_resolution * 4) ** 2
                ):
                    next_regions.extend(self._split_region(sub_region))
                else:
                    level_grid_points.extend(sub_grid)
                    level_values.extend(values.tolist())
                    level_uncertainties.extend(unc.tolist())

            all_grid_points.extend(level_grid_points)
            all_values.extend(level_values)
            all_uncertainties.extend(level_uncertainties)

            current_regions = next_regions
            current_resolution /= 2.0

            if not current_regions:
                break

        all_values = np.array(all_values)
        all_values = post_process_results(
            all_values,
            np.array([[gp.latitude, gp.longitude] for gp in all_grid_points]),
            station_values,
            station_coords,
            variable,
        )

        quality = self._calculate_method_quality(
            all_values, station_coords, station_values,
            np.array([[gp.latitude, gp.longitude] for gp in all_grid_points])
        )
        quality = 0.6 * quality + 0.4 * data_quality["score"]

        grid_res = base_resolution
        return InterpolationResult(
            task_id="",
            variable=variable,
            grid_points=all_grid_points,
            values=all_values.tolist(),
            uncertainties=all_uncertainties,
            interpolation_method=f"adaptive-kriging",
            input_station_count=len(valid_stations),
            quality_score=float(min(1.0, max(0.0, quality))),
            grid_resolution=grid_res,
            metadata={
                "region": region.model_dump(),
                "refinement_levels": max_levels,
                "total_grid_points": len(all_grid_points),
                "data_quality": data_quality,
                "base_resolution": base_resolution,
            },
        )

    def _single_method_interpolation(
        self,
        stations: List[WeatherStationData],
        variable: str,
        grid_points: List[GridPoint],
        method: str,
        region: Region,
    ) -> InterpolationResult:
        data_quality = calculate_data_quality_score(stations, variable, region)

        valid_stations = [s for s in stations if validate_station_data(s, variable)]
        station_coords = np.array(
            [[s.latitude, s.longitude] for s in valid_stations]
        )
        station_values = np.array([s.get_value(variable) for s in valid_stations])

        grid_coords = np.array([[gp.latitude, gp.longitude] for gp in grid_points])

        values, unc, quality = self._interpolate_with_method(
            method, station_coords, station_values, grid_coords, variable
        )

        values = post_process_results(
            values, grid_coords, station_values, station_coords, variable
        )

        quality = 0.6 * quality + 0.4 * data_quality["score"]

        grid_res = (
            region.width / (len(grid_points) ** 0.5) if len(grid_points) > 0 else 0.01
        )
        return InterpolationResult(
            task_id="",
            variable=variable,
            grid_points=grid_points,
            values=values.tolist(),
            uncertainties=unc.tolist() if unc is not None else None,
            interpolation_method=method,
            input_station_count=len(valid_stations),
            quality_score=float(min(1.0, max(0.0, quality))),
            grid_resolution=grid_res,
            metadata={
                "region": region.model_dump(),
                "data_quality": data_quality,
            },
        )

    def _kriging_interpolation(
        self,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray]:
        n_stations = len(station_coords)

        if n_stations >= 10:
            try:
                bin_centers, variogram, counts = estimate_variogram(
                    station_coords, station_values
                )
                if len(bin_centers) >= 3:
                    fitted = fit_variogram_model(bin_centers, variogram)
                    nugget = fitted["nugget"]
                    sill = fitted["sill"]
                    range_val = fitted["range"]
                else:
                    nugget, sill, range_val = 0.0, np.var(station_values), 0.1
            except:
                nugget, sill, range_val = 0.0, np.var(station_values), 0.1
        else:
            nugget, sill, range_val = 0.0, np.var(station_values), 0.1

        def variogram(h):
            h = np.asarray(h)
            return np.where(
                h <= range_val,
                nugget + (sill - nugget) * (1.5 * (h / range_val) - 0.5 * (h / range_val) ** 3),
                sill,
            )

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

        kriging_variance = sill - np.sum(
            c_grid_aug * np.linalg.solve(K, c_grid_aug.T).T, axis=1
        )
        kriging_variance = np.maximum(kriging_variance, 0.0)

        return interpolated, np.sqrt(kriging_variance)

    def _idw_interpolation(
        self,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
        power: float = 2.0,
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        distances = cdist(grid_coords, station_coords)
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

    def _rbf_interpolation(
        self,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
        kernel: str = "thin_plate_spline",
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        try:
            rbf = RBFInterpolator(
                station_coords, station_values, kernel=kernel, smoothing=0.01
            )
            interpolated = rbf(grid_coords)
            return interpolated, None
        except Exception as e:
            logger.warning(f"RBF interpolation failed, falling back to IDW: {e}")
            return self._idw_interpolation(station_coords, station_values, grid_coords)

    def _linear_interpolation(
        self,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
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

    def _cubic_interpolation(
        self,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
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

    def _calculate_method_quality(
        self,
        values: np.ndarray,
        station_coords: np.ndarray,
        station_values: np.ndarray,
        grid_coords: np.ndarray,
    ) -> float:
        n = len(station_values)
        if n < 5:
            return 0.5

        errors = []
        for i in range(min(n, 20)):
            train_coords = np.delete(station_coords, i, axis=0)
            train_vals = np.delete(station_values, i)
            test_coord = station_coords[i:i+1]

            try:
                distances = cdist(test_coord, train_coords)[0]
                distances = np.maximum(distances, 1e-10)
                weights = 1.0 / (distances**2)
                predicted = np.sum(weights * train_vals) / np.sum(weights)
                errors.append(abs(predicted - station_values[i]))
            except:
                pass

        if not errors:
            return 0.5

        mae = np.mean(errors)
        value_range = np.ptp(station_values) or 1.0
        accuracy_score = max(0.0, 1.0 - mae / value_range)

        coverage = self._calculate_coverage_score(station_coords, grid_coords)
        density = min(1.0, n / 10.0)

        return 0.4 * accuracy_score + 0.3 * coverage + 0.3 * density

    def _calculate_coverage_score(
        self, station_coords: np.ndarray, grid_coords: np.ndarray
    ) -> float:
        if len(station_coords) == 0:
            return 0.0

        distances = cdist(grid_coords, station_coords)
        min_distances = np.min(distances, axis=1)
        covered = min_distances < self.search_radius
        return float(np.sum(covered) / len(grid_coords))

    def _split_region(self, region: Region) -> List[Region]:
        mid_lat = (region.min_latitude + region.max_latitude) / 2
        mid_lon = (region.min_longitude + region.max_longitude) / 2

        return [
            Region(
                name=f"{region.name}-NW",
                min_latitude=mid_lat,
                max_latitude=region.max_latitude,
                min_longitude=region.min_longitude,
                max_longitude=mid_lon,
            ),
            Region(
                name=f"{region.name}-NE",
                min_latitude=mid_lat,
                max_latitude=region.max_latitude,
                min_longitude=mid_lon,
                max_longitude=region.max_longitude,
            ),
            Region(
                name=f"{region.name}-SW",
                min_latitude=region.min_latitude,
                max_latitude=mid_lat,
                min_longitude=region.min_longitude,
                max_longitude=mid_lon,
            ),
            Region(
                name=f"{region.name}-SE",
                min_latitude=region.min_latitude,
                max_latitude=mid_lat,
                min_longitude=mid_lon,
                max_longitude=region.max_longitude,
            ),
        ]

    def cross_validate(
        self,
        stations: List[WeatherStationData],
        variable: str,
        method: str = "ensemble",
        k_folds: int = 5,
    ) -> Dict[str, Any]:
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

            predicted, _ = self._interpolate_with_method(
                method.split("-")[0] if "-" in method else method,
                train_coords, train_values, test_coords, variable
            )[:2]
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

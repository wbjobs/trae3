import numpy as np
from typing import List, Optional, Dict, Any, Tuple, Callable
from datetime import datetime
from collections import defaultdict
from scipy.spatial.distance import cdist
from scipy import stats

from models.models import (
    InterpolationResult,
    WeatherStationData,
    Region,
    GridPoint,
)
from utils.logger import get_logger

logger = get_logger(__name__)


class ValidationLevel:
    BASIC = "basic"
    STANDARD = "standard"
    STRICT = "strict"


class ValidationAlert:
    def __init__(
        self,
        level: str,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.level = level
        self.code = code
        self.message = message
        self.details = details or {}
        self.timestamp = datetime.utcnow()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "level": self.level,
            "code": self.code,
            "message": self.message,
            "details": self.details,
            "timestamp": self.timestamp.isoformat(),
        }


class ResultValidator:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        config = config or {}
        self.validation_level = config.get("validation_level", ValidationLevel.STANDARD)

        self.physical_ranges: Dict[str, Tuple[float, float]] = {
            "temperature": (-60.0, 60.0),
            "humidity": (0.0, 100.0),
            "pressure": (800.0, 1100.0),
            "wind_speed": (0.0, 150.0),
            "precipitation": (0.0, 1000.0),
            "radiation": (0.0, 1500.0),
        }

        self.max_spatial_gradient: Dict[str, float] = {
            "temperature": 10.0,
            "humidity": 50.0,
            "pressure": 50.0,
            "wind_speed": 50.0,
        }

        self.temporal_consistency_thresholds: Dict[str, float] = {
            "temperature": 15.0,
            "humidity": 60.0,
            "pressure": 30.0,
        }

        self.alerts: List[ValidationAlert] = []
        self.alert_callbacks: List[Callable[[ValidationAlert], None]] = []

        logger.info(
            f"ResultValidator initialized - level: {self.validation_level}, "
            f"variables: {list(self.physical_ranges.keys())}"
        )

    def add_alert_callback(self, callback: Callable[[ValidationAlert], None]) -> None:
        self.alert_callbacks.append(callback)

    def _trigger_alert(self, alert: ValidationAlert) -> None:
        self.alerts.append(alert)
        for callback in self.alert_callbacks:
            try:
                callback(alert)
            except Exception as e:
                logger.error(f"Error in alert callback: {e}")

    def validate(
        self,
        result: InterpolationResult,
        stations: Optional[List[WeatherStationData]] = None,
        reference_result: Optional[InterpolationResult] = None,
    ) -> Dict[str, Any]:
        logger.info(f"Validating result for {result.variable}")

        validation_results = {
            "task_id": result.task_id,
            "variable": result.variable,
            "validation_level": self.validation_level,
            "timestamp": datetime.utcnow().isoformat(),
            "checks": {},
            "alerts": [],
            "overall_score": 1.0,
            "passed": True,
        }

        values = np.array(result.values)

        checks = [
            ("physical_range", self._check_physical_range),
            ("spatial_continuity", self._check_spatial_continuity),
            ("statistical_consistency", self._check_statistical_consistency),
        ]

        if stations is not None:
            checks.append(("station_consistency", self._check_station_consistency))

        if reference_result is not None:
            checks.append(("reference_comparison", self._check_reference_comparison))

        if self.validation_level in [ValidationLevel.STANDARD, ValidationLevel.STRICT]:
            checks.append(("gradient_check", self._check_gradient))
            checks.append(("quality_score_validation", self._check_quality_score))

        if self.validation_level == ValidationLevel.STRICT:
            checks.append(("cross_validation_residual", self._check_cross_validation))

        scores = []
        for check_name, check_func in checks:
            try:
                check_result = check_func(result, values, stations, reference_result)
                validation_results["checks"][check_name] = check_result
                scores.append(check_result["score"])

                for alert in check_result.get("alerts", []):
                    validation_results["alerts"].append(alert.to_dict())
                    self._trigger_alert(alert)

                if check_result.get("critical_failure", False):
                    validation_results["passed"] = False

            except Exception as e:
                logger.error(f"Check {check_name} failed: {e}", exc_info=True)
                validation_results["checks"][check_name] = {
                    "error": str(e),
                    "score": 0.0,
                }
                scores.append(0.0)

        if scores:
            validation_results["overall_score"] = float(np.mean(scores))

        validation_results["passed"] = (
            validation_results["passed"]
            and validation_results["overall_score"] >= self._get_minimum_score()
        )

        logger.info(
            f"Validation completed for {result.variable}: "
            f"score={validation_results['overall_score']:.3f}, "
            f"passed={validation_results['passed']}"
        )

        return validation_results

    def _get_minimum_score(self) -> float:
        if self.validation_level == ValidationLevel.BASIC:
            return 0.5
        elif self.validation_level == ValidationLevel.STANDARD:
            return 0.7
        else:
            return 0.85

    def _check_physical_range(
        self,
        result: InterpolationResult,
        values: np.ndarray,
        stations: Optional[List[WeatherStationData]] = None,
        reference_result: Optional[InterpolationResult] = None,
    ) -> Dict[str, Any]:
        variable = result.variable.lower()
        phys_range = self.physical_ranges.get(variable, (-float("inf"), float("inf")))

        below_min = np.sum(values < phys_range[0])
        above_max = np.sum(values > phys_range[1])
        total_out_of_range = below_min + above_max

        alerts = []
        if total_out_of_range > 0:
            alert = ValidationAlert(
                level="ERROR" if total_out_of_range > len(values) * 0.1 else "WARNING",
                code="PHYSICAL_RANGE_VIOLATION",
                message=f"{total_out_of_range} values out of physical range [{phys_range[0]}, {phys_range[1]}]",
                details={
                    "below_min": int(below_min),
                    "above_max": int(above_max),
                    "total": len(values),
                    "variable": result.variable,
                    "min_value": float(np.min(values)),
                    "max_value": float(np.max(values)),
                },
            )
            alerts.append(alert)

        score = 1.0 - (total_out_of_range / len(values)) if len(values) > 0 else 0.0

        return {
            "passed": total_out_of_range == 0,
            "score": float(max(0.0, score)),
            "range": list(phys_range),
            "actual_range": [float(np.min(values)), float(np.max(values))],
            "out_of_range_count": int(total_out_of_range),
            "alerts": alerts,
        }

    def _check_spatial_continuity(
        self,
        result: InterpolationResult,
        values: np.ndarray,
        stations: Optional[List[WeatherStationData]] = None,
        reference_result: Optional[InterpolationResult] = None,
    ) -> Dict[str, Any]:
        grid_points = result.grid_points
        if len(grid_points) < 4 or len(values) < 4:
            return {"passed": True, "score": 1.0, "reason": "insufficient_points"}

        coords = np.array([[gp.latitude, gp.longitude] for gp in grid_points])

        sample_size = min(100, len(coords))
        sample_idx = np.random.choice(len(coords), sample_size, replace=False)
        sample_coords = coords[sample_idx]
        sample_values = values[sample_idx]

        distances = cdist(sample_coords, sample_coords)
        value_diffs = np.abs(sample_values[:, np.newaxis] - sample_values)

        close_points_mask = (distances > 0) & (distances < result.grid_resolution * 2)
        if np.any(close_points_mask):
            avg_diff = np.mean(value_diffs[close_points_mask])
            max_diff = np.max(value_diffs[close_points_mask])

            variable = result.variable.lower()
            expected_diff = self.max_spatial_gradient.get(variable, 10.0) * result.grid_resolution * 2

            score = max(0.0, 1.0 - (avg_diff / (expected_diff * 2)))

            alerts = []
            if max_diff > expected_diff * 3:
                alert = ValidationAlert(
                    level="WARNING",
                    code="SPATIAL_DISCONTINUITY",
                    message=f"High spatial discontinuity detected: max_diff={max_diff:.2f}",
                    details={
                        "max_diff": float(max_diff),
                        "avg_diff": float(avg_diff),
                        "expected_diff": float(expected_diff),
                    },
                )
                alerts.append(alert)

            return {
                "passed": max_diff <= expected_diff * 3,
                "score": float(score),
                "avg_spatial_diff": float(avg_diff),
                "max_spatial_diff": float(max_diff),
                "alerts": alerts,
            }

        return {"passed": True, "score": 1.0, "reason": "no_close_points"}

    def _check_statistical_consistency(
        self,
        result: InterpolationResult,
        values: np.ndarray,
        stations: Optional[List[WeatherStationData]] = None,
        reference_result: Optional[InterpolationResult] = None,
    ) -> Dict[str, Any]:
        alerts = []

        mean_val = np.mean(values)
        std_val = np.std(values)
        skewness = stats.skew(values)
        kurtosis = stats.kurtosis(values)

        z_scores = np.abs((values - mean_val) / (std_val + 1e-10))
        extreme_count = np.sum(z_scores > 4)

        if extreme_count > len(values) * 0.05:
            alert = ValidationAlert(
                level="WARNING",
                code="EXTREME_VALUE_CLUSTER",
                message=f"Cluster of extreme values detected: {extreme_count} points with |z-score| > 4",
                details={
                    "extreme_count": int(extreme_count),
                    "total_count": len(values),
                    "percentage": float(extreme_count / len(values) * 100),
                },
            )
            alerts.append(alert)

        score = 1.0 - (extreme_count / len(values) * 2)
        score = max(0.0, min(1.0, score))

        return {
            "passed": extreme_count <= len(values) * 0.1,
            "score": float(score),
            "statistics": {
                "mean": float(mean_val),
                "std": float(std_val),
                "skewness": float(skewness),
                "kurtosis": float(kurtosis),
            },
            "extreme_value_count": int(extreme_count),
            "alerts": alerts,
        }

    def _check_station_consistency(
        self,
        result: InterpolationResult,
        values: np.ndarray,
        stations: List[WeatherStationData],
        reference_result: Optional[InterpolationResult] = None,
    ) -> Dict[str, Any]:
        alerts = []
        variable = result.variable

        station_values = np.array([s.get_value(variable) for s in stations if s.get_value(variable) is not None])

        if len(station_values) == 0:
            return {"passed": True, "score": 1.0, "reason": "no_station_data"}

        station_mean = np.mean(station_values)
        station_std = np.std(station_values)
        result_mean = np.mean(values)
        result_std = np.std(values)

        mean_diff = abs(result_mean - station_mean)
        std_ratio = result_std / (station_std + 1e-10)

        score_components = []

        mean_tolerance = station_std * 0.5 if station_std > 0 else 5.0
        mean_score = max(0.0, 1.0 - mean_diff / mean_tolerance)
        score_components.append(mean_score)

        std_score = 1.0 - min(1.0, abs(std_ratio - 1.0))
        score_components.append(std_score)

        if mean_diff > station_std * 1.5 and station_std > 0:
            alert = ValidationAlert(
                level="WARNING",
                code="MEAN_SHIFT_DETECTED",
                message=f"Significant mean shift from station data: {mean_diff:.2f}",
                details={
                    "station_mean": float(station_mean),
                    "result_mean": float(result_mean),
                    "mean_diff": float(mean_diff),
                    "station_std": float(station_std),
                },
            )
            alerts.append(alert)

        return {
            "passed": mean_diff <= station_std * 2 or station_std == 0,
            "score": float(np.mean(score_components)),
            "station_statistics": {
                "mean": float(station_mean),
                "std": float(station_std),
                "count": int(len(station_values)),
            },
            "result_statistics": {
                "mean": float(result_mean),
                "std": float(result_std),
            },
            "mean_difference": float(mean_diff),
            "std_ratio": float(std_ratio),
            "alerts": alerts,
        }

    def _check_reference_comparison(
        self,
        result: InterpolationResult,
        values: np.ndarray,
        stations: Optional[List[WeatherStationData]] = None,
        reference_result: Optional[InterpolationResult] = None,
    ) -> Dict[str, Any]:
        alerts = []

        if reference_result is None:
            return {"passed": True, "score": 1.0, "reason": "no_reference"}

        ref_values = np.array(reference_result.values)

        if len(ref_values) != len(values):
            return {
                "passed": False,
                "score": 0.0,
                "error": "Length mismatch",
                "ref_length": len(ref_values),
                "result_length": len(values),
            }

        mae = np.mean(np.abs(values - ref_values))
        rmse = np.sqrt(np.mean((values - ref_values) ** 2))
        bias = np.mean(values - ref_values)
        correlation = np.corrcoef(values, ref_values)[0, 1] if np.std(values) > 0 and np.std(ref_values) > 0 else 0.0

        ref_range = np.ptp(ref_values)
        normalized_mae = mae / (ref_range + 1e-10)

        score = max(0.0, 1.0 - normalized_mae * 2)
        score = 0.7 * score + 0.3 * max(0.0, correlation)

        variable = result.variable.lower()
        threshold = self.temporal_consistency_thresholds.get(variable, 10.0)

        if abs(bias) > threshold and self.validation_level != ValidationLevel.BASIC:
            alert = ValidationAlert(
                level="WARNING",
                code="LARGE_TEMPORAL_BIAS",
                message=f"Large bias compared to reference: {bias:.2f}",
                details={
                    "bias": float(bias),
                    "threshold": float(threshold),
                    "mae": float(mae),
                    "rmse": float(rmse),
                    "correlation": float(correlation),
                },
            )
            alerts.append(alert)

        if correlation < 0.5 and self.validation_level == ValidationLevel.STRICT:
            alert = ValidationAlert(
                level="ERROR",
                code="LOW_CORRELATION_WITH_REFERENCE",
                message=f"Low correlation with reference: {correlation:.3f}",
                details={"correlation": float(correlation)},
            )
            alerts.append(alert)

        return {
            "passed": correlation >= 0.3,
            "score": float(max(0.0, score)),
            "mae": float(mae),
            "rmse": float(rmse),
            "bias": float(bias),
            "correlation": float(correlation),
            "normalized_mae": float(normalized_mae),
            "alerts": alerts,
        }

    def _check_gradient(
        self,
        result: InterpolationResult,
        values: np.ndarray,
        stations: Optional[List[WeatherStationData]] = None,
        reference_result: Optional[InterpolationResult] = None,
    ) -> Dict[str, Any]:
        alerts = []
        grid_points = result.grid_points

        if len(grid_points) < 9:
            return {"passed": True, "score": 1.0, "reason": "insufficient_points"}

        grid_dict = {(gp.latitude, gp.longitude): i for i, gp in enumerate(grid_points)}

        gradients = []
        for i, gp in enumerate(grid_points):
            neighbors = []
            for dlat in [-result.grid_resolution, 0, result.grid_resolution]:
                for dlon in [-result.grid_resolution, 0, result.grid_resolution]:
                    if dlat == 0 and dlon == 0:
                        continue
                    key = (round(gp.latitude + dlat, 4), round(gp.longitude + dlon, 4))
                    if key in grid_dict:
                        neighbors.append(grid_dict[key])

            if neighbors:
                neighbor_values = values[neighbors]
                local_var = np.var(neighbor_values)
                gradients.append(local_var)

        if not gradients:
            return {"passed": True, "score": 1.0, "reason": "no_gradients_calculated"}

        avg_gradient = np.mean(gradients)
        max_gradient = np.max(gradients)
        high_gradient_ratio = np.sum(np.array(gradients) > avg_gradient * 3) / len(gradients)

        score = max(0.0, 1.0 - high_gradient_ratio * 2)

        if high_gradient_ratio > 0.1:
            alert = ValidationAlert(
                level="WARNING",
                code="HIGH_GRADIENT_CLUSTER",
                message=f"Areas with high gradients detected: {high_gradient_ratio:.1%}",
                details={
                    "avg_gradient": float(avg_gradient),
                    "max_gradient": float(max_gradient),
                    "high_gradient_ratio": float(high_gradient_ratio),
                },
            )
            alerts.append(alert)

        return {
            "passed": high_gradient_ratio <= 0.2,
            "score": float(score),
            "avg_gradient_variance": float(avg_gradient),
            "max_gradient_variance": float(max_gradient),
            "high_gradient_ratio": float(high_gradient_ratio),
            "alerts": alerts,
        }

    def _check_quality_score(
        self,
        result: InterpolationResult,
        values: np.ndarray,
        stations: Optional[List[WeatherStationData]] = None,
        reference_result: Optional[InterpolationResult] = None,
    ) -> Dict[str, Any]:
        alerts = []

        quality_score = result.quality_score or 0.0

        expected_min = 0.3 if self.validation_level == ValidationLevel.BASIC else 0.5
        if self.validation_level == ValidationLevel.STRICT:
            expected_min = 0.7

        if quality_score < expected_min:
            alert = ValidationAlert(
                level="WARNING" if self.validation_level != ValidationLevel.STRICT else "ERROR",
                code="LOW_QUALITY_SCORE",
                message=f"Quality score below expected minimum: {quality_score:.3f} < {expected_min}",
                details={
                    "quality_score": float(quality_score),
                    "expected_min": float(expected_min),
                },
            )
            alerts.append(alert)

        score = min(1.0, quality_score / expected_min) if expected_min > 0 else 0.0

        return {
            "passed": quality_score >= expected_min,
            "score": float(max(0.0, score)),
            "quality_score": float(quality_score),
            "expected_min": float(expected_min),
            "alerts": alerts,
        }

    def _check_cross_validation(
        self,
        result: InterpolationResult,
        values: np.ndarray,
        stations: Optional[List[WeatherStationData]] = None,
        reference_result: Optional[InterpolationResult] = None,
    ) -> Dict[str, Any]:
        if stations is None or len(stations) < 5:
            return {"passed": True, "score": 1.0, "reason": "insufficient_stations"}

        variable = result.variable
        grid_points = result.grid_points
        grid_coords = np.array([[gp.latitude, gp.longitude] for gp in grid_points])

        errors = []
        station_coords_list = []
        station_values_list = []

        for s in stations:
            val = s.get_value(variable)
            if val is not None:
                station_coords_list.append([s.latitude, s.longitude])
                station_values_list.append(val)

        if len(station_values_list) < 5:
            return {"passed": True, "score": 1.0, "reason": "insufficient_valid_stations"}

        station_coords = np.array(station_coords_list)
        station_values = np.array(station_values_list)

        for i in range(len(station_values)):
            train_coords = np.delete(station_coords, i, axis=0)
            train_vals = np.delete(station_values, i)
            test_coord = station_coords[i:i+1]

            distances = cdist(test_coord, train_coords)[0]
            weights = 1.0 / (np.maximum(distances, 1e-10) ** 2)
            predicted = np.sum(weights * train_vals) / np.sum(weights)
            errors.append(predicted - station_values[i])

        errors = np.array(errors)
        mae = np.mean(np.abs(errors))
        rmse = np.sqrt(np.mean(errors ** 2))

        value_range = np.ptp(station_values) or 1.0
        normalized_rmse = rmse / value_range

        score = max(0.0, 1.0 - normalized_rmse * 3)

        alerts = []
        if normalized_rmse > 0.3:
            alert = ValidationAlert(
                level="WARNING",
                code="HIGH_CV_ERROR",
                message=f"Cross-validation error is high: RMSE/Range = {normalized_rmse:.1%}",
                details={
                    "cv_mae": float(mae),
                    "cv_rmse": float(rmse),
                    "normalized_rmse": float(normalized_rmse),
                    "value_range": float(value_range),
                },
            )
            alerts.append(alert)

        return {
            "passed": normalized_rmse <= 0.5,
            "score": float(score),
            "cv_mae": float(mae),
            "cv_rmse": float(rmse),
            "normalized_rmse": float(normalized_rmse),
            "alerts": alerts,
        }

    def compare_results(
        self,
        results_a: List[InterpolationResult],
        results_b: List[InterpolationResult],
        variables: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        logger.info(f"Comparing {len(results_a)} x {len(results_b)} results")

        comparison = {
            "timestamp": datetime.utcnow().isoformat(),
            "variables_compared": [],
            "overall_summary": {},
            "detailed_comparison": {},
        }

        dict_a = {r.variable: r for r in results_a}
        dict_b = {r.variable: r for r in results_b}

        common_vars = set(dict_a.keys()) & set(dict_b.keys())
        if variables:
            common_vars = common_vars & set(variables)

        for var in common_vars:
            result_a = dict_a[var]
            result_b = dict_b[var]

            values_a = np.array(result_a.values)
            values_b = np.array(result_b.values)

            if len(values_a) != len(values_b):
                comparison["detailed_comparison"][var] = {
                    "error": "Grid size mismatch",
                    "size_a": len(values_a),
                    "size_b": len(values_b),
                }
                continue

            mae = np.mean(np.abs(values_a - values_b))
            rmse = np.sqrt(np.mean((values_a - values_b) ** 2))
            max_diff = np.max(np.abs(values_a - values_b))
            bias = np.mean(values_a - values_b)

            std_a = np.std(values_a)
            std_b = np.std(values_b)
            if std_a > 0 and std_b > 0:
                correlation = np.corrcoef(values_a, values_b)[0, 1]
            else:
                correlation = 1.0 if std_a == 0 and std_b == 0 else 0.0

            comparison["detailed_comparison"][var] = {
                "mae": float(mae),
                "rmse": float(rmse),
                "max_absolute_difference": float(max_diff),
                "bias": float(bias),
                "correlation": float(correlation),
                "method_a": result_a.interpolation_method,
                "method_b": result_b.interpolation_method,
                "quality_a": result_a.quality_score,
                "quality_b": result_b.quality_score,
                "range_a": [float(np.min(values_a)), float(np.max(values_a))],
                "range_b": [float(np.min(values_b)), float(np.max(values_b))],
            }
            comparison["variables_compared"].append(var)

        if comparison["variables_compared"]:
            correlations = [
                comp["correlation"]
                for comp in comparison["detailed_comparison"].values()
                if "correlation" in comp
            ]
            rmses = [
                comp["rmse"]
                for comp in comparison["detailed_comparison"].values()
                if "rmse" in comp
            ]

            comparison["overall_summary"] = {
                "avg_correlation": float(np.mean(correlations)) if correlations else 0.0,
                "avg_rmse": float(np.mean(rmses)) if rmses else 0.0,
                "min_correlation": float(np.min(correlations)) if correlations else 0.0,
                "max_rmse": float(np.max(rmses)) if rmses else 0.0,
                "n_variables": len(comparison["variables_compared"]),
            }

        return comparison

    def batch_validate(
        self,
        results: List[InterpolationResult],
        stations: Optional[List[WeatherStationData]] = None,
    ) -> List[Dict[str, Any]]:
        return [self.validate(r, stations) for r in results]

    def get_alerts(
        self,
        level: Optional[str] = None,
        code: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        filtered = self.alerts

        if level:
            filtered = [a for a in filtered if a.level == level]
        if code:
            filtered = [a for a in filtered if a.code == code]

        return [a.to_dict() for a in filtered[-limit:]]

    def clear_alerts(self) -> None:
        self.alerts = []

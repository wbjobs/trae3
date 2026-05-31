import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class PredictionMethod(Enum):
    EXPONENTIAL_SMOOTHING = "exponential_smoothing"
    ARIMA = "arima"
    LINEAR_REGRESSION = "linear_regression"
    EMA = "ema"
    HOLT_WINTERS = "holt_winters"


class FaultSeverity(Enum):
    NORMAL = "normal"
    WARNING = "warning"
    ALERT = "alert"
    CRITICAL = "critical"


@dataclass
class PredictionPoint:
    timestamp: datetime
    predicted_value: float
    lower_bound: float
    upper_bound: float
    confidence: float
    method: str


@dataclass
class TrendAnalysis:
    trend_slope: float
    trend_direction: str
    trend_strength: float
    acceleration: float
    volatility: float


@dataclass
class RULPrediction:
    estimated_failure_date: Optional[datetime]
    remaining_useful_life_hours: float
    confidence: float
    warning_threshold_days: int = 7
    alert_threshold_days: int = 3
    failure_threshold: float = 10.0


@dataclass
class FaultPredictionResult:
    device_code: str
    prediction_method: str
    historical_points: int
    forecast_points: int
    predictions: List[PredictionPoint] = field(default_factory=list)
    trend_analysis: Optional[TrendAnalysis] = None
    rul_prediction: Optional[RULPrediction] = None
    current_severity: FaultSeverity = FaultSeverity.NORMAL
    predicted_severity: FaultSeverity = FaultSeverity.NORMAL
    warnings: List[str] = field(default_factory=list)
    model_metrics: Dict[str, float] = field(default_factory=dict)


class ExponentialSmoothing:
    def __init__(self, alpha: float = 0.3, beta: float = 0.1, gamma: float = 0.1):
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.level = None
        self.trend = None
        self.seasonal = None

    def fit(self, data: np.ndarray, seasonal_period: int = 24):
        if len(data) < 2:
            raise ValueError("Need at least 2 data points")

        self.level = data[0]
        self.trend = data[1] - data[0]

        if len(data) >= seasonal_period * 2:
            self.seasonal = np.zeros(seasonal_period)
            for i in range(seasonal_period):
                self.seasonal[i] = np.mean(data[i::seasonal_period]) - np.mean(data)

    def predict(self, steps: int) -> np.ndarray:
        if self.level is None or self.trend is None:
            raise ValueError("Model not fitted")

        predictions = []
        for h in range(1, steps + 1):
            pred = self.level + h * self.trend

            if self.seasonal is not None:
                season_idx = (h - 1) % len(self.seasonal)
                pred += self.seasonal[season_idx]

            predictions.append(pred)

        return np.array(predictions)

    def forecast(self, data: np.ndarray, steps: int) -> Tuple[np.ndarray, np.ndarray]:
        self.fit(data)
        predictions = self.predict(steps)
        residuals = self._calculate_residuals(data)
        std = np.std(residuals) if len(residuals) > 0 else 1.0
        bounds = 1.96 * std * np.sqrt(np.arange(1, steps + 1))

        return predictions, bounds

    def _calculate_residuals(self, data: np.ndarray) -> np.ndarray:
        residuals = []
        level = data[0]
        trend = data[1] - data[0] if len(data) > 1 else 0

        for i in range(1, len(data)):
            pred = level + trend
            residual = data[i] - pred
            residuals.append(residual)

            new_level = self.alpha * data[i] + (1 - self.alpha) * (level + trend)
            new_trend = self.beta * (new_level - level) + (1 - self.beta) * trend
            level = new_level
            trend = new_trend

        return np.array(residuals)


class EMAPredictor:
    def __init__(self, alpha: float = 0.2, span: Optional[int] = None):
        self.alpha = alpha
        self.span = span
        if span:
            self.alpha = 2 / (span + 1)

    def fit(self, data: np.ndarray):
        self.data = data
        self.ema = self._calculate_ema(data)
        self.residuals = data - self.ema
        self.std = np.std(self.residuals) if len(self.residuals) > 1 else 1.0

    def _calculate_ema(self, data: np.ndarray) -> np.ndarray:
        ema = np.zeros_like(data, dtype=float)
        ema[0] = data[0]
        for i in range(1, len(data)):
            ema[i] = self.alpha * data[i] + (1 - self.alpha) * ema[i - 1]
        return ema

    def predict(self, steps: int) -> np.ndarray:
        if not hasattr(self, 'ema'):
            raise ValueError("Model not fitted")

        last_ema = self.ema[-1]
        last_trend = self.ema[-1] - self.ema[-2] if len(self.ema) > 1 else 0

        predictions = []
        current = last_ema
        for _ in range(steps):
            current = current + last_trend * self.alpha
            predictions.append(current)

        return np.array(predictions)

    def forecast(self, data: np.ndarray, steps: int) -> Tuple[np.ndarray, np.ndarray]:
        self.fit(data)
        predictions = self.predict(steps)
        bounds = 1.96 * self.std * np.sqrt(np.arange(1, steps + 1))
        return predictions, bounds


class LinearTrendPredictor:
    def __init__(self):
        self.slope = 0.0
        self.intercept = 0.0
        self.r_squared = 0.0
        self.std_error = 0.0

    def fit(self, data: np.ndarray):
        n = len(data)
        if n < 2:
            raise ValueError("Need at least 2 data points")

        x = np.arange(n)
        x_mean = np.mean(x)
        y_mean = np.mean(data)

        numerator = np.sum((x - x_mean) * (data - y_mean))
        denominator = np.sum((x - x_mean) ** 2)

        if denominator == 0:
            self.slope = 0.0
            self.intercept = y_mean
        else:
            self.slope = numerator / denominator
            self.intercept = y_mean - self.slope * x_mean

        y_pred = self.intercept + self.slope * x
        ss_res = np.sum((data - y_pred) ** 2)
        ss_tot = np.sum((data - y_mean) ** 2)
        self.r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        self.std_error = np.sqrt(ss_res / (n - 2)) if n > 2 else 1.0

    def predict(self, steps: int) -> np.ndarray:
        if not hasattr(self, 'slope'):
            raise ValueError("Model not fitted")

        n = len(getattr(self, '_data', [0]))
        future_x = np.arange(n, n + steps)
        return self.intercept + self.slope * future_x

    def forecast(self, data: np.ndarray, steps: int) -> Tuple[np.ndarray, np.ndarray]:
        self._data = data
        self.fit(data)
        predictions = self.predict(steps)
        bounds = 1.96 * self.std_error * np.sqrt(1 + 1 / len(data) + np.arange(1, steps + 1) ** 2 / len(data) ** 2)
        return predictions, bounds


class ARIMAPredictor:
    def __init__(self, p: int = 1, d: int = 1, q: int = 1):
        self.p = p
        self.d = d
        self.q = q
        self.ar_params = None
        self.ma_params = None
        self.const = 0.0
        self.residuals = None

    def _differences(self, data: np.ndarray, d: int) -> np.ndarray:
        result = data.copy()
        for _ in range(d):
            result = np.diff(result)
        return result

    def _reverse_differences(self, initial_values: np.ndarray, diffed: np.ndarray, d: int) -> np.ndarray:
        result = initial_values.copy()
        for i in range(d):
            cumsum = np.cumsum(np.concatenate([[initial_values[-i - 1]], diffed]))
            result = cumsum
        return result

    def fit(self, data: np.ndarray):
        if len(data) < max(self.p, self.d, self.q) + 2:
            raise ValueError("Insufficient data points")

        self.data = data
        y = self._differences(data, self.d)

        if self.p > 0 and len(y) > self.p:
            X = np.zeros((len(y) - self.p, self.p))
            for i in range(self.p):
                X[:, i] = y[self.p - i - 1:-i - 1]
            Y = y[self.p:]

            try:
                self.ar_params = np.linalg.lstsq(X, Y, rcond=None)[0]
            except:
                self.ar_params = np.zeros(self.p)
        else:
            self.ar_params = np.zeros(self.p) if self.p > 0 else None

        if self.q > 0:
            self.ma_params = np.zeros(self.q)
        else:
            self.ma_params = None

        self.const = np.mean(y) if len(y) > 0 else 0.0

        predictions = self._predict_in_sample(y)
        self.residuals = y[self.p:] - predictions if len(y) > self.p else y
        self.std_error = np.std(self.residuals) if len(self.residuals) > 1 else 1.0

    def _predict_in_sample(self, y: np.ndarray) -> np.ndarray:
        predictions = np.full(len(y) - self.p, self.const)

        for t in range(self.p, len(y)):
            if self.p > 0 and self.ar_params is not None:
                ar_term = np.dot(self.ar_params, y[t - self.p:t][::-1])
                predictions[t - self.p] += ar_term

        return predictions

    def predict(self, steps: int) -> np.ndarray:
        if not hasattr(self, 'data'):
            raise ValueError("Model not fitted")

        y = self._differences(self.data, self.d)
        forecast_diff = np.full(steps, self.const)

        for h in range(steps):
            extended_y = np.concatenate([y, forecast_diff[:h]])
            if self.p > 0 and self.ar_params is not None and len(extended_y) >= self.p:
                ar_term = np.dot(self.ar_params, extended_y[-self.p:][::-1])
                forecast_diff[h] += ar_term

        if self.d == 0:
            return forecast_diff

        predictions = []
        last_values = self.data[-self.d:]
        current = last_values.copy()

        for i in range(steps):
            if self.d == 1:
                next_val = current[-1] + forecast_diff[i]
            elif self.d == 2:
                next_val = 2 * current[-1] - current[-2] + forecast_diff[i]
            else:
                next_val = current[-1] + forecast_diff[i]

            predictions.append(next_val)
            current = np.roll(current, -1)
            current[-1] = next_val

        return np.array(predictions)

    def forecast(self, data: np.ndarray, steps: int) -> Tuple[np.ndarray, np.ndarray]:
        self.fit(data)
        predictions = self.predict(steps)
        bounds = 1.96 * self.std_error * np.sqrt(np.arange(1, steps + 1))
        return predictions, bounds


class TrendAnalyzer:
    @staticmethod
    def analyze(data: np.ndarray) -> TrendAnalysis:
        if len(data) < 4:
            return TrendAnalysis(
                trend_slope=0.0,
                trend_direction="stable",
                trend_strength=0.0,
                acceleration=0.0,
                volatility=0.0
            )

        x = np.arange(len(data))
        slope, _ = np.polyfit(x, data, 1)

        half = len(data) // 2
        slope1, _ = np.polyfit(x[:half], data[:half], 1)
        slope2, _ = np.polyfit(x[half:], data[half:], 1)
        acceleration = slope2 - slope1

        volatility = np.std(data) / np.mean(np.abs(data)) if np.mean(np.abs(data)) > 0 else 1.0

        y_pred = np.polyval(np.polyfit(x, data, 1), x)
        ss_res = np.sum((data - y_pred) ** 2)
        ss_tot = np.sum((data - np.mean(data)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

        if slope > 0.1:
            direction = "increasing"
        elif slope < -0.1:
            direction = "decreasing"
        else:
            direction = "stable"

        return TrendAnalysis(
            trend_slope=float(slope),
            trend_direction=direction,
            trend_strength=float(max(0, min(1, r_squared))),
            acceleration=float(acceleration),
            volatility=float(volatility)
        )


class RULPredictor:
    @staticmethod
    def predict(
        historical_values: np.ndarray,
        timestamps: List[datetime],
        failure_threshold: float = 10.0,
        warning_threshold: float = 8.0,
        alert_threshold: float = 9.0
    ) -> RULPrediction:
        result = RULPrediction(
            estimated_failure_date=None,
            remaining_useful_life_hours=0.0,
            confidence=0.0,
            failure_threshold=failure_threshold
        )

        if len(historical_values) < 5:
            result.warnings = ["Insufficient historical data for RUL prediction"]
            return result

        try:
            predictor = LinearTrendPredictor()
            predictor.fit(historical_values)
            current_value = historical_values[-1]

            if predictor.slope <= 0:
                result.remaining_useful_life_hours = float('inf')
                result.confidence = 0.3
                result.warnings = ["No upward trend detected, component is healthy"]
                return result

            value_to_threshold = failure_threshold - current_value
            if value_to_threshold <= 0:
                result.remaining_useful_life_hours = 0
                result.estimated_failure_date = timestamps[-1]
                result.confidence = 0.9
                result.warnings = ["Current value exceeds failure threshold"]
                return result

            hours_to_failure = value_to_threshold / predictor.slope

            time_interval = (timestamps[-1] - timestamps[0]).total_seconds() / 3600
            hours_per_step = time_interval / (len(timestamps) - 1) if len(timestamps) > 1 else 1

            predicted_hours = hours_to_failure * hours_per_step
            result.remaining_useful_life_hours = float(max(0, predicted_hours))

            if result.remaining_useful_life_hours < float('inf'):
                result.estimated_failure_date = timestamps[-1] + timedelta(hours=result.remaining_useful_life_hours)

            result.confidence = float(max(0, min(1, predictor.r_squared)))

            if predictor.slope > 0.5 and result.remaining_useful_life_hours < 24 * 7:
                result.confidence = min(1.0, result.confidence + 0.2)

        except Exception as e:
            logger.error(f"RUL prediction error: {e}")
            result.warnings = [f"Prediction error: {str(e)}"]

        return result


class FaultPredictor:
    def __init__(self):
        self.methods = {
            PredictionMethod.EXPONENTIAL_SMOOTHING: ExponentialSmoothing(alpha=0.3, beta=0.1),
            PredictionMethod.EMA: EMAPredictor(alpha=0.2),
            PredictionMethod.LINEAR_REGRESSION: LinearTrendPredictor(),
            PredictionMethod.ARIMA: ARIMAPredictor(p=1, d=1, q=0),
        }
        self.thresholds = {
            'rms': {'warning': 5.0, 'alert': 7.0, 'critical': 10.0},
            'peak': {'warning': 15.0, 'alert': 25.0, 'critical': 40.0},
            'kurtosis': {'warning': 3.0, 'alert': 5.0, 'critical': 8.0},
        }

    def predict(
        self,
        device_code: str,
        timestamps: List[datetime],
        values: np.ndarray,
        metric: str = 'rms',
        method: PredictionMethod = PredictionMethod.EXPONENTIAL_SMOOTHING,
        forecast_steps: int = 24,
        failure_threshold: Optional[float] = None
    ) -> FaultPredictionResult:
        result = FaultPredictionResult(
            device_code=device_code,
            prediction_method=method.value,
            historical_points=len(values),
            forecast_points=forecast_steps
        )

        if len(values) < 5:
            result.warnings.append("Insufficient historical data for reliable prediction")
            return result

        try:
            values = np.array(values, dtype=float)
            valid_mask = ~np.isnan(values) & ~np.isinf(values)
            values = values[valid_mask]
            timestamps = [t for t, v in zip(timestamps, valid_mask) if v]

            if len(values) < 5:
                result.warnings.append("Too many invalid data points")
                return result

            predictor = self.methods.get(method)
            if predictor is None:
                result.warnings.append(f"Unsupported prediction method: {method}")
                return result

            predictions, bounds = predictor.forecast(values, forecast_steps)

            last_timestamp = timestamps[-1]
            time_interval = (timestamps[-1] - timestamps[0]).total_seconds() / 3600
            hours_per_step = time_interval / (len(timestamps) - 1) if len(timestamps) > 1 else 1

            result.predictions = []
            for i, (pred, bound) in enumerate(zip(predictions, bounds)):
                pred_time = last_timestamp + timedelta(hours=(i + 1) * hours_per_step)
                confidence = max(0.5, 1 - (i / forecast_steps) * 0.5)

                result.predictions.append(PredictionPoint(
                    timestamp=pred_time,
                    predicted_value=float(pred),
                    lower_bound=float(max(0, pred - bound)),
                    upper_bound=float(pred + bound),
                    confidence=float(confidence),
                    method=method.value
                ))

            result.trend_analysis = TrendAnalyzer.analyze(values)

            threshold = failure_threshold or self.thresholds.get(metric, {}).get('critical', 10.0)
            result.rul_prediction = RULPredictor.predict(
                values, timestamps,
                failure_threshold=threshold,
                warning_threshold=self.thresholds.get(metric, {}).get('warning', threshold * 0.7),
                alert_threshold=self.thresholds.get(metric, {}).get('alert', threshold * 0.9)
            )

            current_value = float(values[-1])
            result.current_severity = self._determine_severity(current_value, metric)

            if predictions and len(predictions) > 0:
                max_pred = float(np.max(predictions))
                result.predicted_severity = self._determine_severity(max_pred, metric)

            if hasattr(predictor, 'r_squared'):
                result.model_metrics['r_squared'] = float(predictor.r_squared)
            if hasattr(predictor, 'std_error'):
                result.model_metrics['std_error'] = float(predictor.std_error)

        except Exception as e:
            logger.error(f"Prediction error for {device_code}: {e}")
            result.warnings.append(f"Prediction error: {str(e)}")

        return result

    def _determine_severity(self, value: float, metric: str) -> FaultSeverity:
        thresholds = self.thresholds.get(metric, {})
        warning = thresholds.get('warning', 5.0)
        alert = thresholds.get('alert', 7.0)
        critical = thresholds.get('critical', 10.0)

        if value >= critical:
            return FaultSeverity.CRITICAL
        elif value >= alert:
            return FaultSeverity.ALERT
        elif value >= warning:
            return FaultSeverity.WARNING
        else:
            return FaultSeverity.NORMAL

    def predict_with_multiple_methods(
        self,
        device_code: str,
        timestamps: List[datetime],
        values: np.ndarray,
        metric: str = 'rms',
        forecast_steps: int = 24
    ) -> Dict[str, FaultPredictionResult]:
        results = {}
        for method in PredictionMethod:
            if method in self.methods:
                try:
                    results[method.value] = self.predict(
                        device_code, timestamps, values,
                        metric=metric,
                        method=method,
                        forecast_steps=forecast_steps
                    )
                except Exception as e:
                    logger.warning(f"{method.value} prediction failed: {e}")
        return results

    def get_combined_prediction(
        self,
        predictions: Dict[str, FaultPredictionResult],
        weights: Optional[Dict[str, float]] = None
    ) -> FaultPredictionResult:
        if not predictions:
            raise ValueError("No predictions to combine")

        default_weights = {
            'exponential_smoothing': 0.3,
            'arima': 0.25,
            'linear_regression': 0.15,
            'ema': 0.2,
            'holt_winters': 0.1
        }
        weights = weights or default_weights

        first_result = list(predictions.values())[0]
        combined = FaultPredictionResult(
            device_code=first_result.device_code,
            prediction_method='ensemble',
            historical_points=first_result.historical_points,
            forecast_points=first_result.forecast_points
        )

        max_steps = max(len(r.predictions) for r in predictions.values())
        for step in range(max_steps):
            pred_sum = 0.0
            lower_sum = 0.0
            upper_sum = 0.0
            total_weight = 0.0
            timestamp = None

            for method, result in predictions.items():
                if step < len(result.predictions):
                    w = weights.get(method, 0.1)
                    pred_sum += result.predictions[step].predicted_value * w
                    lower_sum += result.predictions[step].lower_bound * w
                    upper_sum += result.predictions[step].upper_bound * w
                    total_weight += w
                    if timestamp is None:
                        timestamp = result.predictions[step].timestamp

            if total_weight > 0 and timestamp:
                combined.predictions.append(PredictionPoint(
                    timestamp=timestamp,
                    predicted_value=float(pred_sum / total_weight),
                    lower_bound=float(lower_sum / total_weight),
                    upper_bound=float(upper_sum / total_weight),
                    confidence=float(min(1.0, total_weight)),
                    method='ensemble'
                ))

        if predictions:
            best_r2 = -float('inf')
            for result in predictions.values():
                if result.trend_analysis:
                    r2 = result.trend_analysis.trend_strength
                    if r2 > best_r2:
                        best_r2 = r2
                        combined.trend_analysis = result.trend_analysis
                if result.rul_prediction:
                    if combined.rul_prediction is None or result.rul_prediction.confidence > combined.rul_prediction.confidence:
                        combined.rul_prediction = result.rul_prediction

            severities = [r.predicted_severity for r in predictions.values()]
            severity_order = [FaultSeverity.NORMAL, FaultSeverity.WARNING, FaultSeverity.ALERT, FaultSeverity.CRITICAL]
            combined.predicted_severity = max(severities, key=lambda s: severity_order.index(s))
            combined.current_severity = first_result.current_severity

        return combined


_global_fault_predictor: Optional[FaultPredictor] = None


def get_fault_predictor() -> FaultPredictor:
    global _global_fault_predictor
    if _global_fault_predictor is None:
        _global_fault_predictor = FaultPredictor()
    return _global_fault_predictor

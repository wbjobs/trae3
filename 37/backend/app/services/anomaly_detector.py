import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from scipy import stats
from collections import deque
from app.models.vibration_data import VibrationData
from app.models.schemas import AnomalyRecordCreate
from app.services.timeseries_calculator import TimeSeriesCalculator


class AdaptiveThreshold:
    def __init__(self, window_size: int = 100, alpha: float = 0.3):
        self.window_size = window_size
        self.alpha = alpha
        self.history = deque(maxlen=window_size)
        self.mean = None
        self.std = None
        self.ema_mean = None
        self.ema_std = None

    def update(self, value: float):
        self.history.append(value)

        if len(self.history) >= 10:
            self.mean = np.mean(self.history)
            self.std = np.std(self.history)

            if self.ema_mean is None:
                self.ema_mean = self.mean
                self.ema_std = self.std
            else:
                self.ema_mean = self.alpha * self.mean + (1 - self.alpha) * self.ema_mean
                self.ema_std = self.alpha * self.std + (1 - self.alpha) * self.ema_std

    def get_threshold(self, sigma: float = 3.0) -> float:
        if self.ema_mean is None or self.ema_std is None:
            return float('inf')
        return self.ema_mean + sigma * max(self.ema_std, 1e-10)

    def is_initialized(self) -> bool:
        return self.ema_mean is not None


class AnomalyDetector:
    def __init__(self):
        self.fixed_thresholds = {
            "x": {
                "rms_warning": 5.0,
                "rms_alarm": 10.0,
                "peak_warning": 15.0,
                "peak_alarm": 25.0,
                "crest_factor_warning": 6.0,
                "crest_factor_alarm": 10.0,
                "kurtosis_warning": 4.0,
                "kurtosis_alarm": 8.0,
                "temperature_warning": 60.0,
                "temperature_alarm": 80.0
            },
            "y": {
                "rms_warning": 5.0,
                "rms_alarm": 10.0,
                "peak_warning": 15.0,
                "peak_alarm": 25.0,
                "crest_factor_warning": 6.0,
                "crest_factor_alarm": 10.0,
                "kurtosis_warning": 4.0,
                "kurtosis_alarm": 8.0,
                "temperature_warning": 60.0,
                "temperature_alarm": 80.0
            },
            "z": {
                "rms_warning": 5.0,
                "rms_alarm": 10.0,
                "peak_warning": 15.0,
                "peak_alarm": 25.0,
                "crest_factor_warning": 6.0,
                "crest_factor_alarm": 10.0,
                "kurtosis_warning": 4.0,
                "kurtosis_alarm": 8.0,
                "temperature_warning": 60.0,
                "temperature_alarm": 80.0
            }
        }

        self.adaptive_thresholds: Dict[str, AdaptiveThreshold] = {}
        self.anomaly_history: Dict[str, List[Dict[str, Any]]] = {}
        self.consecutive_anomalies: Dict[str, int] = {}
        self.last_anomaly_time: Dict[str, datetime] = {}
        self.min_anomaly_interval = timedelta(seconds=30)
        self.use_adaptive = True
        self.required_consecutive = 2
        self.required_features = 2

    def set_thresholds(self, axis: str, thresholds: Dict[str, float]):
        if axis in self.fixed_thresholds:
            self.fixed_thresholds[axis].update(thresholds)

    def _get_adaptive_threshold(self, key: str) -> AdaptiveThreshold:
        if key not in self.adaptive_thresholds:
            self.adaptive_thresholds[key] = AdaptiveThreshold()
        return self.adaptive_thresholds[key]

    def _check_device_context(
        self,
        vibration_data: List[VibrationData],
        analysis_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        if len(vibration_data) < 10:
            return {"is_stable": False, "reason": "insufficient_data", "startup_phase": False}

        speed_data = np.array([d.speed for d in vibration_data if d.speed is not None])
        temp_data = np.array([d.temperature for d in vibration_data if d.temperature is not None])

        context = {
            "is_stable": True,
            "reason": "normal",
            "startup_phase": False,
            "shutdown_phase": False,
            "speed_variation": 0.0,
            "temp_gradient": 0.0
        }

        if len(speed_data) > 5:
            speed_std = np.std(speed_data)
            speed_mean = np.mean(speed_data)
            context["speed_variation"] = speed_std / (speed_mean + 1e-10)

            if speed_mean < 100:
                context["is_stable"] = False
                context["reason"] = "device_stopped"
            elif context["speed_variation"] > 0.1:
                context["is_stable"] = False
                context["reason"] = "speed_unstable"

        if len(temp_data) > 5:
            first_half = temp_data[:len(temp_data) // 2]
            second_half = temp_data[len(temp_data) // 2:]
            context["temp_gradient"] = np.mean(second_half) - np.mean(first_half)

            if context["temp_gradient"] > 5:
                context["startup_phase"] = True
                context["is_stable"] = False
                context["reason"] = "startup_phase"

        return context

    def _update_adaptive_thresholds(
        self,
        device_code: str,
        analysis_result: Dict[str, Any],
        context: Dict[str, Any]
    ):
        if not self.use_adaptive or not context.get("is_stable", True):
            return

        for axis in ["x", "y", "z"]:
            for metric in ["rms", "peak", "kurtosis"]:
                key = f"{device_code}_{axis}_{metric}"
                value = analysis_result.get(f"{metric}_{axis}")
                if value is not None and np.isfinite(value):
                    self._get_adaptive_threshold(key).update(value)

    def _check_multi_feature_anomaly(
        self,
        analysis_result: Dict[str, Any],
        device_code: str,
        axis: str,
        threshold_type: str
    ) -> Tuple[bool, List[str], float]:
        features = []
        exceeded = []
        max_exceed_ratio = 0.0

        thresholds = self.fixed_thresholds[axis]

        rms_value = analysis_result.get(f"rms_{axis}")
        if rms_value is not None:
            features.append("rms")
            if rms_value > thresholds[f"rms_{threshold_type}"]:
                exceeded.append(f"rms={rms_value:.3f}")
                ratio = rms_value / thresholds[f"rms_{threshold_type}"]
                max_exceed_ratio = max(max_exceed_ratio, ratio)

        peak_value = analysis_result.get(f"peak_{axis}")
        if peak_value is not None:
            features.append("peak")
            if peak_value > thresholds[f"peak_{threshold_type}"]:
                exceeded.append(f"peak={peak_value:.3f}")
                ratio = peak_value / thresholds[f"peak_{threshold_type}"]
                max_exceed_ratio = max(max_exceed_ratio, ratio)

        kurtosis_value = analysis_result.get(f"kurtosis_{axis}")
        if kurtosis_value is not None:
            features.append("kurtosis")
            if kurtosis_value > thresholds[f"kurtosis_{threshold_type}"]:
                exceeded.append(f"kurtosis={kurtosis_value:.3f}")
                ratio = kurtosis_value / thresholds[f"kurtosis_{threshold_type}"]
                max_exceed_ratio = max(max_exceed_ratio, ratio)

        crest_value = analysis_result.get(f"crest_factor_{axis}")
        if crest_value is not None:
            features.append("crest_factor")
            if crest_value > thresholds[f"crest_factor_{threshold_type}"]:
                exceeded.append(f"crest={crest_value:.3f}")
                ratio = crest_value / thresholds[f"crest_factor_{threshold_type}"]
                max_exceed_ratio = max(max_exceed_ratio, ratio)

        adaptive_key = f"{device_code}_{axis}_rms"
        adaptive_thresh = self._get_adaptive_threshold(adaptive_key)
        if self.use_adaptive and adaptive_thresh.is_initialized():
            adaptive_warning = adaptive_thresh.get_threshold(3.0)
            adaptive_alarm = adaptive_thresh.get_threshold(5.0)

            if threshold_type == "warning" and rms_value and rms_value > adaptive_warning:
                exceeded.append(f"adaptive_rms={rms_value:.3f}")

            if threshold_type == "alarm" and rms_value and rms_value > adaptive_alarm:
                exceeded.append(f"adaptive_rms={rms_value:.3f}")

        is_anomaly = len(exceeded) >= self.required_features

        return is_anomaly, exceeded, max_exceed_ratio

    def _check_temporal_consistency(
        self,
        device_code: str,
        anomaly_type: str,
        is_current_anomaly: bool
    ) -> bool:
        key = f"{device_code}_{anomaly_type}"

        if is_current_anomaly:
            self.consecutive_anomalies[key] = self.consecutive_anomalies.get(key, 0) + 1
        else:
            self.consecutive_anomalies[key] = 0

        return self.consecutive_anomalies.get(key, 0) >= self.required_consecutive

    def _should_report_anomaly(
        self,
        device_code: str,
        anomaly_type: str,
        current_time: datetime
    ) -> bool:
        key = f"{device_code}_{anomaly_type}"
        last_time = self.last_anomaly_time.get(key)

        if last_time is None or (current_time - last_time) > self.min_anomaly_interval:
            self.last_anomaly_time[key] = current_time
            return True
        return False

    def detect_threshold_anomalies(
        self,
        analysis_result: Dict[str, Any],
        device_code: str,
        timestamp: datetime,
        vibration_data: List[VibrationData]
    ) -> List[AnomalyRecordCreate]:
        anomalies = []

        context = self._check_device_context(vibration_data, analysis_result)

        if not context.get("is_stable", True) and context.get("reason") != "startup_phase":
            return anomalies

        self._update_adaptive_thresholds(device_code, analysis_result, context)

        axes = ["x", "y", "z"]

        for axis in axes:
            axis_thresholds = self.fixed_thresholds[axis]

            is_alarm, alarm_exceeded, alarm_ratio = self._check_multi_feature_anomaly(
                analysis_result, device_code, axis, "alarm"
            )

            if is_alarm and alarm_ratio > 1.5:
                is_consistent = self._check_temporal_consistency(
                    device_code, f"threshold_alarm_{axis}", True
                )

                if is_consistent and self._should_report_anomaly(
                    device_code, f"threshold_alarm_{axis}", timestamp
                ):
                    anomalies.append(AnomalyRecordCreate(
                        device_code=device_code,
                        timestamp=timestamp,
                        anomaly_type="multi_feature_alarm",
                        severity="critical",
                        axis=axis,
                        value=alarm_ratio,
                        threshold=self.required_features,
                        description=f"多指标严重超标: {', '.join(alarm_exceeded)}",
                        raw_data={
                            "features": alarm_exceeded,
                            "context": context,
                            "consecutive_count": self.consecutive_anomalies.get(
                                f"{device_code}_threshold_alarm_{axis}", 0
                            )
                        }
                    ))
                continue

            is_warning, warning_exceeded, warning_ratio = self._check_multi_feature_anomaly(
                analysis_result, device_code, axis, "warning"
            )

            if is_warning and warning_ratio > 1.2:
                is_consistent = self._check_temporal_consistency(
                    device_code, f"threshold_warning_{axis}", True
                )

                if is_consistent and self._should_report_anomaly(
                    device_code, f"threshold_warning_{axis}", timestamp
                ):
                    anomalies.append(AnomalyRecordCreate(
                        device_code=device_code,
                        timestamp=timestamp,
                        anomaly_type="multi_feature_warning",
                        severity="warning",
                        axis=axis,
                        value=warning_ratio,
                        threshold=self.required_features,
                        description=f"多指标超标: {', '.join(warning_exceeded)}",
                        raw_data={
                            "features": warning_exceeded,
                            "context": context,
                            "consecutive_count": self.consecutive_anomalies.get(
                                f"{device_code}_threshold_warning_{axis}", 0
                            )
                        }
                    ))
            else:
                self._check_temporal_consistency(
                    device_code, f"threshold_warning_{axis}", False
                )
                self._check_temporal_consistency(
                    device_code, f"threshold_alarm_{axis}", False
                )

        temp_mean = analysis_result.get("temperature_mean")
        if temp_mean and context.get("is_stable", True):
            temp_thresholds = self.fixed_thresholds["x"]
            if temp_mean > temp_thresholds["temperature_alarm"]:
                if self._should_report_anomaly(device_code, "overheat_critical", timestamp):
                    anomalies.append(AnomalyRecordCreate(
                        device_code=device_code,
                        timestamp=timestamp,
                        anomaly_type="overheat",
                        severity="critical",
                        value=temp_mean,
                        threshold=temp_thresholds["temperature_alarm"],
                        description=f"温度严重过高: {temp_mean:.1f}°C > {temp_thresholds['temperature_alarm']}°C"
                    ))
            elif temp_mean > temp_thresholds["temperature_warning"]:
                if self._should_report_anomaly(device_code, "overheat_warning", timestamp):
                    anomalies.append(AnomalyRecordCreate(
                        device_code=device_code,
                        timestamp=timestamp,
                        anomaly_type="overheat",
                        severity="warning",
                        value=temp_mean,
                        threshold=temp_thresholds["temperature_warning"],
                        description=f"温度过高: {temp_mean:.1f}°C > {temp_thresholds['temperature_warning']}°C"
                    ))

        return anomalies

    def detect_statistical_anomalies(
        self,
        data: np.ndarray,
        device_code: str,
        timestamps: List[datetime],
        axis: str,
        z_score_threshold: float = 4.0,
        min_cluster_size: int = 3
    ) -> List[AnomalyRecordCreate]:
        anomalies = []

        if len(data) < 50:
            return anomalies

        z_scores = np.abs(stats.zscore(data))
        anomaly_indices = np.where(z_scores > z_score_threshold)[0]

        if len(anomaly_indices) == 0:
            return anomalies

        clusters = []
        current_cluster = [anomaly_indices[0]]

        for i in range(1, len(anomaly_indices)):
            if anomaly_indices[i] - anomaly_indices[i - 1] <= 5:
                current_cluster.append(anomaly_indices[i])
            else:
                if len(current_cluster) >= min_cluster_size:
                    clusters.append(current_cluster)
                current_cluster = [anomaly_indices[i]]

        if len(current_cluster) >= min_cluster_size:
            clusters.append(current_cluster)

        for cluster in clusters:
            center_idx = cluster[len(cluster) // 2]
            cluster_z_scores = z_scores[cluster]
            max_z = np.max(cluster_z_scores)
            mean_z = np.mean(cluster_z_scores)

            severity = "warning" if mean_z < 6 else "critical"

            anomalies.append(AnomalyRecordCreate(
                device_code=device_code,
                timestamp=timestamps[center_idx],
                anomaly_type="impulse_cluster",
                severity=severity,
                axis=axis,
                value=float(max_z),
                threshold=z_score_threshold,
                description=f"检测到连续冲击信号群 ({len(cluster)}个点, 平均Z-score: {mean_z:.2f})",
                raw_data={
                    "cluster_size": len(cluster),
                    "indices": cluster.tolist(),
                    "max_z_score": float(max_z),
                    "mean_z_score": float(mean_z)
                }
            ))

        return anomalies

    def detect_frequency_anomalies(
        self,
        fft_data: Dict[str, Any],
        device_code: str,
        timestamp: datetime,
        expected_frequencies: Optional[List[float]] = None
    ) -> List[AnomalyRecordCreate]:
        anomalies = []

        for axis in ["x", "y", "z"]:
            axis_fft = fft_data.get(axis, {})
            if not axis_fft:
                continue

            harmonics = axis_fft.get("harmonics", [])

            if len(harmonics) >= 8:
                harmonic_amplitudes = [h["magnitude"] for h in harmonics]
                total_harmonic_energy = sum(harmonic_amplitudes)

                fundamental = axis_fft.get("dominant_magnitude", 1e-10)
                thd = total_harmonic_energy / (fundamental + 1e-10)

                if thd > 1.0:
                    anomalies.append(AnomalyRecordCreate(
                        device_code=device_code,
                        timestamp=timestamp,
                        anomaly_type="severe_harmonic_distortion",
                        severity="warning",
                        axis=axis,
                        value=float(thd),
                        threshold=1.0,
                        description=f"严重谐波失真: {len(harmonics)}个谐波, THD={thd:.2f}",
                        raw_data={"harmonic_count": len(harmonics), "thd": float(thd)}
                    ))

            dominant_freq = axis_fft.get("dominant_frequency", 0)
            if expected_frequencies and dominant_freq > 0:
                expected = expected_frequencies[0]
                freq_deviation = abs(dominant_freq - expected) / expected
                if freq_deviation > 0.1:
                    anomalies.append(AnomalyRecordCreate(
                        device_code=device_code,
                        timestamp=timestamp,
                        anomaly_type="frequency_deviation",
                        severity="warning",
                        axis=axis,
                        value=float(dominant_freq),
                        threshold=expected,
                        description=f"主频率偏移: {dominant_freq:.2f}Hz vs 预期 {expected:.2f}Hz (偏差{freq_deviation*100:.1f}%)"
                    ))

        return anomalies

    def detect_trend_anomalies(
        self,
        vibration_data: List[VibrationData],
        device_code: str,
        window_size: int = 100,
        history_window: int = 5
    ) -> List[AnomalyRecordCreate]:
        anomalies = []
        if len(vibration_data) < window_size * (history_window + 1):
            return anomalies

        df = {
            "timestamp": [d.timestamp for d in vibration_data],
            "x_axis": [d.x_axis for d in vibration_data],
            "y_axis": [d.y_axis for d in vibration_data],
            "z_axis": [d.z_axis for d in vibration_data]
        }

        for axis in ["x", "y", "z"]:
            data = np.array(df[f"{axis}_axis"])
            rms_series = []

            for i in range(0, len(data) - window_size + 1, window_size // 2):
                window = data[i:i + window_size]
                rms_series.append(np.sqrt(np.mean(window ** 2)))

            if len(rms_series) >= history_window + 1:
                baseline = np.mean(rms_series[:history_window])
                recent = np.mean(rms_series[-history_window:])

                if baseline > 0:
                    increase_ratio = recent / baseline

                    if increase_ratio > 2.0:
                        anomalies.append(AnomalyRecordCreate(
                            device_code=device_code,
                            timestamp=df["timestamp"][-1],
                            anomaly_type="rapid_deterioration",
                            severity="critical",
                            axis=axis,
                            value=float(increase_ratio),
                            threshold=2.0,
                            description=f"检测到快速劣化趋势: RMS从{baseline:.4f}升至{recent:.4f} ({increase_ratio:.2f}倍)",
                            raw_data={
                                "baseline_rms": float(baseline),
                                "recent_rms": float(recent),
                                "rms_series": [float(x) for x in rms_series]
                            }
                        ))
                    elif increase_ratio > 1.3:
                        anomalies.append(AnomalyRecordCreate(
                            device_code=device_code,
                            timestamp=df["timestamp"][-1],
                            anomaly_type="deterioration_trend",
                            severity="warning",
                            axis=axis,
                            value=float(increase_ratio),
                            threshold=1.3,
                            description=f"检测到劣化趋势: RMS从{baseline:.4f}升至{recent:.4f} ({increase_ratio:.2f}倍)",
                            raw_data={
                                "baseline_rms": float(baseline),
                                "recent_rms": float(recent),
                                "rms_series": [float(x) for x in rms_series]
                            }
                        ))

        return anomalies

    def comprehensive_anomaly_detection(
        self,
        vibration_data: List[VibrationData],
        analysis_result: Dict[str, Any]
    ) -> List[AnomalyRecordCreate]:
        if not vibration_data:
            return []

        device_code = vibration_data[0].device_code
        timestamp = vibration_data[-1].timestamp

        all_anomalies = []

        threshold_anomalies = self.detect_threshold_anomalies(
            analysis_result, device_code, timestamp, vibration_data
        )
        all_anomalies.extend(threshold_anomalies)

        if not any(a.severity == "critical" for a in threshold_anomalies):
            for axis in ["x", "y", "z"]:
                axis_data = np.array([getattr(d, f"{axis}_axis") for d in vibration_data])
                timestamps = [d.timestamp for d in vibration_data]

                stat_anomalies = self.detect_statistical_anomalies(
                    axis_data, device_code, timestamps, axis, z_score_threshold=4.0
                )
                all_anomalies.extend(stat_anomalies)

        fft_data = analysis_result.get("fft_data", {})
        if fft_data:
            freq_anomalies = self.detect_frequency_anomalies(
                fft_data, device_code, timestamp
            )
            all_anomalies.extend(freq_anomalies)

        trend_anomalies = self.detect_trend_anomalies(vibration_data, device_code)
        all_anomalies.extend(trend_anomalies)

        seen = set()
        unique_anomalies = []
        for a in all_anomalies:
            key = (a.anomaly_type, a.axis, a.timestamp.strftime("%Y-%m-%d %H:%M:%S"))
            if key not in seen:
                seen.add(key)
                unique_anomalies.append(a)

        return unique_anomalies

    @staticmethod
    def classify_anomaly_type(
        analysis_result: Dict[str, Any],
        anomaly_records: List[AnomalyRecordCreate]
    ) -> Tuple[str, str]:
        anomaly_types = [a.anomaly_type for a in anomaly_records]
        severities = [a.severity for a in anomaly_records]

        has_critical = "critical" in severities

        if "multi_feature_alarm" in anomaly_types and has_critical:
            kurtosis_x = analysis_result.get("kurtosis_x", 0)
            kurtosis_y = analysis_result.get("kurtosis_y", 0)
            kurtosis_z = analysis_result.get("kurtosis_z", 0)
            max_kurtosis = max(kurtosis_x, kurtosis_y, kurtosis_z)

            crest_x = analysis_result.get("crest_factor_x", 0)
            crest_y = analysis_result.get("crest_factor_y", 0)
            crest_z = analysis_result.get("crest_factor_z", 0)
            max_crest = max(crest_x, crest_y, crest_z)

            if max_kurtosis > 8 and max_crest > 8:
                return "bearing_damage", "critical"

        if "rapid_deterioration" in anomaly_types:
            return "rapid_deterioration", "critical"

        if "impulse_cluster" in anomaly_types and has_critical:
            return "severe_impact", "critical"

        if "multi_feature_warning" in anomaly_types:
            kurtosis_x = analysis_result.get("kurtosis_x", 0)
            kurtosis_y = analysis_result.get("kurtosis_y", 0)
            kurtosis_z = analysis_result.get("kurtosis_z", 0)
            max_kurtosis = max(kurtosis_x, kurtosis_y, kurtosis_z)

            crest_x = analysis_result.get("crest_factor_x", 0)
            crest_y = analysis_result.get("crest_factor_y", 0)
            crest_z = analysis_result.get("crest_factor_z", 0)
            max_crest = max(crest_x, crest_y, crest_z)

            if max_kurtosis > 4 and max_crest > 6:
                return "early_bearing_wear", "warning"

        if "impulse_cluster" in anomaly_types:
            return "intermittent_impact", "warning"

        if "deterioration_trend" in anomaly_types:
            return "gradual_deterioration", "warning"

        if "severe_harmonic_distortion" in anomaly_types:
            return "gear_meshing_issue", "warning"

        if "overheat" in anomaly_types:
            return "lubrication_issue", "warning"

        if anomaly_records:
            return "abnormal_operation", "warning"

        return "normal", "normal"

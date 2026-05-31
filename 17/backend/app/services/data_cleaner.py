import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from scipy import stats

from ..schemas import TimeSeriesPoint, DataCleaningParams, CleaningResult
from .victoria_metrics import victoria_metrics_client


METRIC_VALID_RANGES = {
    "voltage": {"min": 200.0, "max": 800.0, "unit": "V"},
    "current": {"min": 0.0, "max": 20.0, "unit": "A"},
    "temperature": {"min": -40.0, "max": 120.0, "unit": "°C"},
    "power": {"min": 0.0, "max": 500.0, "unit": "W"},
}

DEFAULT_Z_THRESHOLD = 3.0
DEFAULT_IQR_MULTIPLIER = 1.5
MAX_MISSING_RATIO = 0.3
MIN_VALID_POINTS = 10


class DataCleanerService:
    def __init__(self):
        self.vm_client = victoria_metrics_client

    async def clean_time_series_data(
        self,
        params: DataCleaningParams
    ) -> Dict[str, Any]:
        metrics = params.metrics or ["voltage", "current", "temperature"]
        component_ids = params.component_ids or ["comp_001"]

        results = {}
        cleaning_summary = []
        total_processed = 0
        total_removed_outliers = 0
        total_filled_missing = 0

        for component_id in component_ids:
            component_results = {}

            for metric in metrics:
                query = self.vm_client.build_query(
                    metric=metric,
                    component_ids=[component_id]
                )

                try:
                    response = await self.vm_client.query_range(
                        query=query,
                        start=params.start_time,
                        end=params.end_time,
                        step=params.step or "1m"
                    )

                    if response.get("status") == "success":
                        data = response.get("data", {})
                        results_list = data.get("result", [])

                        if results_list:
                            values = results_list[0].get("values", [])
                            points = self._parse_raw_points(values)

                            if len(points) > 0:
                                cleaned_points, summary = self._clean_single_series(
                                    points,
                                    metric=metric,
                                    remove_outliers=params.remove_outliers,
                                    outlier_threshold=params.outlier_threshold or DEFAULT_Z_THRESHOLD,
                                    outlier_method=params.outlier_method or "zscore",
                                    fill_missing=params.fill_missing,
                                    fill_method=params.fill_method,
                                    smooth_data=params.smooth_data,
                                    smooth_window=params.smooth_window or 5,
                                    validate_range=params.validate_range,
                                    remove_duplicates=params.remove_duplicates,
                                )

                                component_results[metric] = cleaned_points
                                summary.update({
                                    "component_id": component_id,
                                    "metric": metric,
                                })
                                cleaning_summary.append(summary)

                                total_processed += summary["original_points"]
                                total_removed_outliers += summary["removed_outliers"]
                                total_filled_missing += summary["filled_missing"]

                except Exception as e:
                    print(f"Error cleaning data for {component_id}/{metric}: {str(e)}")
                    continue

            results[component_id] = component_results

        return {
            "processed": total_processed,
            "removedOutliers": total_removed_outliers,
            "filledMissing": total_filled_missing,
            "data": results,
            "summary": cleaning_summary
        }

    def _parse_raw_points(self, values: List[List[Any]]) -> List[TimeSeriesPoint]:
        if not values:
            return []

        points = []
        for t, v in values:
            try:
                timestamp = int(float(t)) * 1000
                value = float(v)
                points.append(TimeSeriesPoint(
                    timestamp=timestamp,
                    value=value
                ))
            except (ValueError, TypeError):
                continue

        return points

    def _clean_single_series(
        self,
        points: List[TimeSeriesPoint],
        metric: str = "voltage",
        remove_outliers: bool = True,
        outlier_threshold: float = DEFAULT_Z_THRESHOLD,
        outlier_method: str = "zscore",
        fill_missing: bool = True,
        fill_method: str = "linear",
        smooth_data: bool = False,
        smooth_window: int = 5,
        validate_range: bool = True,
        remove_duplicates: bool = True,
    ) -> Tuple[List[TimeSeriesPoint], Dict[str, Any]]:
        if not points:
            return [], {
                "original_points": 0,
                "cleaned_points": 0,
                "removed_outliers": 0,
                "filled_missing": 0,
                "removed_range_invalid": 0,
                "removed_duplicates": 0,
                "data_quality_score": 0,
                "quality_issues": [],
            }

        original_count = len(points)
        outliers_removed = 0
        missing_filled = 0
        range_invalid_removed = 0
        duplicates_removed = 0
        quality_issues = []

        timestamps = [p.timestamp for p in points]
        values = [p.value for p in points]

        df = pd.DataFrame({
            "timestamp": pd.to_datetime(timestamps, unit="ms"),
            "value": values
        })
        df = df.set_index("timestamp").sort_index()

        df = df[~df.index.duplicated(keep="first")]
        duplicates_removed = original_count - len(df)
        if duplicates_removed > 0:
            quality_issues.append(f"Removed {duplicates_removed} duplicate timestamps")

        if validate_range and metric in METRIC_VALID_RANGES:
            valid_range = METRIC_VALID_RANGES[metric]
            before_count = len(df)
            mask = (df["value"] >= valid_range["min"]) & (df["value"] <= valid_range["max"])
            df = df[mask]
            range_invalid_removed = before_count - len(df)
            if range_invalid_removed > 0:
                quality_issues.append(
                    f"Removed {range_invalid_removed} values outside valid range "
                    f"[{valid_range['min']}, {valid_range['max']}] {valid_range['unit']}"
                )

        if len(df) < MIN_VALID_POINTS:
            quality_issues.append(f"Insufficient valid data: only {len(df)} points remaining")
            return [], self._build_summary(
                original_count, 0, outliers_removed, missing_filled,
                range_invalid_removed, duplicates_removed, quality_issues
            )

        if remove_outliers:
            before_count = len(df)
            df = self._remove_outliers(df, method=outlier_method, threshold=outlier_threshold)
            outliers_removed = before_count - len(df)
            if outliers_removed > 0:
                quality_issues.append(f"Removed {outliers_removed} outliers ({outlier_method} method)")

        if len(df) < MIN_VALID_POINTS:
            quality_issues.append(f"Insufficient data after outlier removal")
            return [], self._build_summary(
                original_count, len(df), outliers_removed, missing_filled,
                range_invalid_removed, duplicates_removed, quality_issues
            )

        if fill_missing:
            df, filled = self._fill_missing_values(df, method=fill_method, metric=metric)
            missing_filled = filled
            if missing_filled > 0:
                quality_issues.append(f"Filled {missing_filled} missing values using {fill_method} interpolation")

        if smooth_data and len(df) > smooth_window:
            df["value"] = df["value"].rolling(
                window=smooth_window,
                center=True,
                min_periods=max(1, smooth_window // 2)
            ).mean()
            quality_issues.append(f"Applied {smooth_window}-point moving average smoothing")

        df["value"] = df["value"].round(4)

        cleaned_points = [
            TimeSeriesPoint(
                timestamp=int(idx.timestamp() * 1000),
                value=float(row["value"])
            )
            for idx, row in df.iterrows()
        ]

        data_quality_score = self._calculate_quality_score(
            original_count,
            outliers_removed + range_invalid_removed,
            missing_filled,
            len(cleaned_points),
            duplicates_removed
        )

        summary = self._build_summary(
            original_count, len(cleaned_points), outliers_removed, missing_filled,
            range_invalid_removed, duplicates_removed, quality_issues, data_quality_score
        )

        return cleaned_points, summary

    def _remove_outliers(
        self,
        df: pd.DataFrame,
        method: str = "zscore",
        threshold: float = DEFAULT_Z_THRESHOLD
    ) -> pd.DataFrame:
        if len(df) < 4:
            return df

        values = df["value"].dropna()
        if len(values) < 4:
            return df

        if method == "zscore":
            z_scores = np.abs(stats.zscore(values))
            mask = (z_scores < threshold).reindex(df.index, fill_value=True)
            return df[mask]

        elif method == "iqr":
            Q1 = values.quantile(0.25)
            Q3 = values.quantile(0.75)
            IQR = Q3 - Q1
            lower_bound = Q1 - DEFAULT_IQR_MULTIPLIER * IQR
            upper_bound = Q3 + DEFAULT_IQR_MULTIPLIER * IQR
            mask = (df["value"] >= lower_bound) & (df["value"] <= upper_bound)
            return df[mask.fillna(True)]

        elif method == "rolling":
            rolling_mean = df["value"].rolling(window=10, center=True, min_periods=3).mean()
            rolling_std = df["value"].rolling(window=10, center=True, min_periods=3).std()
            lower_bound = rolling_mean - threshold * rolling_std
            upper_bound = rolling_mean + threshold * rolling_std
            mask = (df["value"] >= lower_bound) & (df["value"] <= upper_bound)
            return df[mask.fillna(True)]

        return df

    def _fill_missing_values(
        self,
        df: pd.DataFrame,
        method: str = "linear",
        metric: str = "voltage"
    ) -> Tuple[pd.DataFrame, int]:
        df = df.sort_index()

        time_diffs = df.index.to_series().diff().dt.total_seconds()
        if len(time_diffs) > 1:
            avg_interval = time_diffs[time_diffs > 0].median()
            if pd.notna(avg_interval) and avg_interval > 0:
                full_index = pd.date_range(
                    start=df.index.min(),
                    end=df.index.max(),
                    freq=f"{int(avg_interval)}S"
                )
                df = df.reindex(full_index)

        missing_before = int(df["value"].isna().sum())

        if missing_before == 0:
            return df, 0

        if method == "linear":
            df["value"] = df["value"].interpolate(method="linear", limit_direction="both")
        elif method == "time":
            df["value"] = df["value"].interpolate(method="time", limit_direction="both")
        elif method == "spline":
            df["value"] = df["value"].interpolate(method="spline", order=2, limit_direction="both")
        elif method == "nearest":
            df["value"] = df["value"].interpolate(method="nearest", limit_direction="both")
        else:
            df["value"] = df["value"].interpolate(method="linear", limit_direction="both")

        df["value"] = df["value"].ffill().bfill()

        if metric in METRIC_VALID_RANGES:
            valid_range = METRIC_VALID_RANGES[metric]
            df["value"] = df["value"].clip(valid_range["min"], valid_range["max"])

        missing_after = int(df["value"].isna().sum())
        filled = missing_before - missing_after

        return df, filled

    def _build_summary(
        self,
        original_count: int,
        cleaned_count: int,
        outliers_removed: int,
        missing_filled: int,
        range_invalid_removed: int,
        duplicates_removed: int,
        quality_issues: List[str],
        quality_score: float = 0
    ) -> Dict[str, Any]:
        return {
            "original_points": original_count,
            "cleaned_points": cleaned_count,
            "removed_outliers": outliers_removed,
            "filled_missing": missing_filled,
            "removed_range_invalid": range_invalid_removed,
            "removed_duplicates": duplicates_removed,
            "data_quality_score": quality_score,
            "quality_issues": quality_issues,
        }

    def _calculate_quality_score(
        self,
        original: int,
        removed: int,
        missing: int,
        cleaned: int,
        duplicates: int = 0
    ) -> float:
        if original == 0:
            return 0.0

        total_invalid = removed + duplicates
        validity_ratio = max(0.0, 1.0 - (total_invalid / original))
        missing_ratio = missing / max(cleaned + missing, 1)
        retention_ratio = cleaned / original if original > 0 else 0

        if missing_ratio > MAX_MISSING_RATIO:
            validity_ratio *= 0.8

        quality_score = (
            validity_ratio * 0.45 +
            (1.0 - missing_ratio) * 0.25 +
            retention_ratio * 0.3
        ) * 100.0

        return max(0.0, min(100.0, round(quality_score, 2)))

    def validate_data_quality(
        self,
        points: List[TimeSeriesPoint],
        metric: str = "voltage"
    ) -> Dict[str, Any]:
        if not points:
            return {
                "total_points": 0,
                "missing_points": 0,
                "duplicate_points": 0,
                "outlier_count": 0,
                "range_invalid_count": 0,
                "value_range": {"min": 0, "max": 0, "avg": 0},
                "gap_count": 0,
                "max_gap_minutes": 0,
                "completeness": 0,
                "quality_score": 0,
                "quality_level": "unknown",
            }

        timestamps = [p.timestamp for p in points]
        values = [p.value for p in points]

        df = pd.DataFrame({
            "timestamp": pd.to_datetime(timestamps, unit="ms"),
            "value": values
        }).sort_values("timestamp")

        total_points = len(df)
        duplicate_count = int(df.duplicated("timestamp").sum())
        df_unique = df.drop_duplicates("timestamp")

        missing_points = int(df_unique["value"].isna().sum())

        valid_range = METRIC_VALID_RANGES.get(metric, {"min": -np.inf, "max": np.inf})
        range_invalid = int(((df_unique["value"] < valid_range["min"]) |
                            (df_unique["value"] > valid_range["max"])).sum())

        time_diffs = df_unique["timestamp"].diff().dt.total_seconds().dropna()
        gap_count = 0
        max_gap_seconds = 0
        if len(time_diffs) > 0:
            avg_interval = time_diffs[time_diffs > 0].median()
            if pd.notna(avg_interval) and avg_interval > 0:
                gaps = time_diffs[time_diffs > avg_interval * 2]
                gap_count = int(len(gaps))
                max_gap_seconds = float(time_diffs.max()) if len(time_diffs) > 0 else 0

        z_scores = np.abs(stats.zscore(df_unique["value"].dropna()))
        outlier_count = int((z_scores > DEFAULT_Z_THRESHOLD).sum())

        expected_points = 1
        if len(df_unique) >= 2:
            time_span = (df_unique["timestamp"].max() - df_unique["timestamp"].min()).total_seconds()
            if time_span > 0 and len(time_diffs) > 0:
                avg_interval = time_diffs[time_diffs > 0].median()
                if pd.notna(avg_interval) and avg_interval > 0:
                    expected_points = int(time_span / avg_interval) + 1

        completeness = min(100.0, (len(df_unique) / max(expected_points, 1)) * 100.0)

        quality_score = self._calculate_quality_score(
            total_points, outlier_count + range_invalid, missing_points,
            len(df_unique), duplicate_count
        )

        if quality_score >= 90:
            quality_level = "excellent"
        elif quality_score >= 75:
            quality_level = "good"
        elif quality_score >= 60:
            quality_level = "fair"
        elif quality_score >= 40:
            quality_level = "poor"
        else:
            quality_level = "critical"

        return {
            "total_points": total_points,
            "missing_points": missing_points,
            "duplicate_points": duplicate_count,
            "outlier_count": outlier_count,
            "range_invalid_count": range_invalid,
            "value_range": {
                "min": float(df_unique["value"].min()) if len(df_unique) > 0 else 0,
                "max": float(df_unique["value"].max()) if len(df_unique) > 0 else 0,
                "avg": float(df_unique["value"].mean()) if len(df_unique) > 0 else 0,
                "std": float(df_unique["value"].std()) if len(df_unique) > 1 else 0,
            },
            "gap_count": gap_count,
            "max_gap_minutes": round(max_gap_seconds / 60, 2),
            "completeness": round(completeness, 2),
            "quality_score": quality_score,
            "quality_level": quality_level,
        }

    async def clean_data_batch(
        self,
        params: DataCleaningParams
    ) -> Dict[str, Any]:
        return await self.clean_time_series_data(params)


data_cleaner_service = DataCleanerService()

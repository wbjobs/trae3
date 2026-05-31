import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import numpy as np
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import logging
from config import Config

logger = logging.getLogger(__name__)

class DataCleaningService:
    def __init__(self):
        self.metric_configs = Config.METRIC_CONFIGS

    def remove_outliers_iqr(self, df: pd.DataFrame, columns: List[str],
                            threshold: float = 1.5) -> pd.DataFrame:
        df_clean = df.copy()
        for col in columns:
            if col not in df_clean.columns:
                continue
            series = df_clean[col]
            if not np.issubdtype(series.dtype, np.number):
                continue
            valid = series.dropna()
            if len(valid) < 4:
                continue
            Q1 = valid.quantile(0.25)
            Q3 = valid.quantile(0.75)
            IQR = Q3 - Q1
            if IQR == 0:
                continue
            lower_bound = Q1 - threshold * IQR
            upper_bound = Q3 + threshold * IQR
            mask = (series < lower_bound) | (series > upper_bound)
            outlier_count = mask.sum()
            if outlier_count > 0:
                df_clean.loc[mask, col] = np.nan
                logger.info(f"IQR: removed {outlier_count} outliers from '{col}' (threshold={threshold})")
        return df_clean

    def remove_outliers_zscore(self, df: pd.DataFrame, columns: List[str],
                               threshold: float = 3.0) -> pd.DataFrame:
        df_clean = df.copy()
        for col in columns:
            if col not in df_clean.columns:
                continue
            series = df_clean[col]
            if not np.issubdtype(series.dtype, np.number):
                continue
            valid = series.dropna()
            if len(valid) < 3:
                continue
            mean_val = valid.mean()
            std_val = valid.std()
            if std_val == 0:
                continue
            z_scores = np.abs((series - mean_val) / std_val)
            mask = z_scores > threshold
            outlier_count = mask.sum()
            if outlier_count > 0:
                df_clean.loc[mask, col] = np.nan
                logger.info(f"Z-score: removed {outlier_count} outliers from '{col}' (threshold={threshold})")
        return df_clean

    def filter_by_physical_range(self, df: pd.DataFrame, columns: List[str],
                                  metric_ranges: Dict[str, Tuple[float, float]] = None) -> pd.DataFrame:
        df_clean = df.copy()
        ranges = metric_ranges or {}
        for col in columns:
            if col not in df_clean.columns:
                continue
            if not np.issubdtype(df_clean[col].dtype, np.number):
                continue
            if col in ranges:
                min_val, max_val = ranges[col]
            elif col in self.metric_configs:
                min_val = self.metric_configs[col]['min']
                max_val = self.metric_configs[col]['max']
            else:
                continue
            series = df_clean[col]
            mask = (series < min_val) | (series > max_val)
            out_count = mask.sum()
            if out_count > 0:
                df_clean.loc[mask, col] = np.nan
                logger.info(f"Physical range: {out_count} values out of [{min_val}, {max_val}] in '{col}'")
        return df_clean

    def detect_sudden_changes(self, df: pd.DataFrame, columns: List[str],
                               threshold: float = 3.0,
                               min_change: float = None) -> pd.DataFrame:
        df_clean = df.copy()
        for col in columns:
            if col not in df_clean.columns:
                continue
            if not np.issubdtype(df_clean[col].dtype, np.number):
                continue
            series = df_clean[col].copy()
            if len(series) < 3:
                continue
            diff = series.diff().abs()
            if min_change is not None:
                mask = diff > min_change
            else:
                valid_diff = diff.dropna()
                if len(valid_diff) < 2:
                    continue
                mean_diff = valid_diff.mean()
                std_diff = valid_diff.std()
                if std_diff == 0:
                    continue
                mask = diff > (mean_diff + threshold * std_diff)
            mask.iloc[0] = False
            change_count = mask.sum()
            if change_count > 0:
                df_clean.loc[mask, col] = np.nan
                logger.info(f"Sudden change: {change_count} spikes detected in '{col}'")
        return df_clean

    def detect_rate_of_change(self, df: pd.DataFrame, columns: List[str],
                               max_rate: float = None) -> pd.DataFrame:
        df_clean = df.copy()
        for col in columns:
            if col not in df_clean.columns:
                continue
            if not np.issubdtype(df_clean[col].dtype, np.number):
                continue
            series = df_clean[col].copy()
            if len(series) < 3:
                continue
            config = self.metric_configs.get(col)
            if max_rate is not None:
                rate_limit = max_rate
            elif config:
                rate_limit = config.get('std', 10) * 3
            else:
                continue
            diff = series.diff().abs()
            mask = diff > rate_limit
            mask.iloc[0] = False
            rate_count = mask.sum()
            if rate_count > 0:
                df_clean.loc[mask, col] = np.nan
                logger.info(f"Rate-of-change: {rate_count} points exceeded rate limit in '{col}'")
        return df_clean

    def handle_missing_values(self, df: pd.DataFrame, columns: List[str],
                               method: str = 'linear') -> pd.DataFrame:
        df_clean = df.copy()
        for col in columns:
            if col not in df_clean.columns:
                continue
            missing_before = df_clean[col].isna().sum()
            if missing_before == 0:
                continue
            if method == 'drop':
                df_clean = df_clean.dropna(subset=[col])
            elif method == 'ffill':
                df_clean[col] = df_clean[col].ffill()
            elif method == 'bfill':
                df_clean[col] = df_clean[col].bfill()
            elif method == 'mean':
                df_clean[col] = df_clean[col].fillna(df_clean[col].mean())
            elif method == 'median':
                df_clean[col] = df_clean[col].fillna(df_clean[col].median())
            elif method == 'linear':
                df_clean[col] = df_clean[col].interpolate(method='linear')
            elif method == 'time':
                if '_time' in df_clean.columns:
                    df_indexed = df_clean.set_index('_time')
                    df_indexed[col] = df_indexed[col].interpolate(method='time')
                    df_clean[col] = df_indexed[col].values
                else:
                    df_clean[col] = df_clean[col].interpolate(method='linear')
            df_clean[col] = df_clean[col].ffill().bfill()
        return df_clean

    def resample_data(self, df: pd.DataFrame, time_col: str,
                      rule: str = '1min',
                      agg_methods: Dict[str, str] = None) -> pd.DataFrame:
        if time_col not in df.columns:
            logger.error(f"Time column {time_col} not found")
            return df
        df_resampled = df.copy()
        df_resampled[time_col] = pd.to_datetime(df_resampled[time_col])
        df_resampled = df_resampled.set_index(time_col)
        if agg_methods is None:
            agg_methods = {col: 'mean' for col in df_resampled.columns
                          if np.issubdtype(df_resampled[col].dtype, np.number)}
        df_resampled = df_resampled.resample(rule).agg(agg_methods)
        df_resampled = df_resampled.reset_index()
        logger.info(f"Resampled from {len(df)} to {len(df_resampled)} points")
        return df_resampled

    def smooth_data(self, df: pd.DataFrame, columns: List[str],
                    window_size: int = 5,
                    method: str = 'rolling_mean') -> pd.DataFrame:
        df_smoothed = df.copy()
        for col in columns:
            if col not in df_smoothed.columns:
                continue
            if not np.issubdtype(df_smoothed[col].dtype, np.number):
                continue
            if method == 'rolling_mean':
                df_smoothed[col] = df_smoothed[col].rolling(window=window_size, center=True, min_periods=1).mean()
            elif method == 'rolling_median':
                df_smoothed[col] = df_smoothed[col].rolling(window=window_size, center=True, min_periods=1).median()
            elif method == 'ewm':
                df_smoothed[col] = df_smoothed[col].ewm(span=window_size, min_periods=1).mean()
        return df_smoothed

    def normalize_data(self, df: pd.DataFrame, columns: List[str],
                       method: str = 'minmax') -> pd.DataFrame:
        df_normalized = df.copy()
        for col in columns:
            if col not in df_normalized.columns:
                continue
            if not np.issubdtype(df_normalized[col].dtype, np.number):
                continue
            if method == 'minmax':
                min_val = df_normalized[col].min()
                max_val = df_normalized[col].max()
                if max_val != min_val:
                    df_normalized[col] = (df_normalized[col] - min_val) / (max_val - min_val)
            elif method == 'zscore':
                mean_val = df_normalized[col].mean()
                std_val = df_normalized[col].std()
                if std_val != 0:
                    df_normalized[col] = (df_normalized[col] - mean_val) / std_val
        return df_normalized

    def validate_time_series(self, df: pd.DataFrame, time_col: str,
                             expected_frequency: str = None) -> Dict:
        validation = {
            'is_valid': True, 'issues': [],
            'total_rows': len(df), 'missing_timestamps': 0, 'duplicate_timestamps': 0
        }
        if time_col not in df.columns:
            validation['is_valid'] = False
            validation['issues'].append(f"Time column {time_col} not found")
            return validation
        df_validate = df.copy()
        df_validate[time_col] = pd.to_datetime(df_validate[time_col])
        duplicate_count = df_validate.duplicated(subset=[time_col]).sum()
        if duplicate_count > 0:
            validation['is_valid'] = False
            validation['duplicate_timestamps'] = duplicate_count
            validation['issues'].append(f"Found {duplicate_count} duplicate timestamps")
        df_validate = df_validate.drop_duplicates(subset=[time_col]).sort_values(time_col)
        if expected_frequency:
            full_range = pd.date_range(
                start=df_validate[time_col].min(),
                end=df_validate[time_col].max(),
                freq=expected_frequency
            )
            missing_count = len(full_range) - len(df_validate)
            if missing_count > 0:
                validation['missing_timestamps'] = missing_count
                validation['issues'].append(f"Found {missing_count} missing timestamps")
        return validation

    def clean_pipeline(self, df: pd.DataFrame, time_col: str,
                        value_columns: List[str],
                        outlier_method: str = 'iqr',
                        missing_method: str = 'linear',
                        resample_rule: str = None,
                        smooth_window: int = None,
                        enable_physical_range: bool = True,
                        enable_sudden_change: bool = True,
                        enable_rate_check: bool = True) -> pd.DataFrame:
        logger.info("Starting data cleaning pipeline...")
        df_clean = df.copy()
        validation = self.validate_time_series(df_clean, time_col)
        if not validation['is_valid']:
            logger.warning(f"Data validation issues: {validation['issues']}")

        if enable_physical_range:
            df_clean = self.filter_by_physical_range(df_clean, value_columns)
        if outlier_method == 'iqr':
            df_clean = self.remove_outliers_iqr(df_clean, value_columns)
        elif outlier_method == 'zscore':
            df_clean = self.remove_outliers_zscore(df_clean, value_columns)
        if enable_sudden_change:
            df_clean = self.detect_sudden_changes(df_clean, value_columns)
        if enable_rate_check:
            df_clean = self.detect_rate_of_change(df_clean, value_columns)

        df_clean = self.handle_missing_values(df_clean, value_columns, method=missing_method)
        if resample_rule:
            df_clean = self.resample_data(df_clean, time_col, resample_rule)
        if smooth_window:
            df_clean = self.smooth_data(df_clean, value_columns, window_size=smooth_window)
        logger.info("Data cleaning pipeline completed")
        return df_clean

    def get_data_quality_report(self, df: pd.DataFrame, columns: List[str]) -> Dict:
        report = {'total_rows': len(df), 'columns': {}}
        for col in columns:
            if col not in df.columns:
                continue
            series = df[col]
            col_report = {
                'count': int(series.count()),
                'missing_count': int(series.isna().sum()),
                'missing_percentage': round(series.isna().sum() / max(len(series), 1) * 100, 2),
                'unique_values': int(series.nunique()),
                'dtype': str(series.dtype)
            }
            if np.issubdtype(series.dtype, np.number) and not series.isna().all():
                col_report.update({
                    'min': round(float(series.min()), 2),
                    'max': round(float(series.max()), 2),
                    'mean': round(float(series.mean()), 2),
                    'std': round(float(series.std()), 2),
                    'median': round(float(series.median()), 2),
                    'p95': round(float(series.quantile(0.95)), 2),
                    'p99': round(float(series.quantile(0.99)), 2),
                })
                if col in self.metric_configs:
                    config = self.metric_configs[col]
                    out_range = ((series < config['min']) | (series > config['max'])).sum()
                    col_report['out_of_physical_range'] = int(out_range)
            report['columns'][col] = col_report
        return report

data_cleaning_service = DataCleaningService()

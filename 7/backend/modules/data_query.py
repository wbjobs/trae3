import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.influxdb_manager import influxdb_manager
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import pandas as pd
import numpy as np
import logging
from config import Config

logger = logging.getLogger(__name__)

TIME_RANGE_MAP = {
    '1h': timedelta(hours=1),
    '6h': timedelta(hours=6),
    '12h': timedelta(hours=12),
    '24h': timedelta(hours=24),
    '7d': timedelta(days=7),
    '30d': timedelta(days=30)
}

DOWNSAMPLE_MAP = {
    '1h': '10s',
    '6h': '30s',
    '12h': '1m',
    '24h': '2m',
    '7d': '15m',
    '30d': '1h'
}

MAX_POINTS = 800

class DataQueryService:
    def __init__(self):
        self.influxdb = influxdb_manager
        self.bucket = Config.INFLUXDB_BUCKET

    def _parse_time_range(self, time_range: str) -> Tuple[datetime, datetime, str]:
        end_time = datetime.now()
        duration = TIME_RANGE_MAP.get(time_range, timedelta(hours=24))
        start_time = end_time - duration
        aggregation = DOWNSAMPLE_MAP.get(time_range, '1m')
        return start_time, end_time, aggregation

    def _adaptive_downsample(self, df: pd.DataFrame, max_points: int = MAX_POINTS) -> pd.DataFrame:
        if len(df) <= max_points or df.empty:
            return df, 1

        ratio = max(1, int(np.ceil(len(df) / max_points)))
        if ratio <= 2:
            return df, 1

        numeric_cols = df.select_dtypes(include=[np.number]).columns
        df_resampled = df.copy()
        if '_time' in df_resampled.columns:
            df_resampled = df_resampled.set_index('_time')
            df_resampled = df_resampled[numeric_cols].resample(f'{ratio * 10}s').mean()
            df_resampled = df_resampled.dropna(how='all')
            df_resampled = df_resampled.reset_index()
        else:
            df_resampled = df.iloc[::ratio].copy()
            df_resampled = df_resampled.reset_index(drop=True)

        return df_resampled, ratio

    def get_device_timeseries(self, device_id: str, metrics: List[str],
                               time_range: str = '24h',
                               downsample: bool = True) -> Dict:
        try:
            start_time, end_time, agg_window = self._parse_time_range(time_range)
            metrics_str = ' or '.join([f'r._field == "{m}"' for m in metrics])

            flux_query = f'''
                from(bucket: "{self.bucket}")
                    |> range(start: {int(start_time.timestamp())}, stop: {int(end_time.timestamp())})
                    |> filter(fn: (r) => r._measurement == "device_metrics")
                    |> filter(fn: (r) => r.device_id == "{device_id}")
                    |> filter(fn: (r) => {metrics_str})
                    |> aggregateWindow(every: {agg_window}, fn: mean, createEmpty: false)
                    |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
                    |> keep(columns: ["_time"] + {metrics})
                    |> sort(columns: ["_time"])
                    |> limit(n: {Config.MAX_QUERY_POINTS})
            '''

            df = self.influxdb.query_data(flux_query)

            if df.empty:
                return {'success': False, 'message': 'No data found'}

            if downsample:
                df, ratio = self._adaptive_downsample(df)
            else:
                ratio = 1

            df['_time'] = pd.to_datetime(df['_time'])
            timestamps = df['_time'].dt.strftime('%Y-%m-%d %H:%M:%S').tolist()

            series = []
            for metric in metrics:
                if metric in df.columns:
                    series.append({
                        'name': metric,
                        'type': 'line',
                        'data': df[metric].round(2).tolist(),
                        'smooth': True,
                        'showSymbol': False
                    })

            return {
                'success': True,
                'timestamps': timestamps,
                'series': series,
                'device_id': device_id,
                'total_points': len(df),
                'original_points': len(df) * max(1, ratio),
                'downsample_ratio': ratio,
                'aggregation': agg_window
            }

        except Exception as e:
            logger.error(f"Error getting device timeseries: {e}")
            return {'success': False, 'message': str(e)}

    def get_incremental_timeseries(self, device_id: str, metrics: List[str],
                                    last_timestamp: str,
                                    time_range: str = '24h') -> Dict:
        try:
            last_time = datetime.fromisoformat(last_timestamp) if last_timestamp else None
            if not last_time:
                return self.get_device_timeseries(device_id, metrics, time_range)

            end_time = datetime.now()
            if (end_time - last_time).total_seconds() < 5:
                return {
                    'success': True,
                    'timestamps': [],
                    'series': [],
                    'incremental': True,
                    'new_points': 0
                }

            metrics_str = ' or '.join([f'r._field == "{m}"' for m in metrics])

            flux_query = f'''
                from(bucket: "{self.bucket}")
                    |> range(start: {int(last_time.timestamp()) + 1}, stop: {int(end_time.timestamp())})
                    |> filter(fn: (r) => r._measurement == "device_metrics")
                    |> filter(fn: (r) => r.device_id == "{device_id}")
                    |> filter(fn: (r) => {metrics_str})
                    |> aggregateWindow(every: 10s, fn: mean, createEmpty: false)
                    |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
                    |> keep(columns: ["_time"] + {metrics})
                    |> sort(columns: ["_time"])
                    |> limit(n: 500)
            '''

            df = self.influxdb.query_data(flux_query)

            if df.empty:
                return {
                    'success': True,
                    'timestamps': [],
                    'series': [],
                    'incremental': True,
                    'new_points': 0
                }

            df['_time'] = pd.to_datetime(df['_time'])
            timestamps = df['_time'].dt.strftime('%Y-%m-%d %H:%M:%S').tolist()

            series = []
            for metric in metrics:
                if metric in df.columns:
                    series.append({
                        'name': metric,
                        'type': 'line',
                        'data': df[metric].round(2).tolist(),
                        'smooth': True,
                        'showSymbol': False
                    })

            return {
                'success': True,
                'timestamps': timestamps,
                'series': series,
                'device_id': device_id,
                'total_points': len(df),
                'incremental': True,
                'new_points': len(df)
            }

        except Exception as e:
            logger.error(f"Error getting incremental timeseries: {e}")
            return {'success': False, 'message': str(e)}

    def get_group_timeseries(self, group_id: str, metrics: List[str],
                              time_range: str = '24h',
                              aggregate_window: str = '1m') -> Dict:
        try:
            start_time, end_time, agg = self._parse_time_range(time_range)
            metrics_str = ' or '.join([f'r._field == "{m}"' for m in metrics])

            flux_query = f'''
                from(bucket: "{self.bucket}")
                    |> range(start: {int(start_time.timestamp())}, stop: {int(end_time.timestamp())})
                    |> filter(fn: (r) => r._measurement == "device_metrics")
                    |> filter(fn: (r) => r.group_id == "{group_id}")
                    |> filter(fn: (r) => {metrics_str})
                    |> aggregateWindow(every: {aggregate_window}, fn: mean, createEmpty: false)
                    |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
                    |> keep(columns: ["_time"] + {metrics})
                    |> sort(columns: ["_time"])
                    |> limit(n: {Config.MAX_QUERY_POINTS})
            '''

            df = self.influxdb.query_data(flux_query)

            if df.empty:
                return {'success': False, 'message': 'No data found'}

            df, ratio = self._adaptive_downsample(df)
            df['_time'] = pd.to_datetime(df['_time'])
            timestamps = df['_time'].dt.strftime('%Y-%m-%d %H:%M:%S').tolist()

            series = []
            for metric in metrics:
                if metric in df.columns:
                    series.append({
                        'name': metric,
                        'type': 'line',
                        'data': df[metric].round(2).tolist(),
                        'smooth': True,
                        'showSymbol': False
                    })

            return {
                'success': True,
                'timestamps': timestamps,
                'series': series,
                'group_id': group_id,
                'total_points': len(df),
                'downsample_ratio': ratio
            }

        except Exception as e:
            logger.error(f"Error getting group timeseries: {e}")
            return {'success': False, 'message': str(e)}

    def get_heatmap_data(self, device_ids: List[str], metric: str,
                         time_range: str = '24h',
                         resolution: str = '1h') -> Dict:
        try:
            start_time, end_time, _ = self._parse_time_range(time_range)

            flux_query = f'''
                from(bucket: "{self.bucket}")
                    |> range(start: {int(start_time.timestamp())}, stop: {int(end_time.timestamp())})
                    |> filter(fn: (r) => r._measurement == "device_metrics")
                    |> filter(fn: (r) => r._field == "{metric}")
                    |> aggregateWindow(every: {resolution}, fn: mean, createEmpty: false)
                    |> keep(columns: ["_time", "_value", "device_id"])
                    |> sort(columns: ["_time"])
            '''

            df = self.influxdb.query_data(flux_query)

            if df.empty:
                return {'success': False, 'message': 'No data found'}

            df['_time'] = pd.to_datetime(df['_time'])
            time_buckets = df['_time'].dt.floor(resolution).unique()
            time_buckets = sorted(time_buckets)

            heatmap_data = []
            device_index = {device_id: idx for idx, device_id in enumerate(device_ids)}

            for device_id in device_ids:
                device_data = df[df['device_id'] == device_id]
                if device_data.empty:
                    continue

                device_data = device_data.set_index('_time')
                device_data_resampled = device_data['_value'].resample(resolution).mean()

                for time_bucket in time_buckets:
                    if time_bucket in device_data_resampled.index:
                        val = device_data_resampled.loc[time_bucket]
                        if pd.notna(val):
                            heatmap_data.append([
                                time_buckets.index(time_bucket),
                                device_index[device_id],
                                round(float(val), 2)
                            ])

            return {
                'success': True,
                'x_axis': [t.strftime('%Y-%m-%d %H:00') for t in time_buckets],
                'y_axis': device_ids,
                'data': heatmap_data,
                'metric': metric,
                'total_points': len(heatmap_data)
            }

        except Exception as e:
            logger.error(f"Error getting heatmap data: {e}")
            return {'success': False, 'message': str(e)}

    def get_device_statistics(self, device_id: str, metrics: List[str],
                               time_range: str = '24h') -> Dict:
        try:
            start_time, end_time, _ = self._parse_time_range(time_range)
            metrics_str = ' or '.join([f'r._field == "{m}"' for m in metrics])

            window_map = {
                '1h': timedelta(minutes=30),
                '6h': timedelta(hours=3),
                '12h': timedelta(hours=6),
                '24h': timedelta(hours=12),
                '7d': timedelta(days=3),
                '30d': timedelta(days=7)
            }
            recent_window = window_map.get(time_range, timedelta(hours=12))
            recent_start = end_time - recent_window

            flux_query = f'''
                from(bucket: "{self.bucket}")
                    |> range(start: {int(start_time.timestamp())}, stop: {int(end_time.timestamp())})
                    |> filter(fn: (r) => r._measurement == "device_metrics")
                    |> filter(fn: (r) => r.device_id == "{device_id}")
                    |> filter(fn: (r) => {metrics_str})
                    |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
                    |> keep(columns: ["_time"] + {metrics})
                    |> sort(columns: ["_time"])
            '''

            df = self.influxdb.query_data(flux_query)

            if df.empty:
                return {'success': False, 'message': 'No data found'}

            stats = {}
            for metric in metrics:
                if metric in df.columns:
                    series_data = df[metric].dropna()
                    if not series_data.empty:
                        recent_data = df[df['_time'] >= pd.Timestamp(recent_start, tz='UTC')][metric].dropna() if '_time' in df.columns else series_data
                        stats[metric] = {
                            'min': round(float(series_data.min()), 2),
                            'max': round(float(series_data.max()), 2),
                            'avg': round(float(series_data.mean()), 2),
                            'std': round(float(series_data.std()), 2),
                            'median': round(float(series_data.median()), 2),
                            'p95': round(float(series_data.quantile(0.95)), 2),
                            'p99': round(float(series_data.quantile(0.99)), 2),
                            'latest': round(float(series_data.iloc[-1]), 2),
                            'count': int(len(series_data)),
                            'recent_avg': round(float(recent_data.mean()), 2) if len(recent_data) > 0 else round(float(series_data.mean()), 2)
                        }

            return {
                'success': True,
                'device_id': device_id,
                'statistics': stats,
                'time_range': time_range
            }

        except Exception as e:
            logger.error(f"Error getting device statistics: {e}")
            return {'success': False, 'message': str(e)}

data_query_service = DataQueryService()

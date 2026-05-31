import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Tuple
import logging
from config import Config

logger = logging.getLogger(__name__)

class SimulationService:
    def __init__(self):
        self.metric_configs = Config.METRIC_CONFIGS
        self.time_ranges = {
            '1h': timedelta(hours=1),
            '6h': timedelta(hours=6),
            '12h': timedelta(hours=12),
            '24h': timedelta(hours=24),
            '7d': timedelta(days=7),
            '30d': timedelta(days=30)
        }

    def _parse_time_range(self, time_range: str) -> Tuple[datetime, datetime, int]:
        duration = self.time_ranges.get(time_range, timedelta(hours=24))
        end_time = datetime.now()
        start_time = end_time - duration
        total_seconds = duration.total_seconds()
        if total_seconds <= 3600:
            interval = 10
        elif total_seconds <= 21600:
            interval = 30
        elif total_seconds <= 86400:
            interval = 60
        else:
            interval = 300
        total_points = min(1000, max(50, int(total_seconds / interval)))
        return start_time, end_time, total_points

    def _generate_metric_values(self, metric: str, num_points: int,
                                 has_anomaly: bool = False) -> np.ndarray:
        config = self.metric_configs.get(metric, {'base': 50, 'std': 10, 'min': 0, 'max': 100})
        base = config['base']
        std = config['std']
        min_val = config['min']
        max_val = config['max']

        noise = np.random.normal(0, std * 0.3, num_points)
        trend = np.linspace(0, std * 0.3, num_points)
        seasonal = np.sin(np.linspace(0, 4 * np.pi, num_points)) * std * 0.15
        values = base + noise + trend + seasonal

        if has_anomaly and num_points > 20:
            anomaly_count = max(1, int(num_points * 0.02))
            anomaly_indices = np.random.choice(range(num_points), size=anomaly_count, replace=False)
            for idx in anomaly_indices:
                direction = np.random.choice([-1, 1])
                values[idx] = base + direction * (max_val - min_val) * 0.5

        values = np.clip(values, min_val, max_val)
        return np.round(values, 2)

    def generate_device_timeseries(self, device_id: str, metrics: List[str],
                                    time_range: str = '24h',
                                    with_anomalies: bool = False) -> Dict:
        try:
            start_time, end_time, total_points = self._parse_time_range(time_range)
            timestamps = pd.date_range(start=start_time, end=end_time, periods=total_points)

            series = []
            for metric in metrics:
                values = self._generate_metric_values(metric, total_points, has_anomaly=with_anomalies)
                series.append({
                    'name': metric,
                    'type': 'line',
                    'data': values.tolist(),
                    'smooth': True
                })

            return {
                'success': True,
                'timestamps': [t.strftime('%Y-%m-%d %H:%M:%S') for t in timestamps],
                'series': series,
                'device_id': device_id,
                'total_points': total_points,
                'time_range': time_range,
                'data_source': 'simulation'
            }
        except Exception as e:
            logger.error(f"Error generating simulated timeseries: {e}")
            return self._empty_timeseries(device_id)

    def generate_statistics(self, device_id: str, metrics: List[str],
                            time_range: str = '24h') -> Dict:
        try:
            statistics = {}
            for metric in metrics:
                config = self.metric_configs.get(metric)
                if not config:
                    continue
                mean_val = config['base'] + np.random.normal(0, config['std'] * 0.1)
                std_val = config['std']
                min_val = config['min'] + np.random.uniform(0, config['std'] * 0.5)
                max_val = config['max'] - np.random.uniform(0, config['std'] * 0.5)
                latest_val = mean_val + np.random.normal(0, std_val * 0.2)
                median_val = mean_val + np.random.normal(0, std_val * 0.05)

                statistics[metric] = {
                    'min': round(min_val, 2),
                    'max': round(max_val, 2),
                    'avg': round(mean_val, 2),
                    'std': round(std_val, 2),
                    'latest': round(latest_val, 2),
                    'median': round(median_val, 2),
                    'p95': round(mean_val + std_val * 1.645, 2),
                    'p99': round(mean_val + std_val * 2.326, 2),
                    'count': self._parse_time_range(time_range)[2]
                }

            return {
                'success': True,
                'device_id': device_id,
                'statistics': statistics,
                'time_range': time_range,
                'data_source': 'simulation'
            }
        except Exception as e:
            logger.error(f"Error generating simulated statistics: {e}")
            return {'success': False, 'message': str(e), 'statistics': {}}

    def generate_heatmap_data(self, device_ids: List[str], metric: str,
                               time_range: str = '24h',
                               resolution: str = '1h') -> Dict:
        try:
            hour_map = {'1h': 1, '6h': 6, '12h': 12, '24h': 24, '7d': 168, '30d': 720}
            num_buckets = hour_map.get(time_range, 24)

            config = self.metric_configs.get(metric, {'base': 50, 'std': 10, 'min': 0, 'max': 100})
            base = config['base']
            std = config['std']

            heatmap_data = []
            for y_idx, device_id in enumerate(device_ids):
                device_base = base + np.random.uniform(-std * 0.5, std * 0.5)
                for x_idx in range(num_buckets):
                    hour_factor = np.sin(x_idx / max(num_buckets, 1) * 2 * np.pi) * std * 0.3
                    value = device_base + np.random.normal(0, std * 0.4) + hour_factor
                    value = np.clip(value, config['min'], config['max'])
                    heatmap_data.append([x_idx, y_idx, round(value, 2)])

            end_time = datetime.now()
            x_axis = []
            for i in range(num_buckets):
                bucket_time = end_time - timedelta(hours=num_buckets - i - 1)
                x_axis.append(bucket_time.strftime('%Y-%m-%d %H:00'))

            return {
                'success': True,
                'x_axis': x_axis,
                'y_axis': device_ids,
                'data': heatmap_data,
                'metric': metric,
                'visual_min': config.get('min', 0),
                'visual_max': config.get('max', 100),
                'data_source': 'simulation'
            }
        except Exception as e:
            logger.error(f"Error generating simulated heatmap: {e}")
            return {'success': False, 'message': str(e), 'data': [], 'x_axis': [], 'y_axis': []}

    def _empty_timeseries(self, device_id: str) -> Dict:
        return {
            'success': True,
            'timestamps': [],
            'series': [],
            'device_id': device_id,
            'total_points': 0,
            'data_source': 'simulation',
            'message': 'Empty simulation data'
        }

simulation_service = SimulationService()

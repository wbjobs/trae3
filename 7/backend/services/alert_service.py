import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List, Dict, Optional
from datetime import datetime, timedelta
import logging
from config import Config

logger = logging.getLogger(__name__)

METRIC_CONFIGS = Config.METRIC_CONFIGS

class AlertService:
    def __init__(self):
        self.active_alerts = []
        self.alert_history = []

    def detect_anomalies(self, data: Dict, metrics: List[str]) -> Dict:
        alerts = []
        warning_points = {}

        if not data or not data.get('success') or not data.get('series'):
            return {'alerts': [], 'warning_points': {}}

        timestamps = data.get('timestamps', [])
        series_list = data.get('series', [])

        for series in series_list:
            metric = series.get('name')
            if metric not in metrics or metric not in METRIC_CONFIGS:
                continue

            values = series.get('data', [])
            config = METRIC_CONFIGS[metric]
            warn_high = config.get('warn_high', config['max'] * 0.85)
            warn_low = config.get('warn_low', config['min'] * 1.1)
            max_val = config['max']
            min_val = config['min']

            point_indices = []
            point_reasons = []

            for i, val in enumerate(values):
                if val is None or (isinstance(val, float) and (val != val)):
                    continue

                if val >= max_val or val <= min_val:
                    point_indices.append(i)
                    point_reasons.append('over_range' if val > max_val else 'under_range')
                    ts = timestamps[i] if i < len(timestamps) else ''
                    alerts.append({
                        'level': 'danger',
                        'metric': metric,
                        'value': val,
                        'threshold': max_val if val > max_val else min_val,
                        'timestamp': ts,
                        'message': f"{metric}={val} 超出物理量程 [{min_val}, {max_val}]",
                        'type': 'physical_range'
                    })

                elif val >= warn_high:
                    point_indices.append(i)
                    point_reasons.append('high_warning')
                    ts = timestamps[i] if i < len(timestamps) else ''
                    alerts.append({
                        'level': 'warning',
                        'metric': metric,
                        'value': val,
                        'threshold': warn_high,
                        'timestamp': ts,
                        'message': f"{metric}={val} 超过预警阈值 {warn_high}",
                        'type': 'high_warning'
                    })

                elif val <= warn_low:
                    point_indices.append(i)
                    point_reasons.append('low_warning')
                    ts = timestamps[i] if i < len(timestamps) else ''
                    alerts.append({
                        'level': 'warning',
                        'metric': metric,
                        'value': val,
                        'threshold': warn_low,
                        'timestamp': ts,
                        'message': f"{metric}={val} 低于预警阈值 {warn_low}",
                        'type': 'low_warning'
                    })

            if point_indices:
                warning_points[metric] = {
                    'indices': point_indices,
                    'reasons': point_reasons,
                    'itemStyle': {
                        'color': '#ef4444',
                        'borderColor': '#ef4444',
                        'borderWidth': 2
                    }
                }

        alerts.sort(key=lambda x: {'danger': 0, 'warning': 1}.get(x['level'], 2))
        return {'alerts': alerts, 'warning_points': warning_points}

    def detect_statistics_alerts(self, statistics: Dict) -> List[Dict]:
        alerts = []
        stats = statistics.get('statistics', {})

        for metric, metric_stats in stats.items():
            if metric not in METRIC_CONFIGS:
                continue

            config = METRIC_CONFIGS[metric]
            avg = metric_stats.get('avg', 0)
            latest = metric_stats.get('latest', 0)
            std = metric_stats.get('std', 0)
            max_val = metric_stats.get('max', 0)
            p95 = metric_stats.get('p95', 0)
            warn_high = config.get('warn_high', config['max'] * 0.85)
            warn_low = config.get('warn_low', config['min'] * 1.1)

            if latest > warn_high:
                alerts.append({
                    'level': 'warning',
                    'metric': metric,
                    'type': 'latest_high',
                    'message': f"{metric} 当前值 {latest} 超过预警阈值"
                })
            elif latest < warn_low:
                alerts.append({
                    'level': 'warning',
                    'metric': metric,
                    'type': 'latest_low',
                    'message': f"{metric} 当前值 {latest} 低于预警阈值"
                })

            if std > config.get('std', 0) * 2.5:
                alerts.append({
                    'level': 'warning',
                    'metric': metric,
                    'type': 'high_volatility',
                    'message': f"{metric} 波动异常（标准差={std}），设备可能不稳定"
                })

            if avg > 0 and p95 > avg * 1.8:
                alerts.append({
                    'level': 'warning',
                    'metric': metric,
                    'type': 'spike_detected',
                    'message': f"{metric} P95={p95} 远高于均值={avg}，存在间歇性尖峰"
                })

            if max_val > config['max']:
                alerts.append({
                    'level': 'danger',
                    'metric': metric,
                    'type': 'over_physical_range',
                    'message': f"{metric} 最大值 {max_val} 超出物理量程"
                })

        alerts.sort(key=lambda x: {'danger': 0, 'warning': 1}.get(x['level'], 2))
        return alerts

    def get_alert_summary(self, device_id: str, alerts: List[Dict]) -> Dict:
        danger_count = sum(1 for a in alerts if a['level'] == 'danger')
        warning_count = sum(1 for a in alerts if a['level'] == 'warning')

        if danger_count > 0:
            status = 'critical'
            status_text = '严重'
            status_color = '#ef4444'
        elif warning_count > 0:
            status = 'warning'
            status_text = '警告'
            status_color = '#f59e0b'
        else:
            status = 'normal'
            status_text = '正常'
            status_color = '#10b981'

        return {
            'device_id': device_id,
            'status': status,
            'status_text': status_text,
            'status_color': status_color,
            'danger_count': danger_count,
            'warning_count': warning_count,
            'total_count': len(alerts)
        }

alert_service = AlertService()

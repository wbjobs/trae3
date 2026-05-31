import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List, Dict, Optional
import pandas as pd
import numpy as np
import logging
import gzip
import json

from db.influxdb_manager import influxdb_manager
from services.simulation_service import simulation_service
from services.cache_service import cache_service
from services.alert_service import alert_service
from modules.data_cleaning import data_cleaning_service
from config import Config

logger = logging.getLogger(__name__)

class DataService:
    def __init__(self):
        self.use_simulation = Config.USE_SIMULATION
        self.influxdb = influxdb_manager
        self.simulation = simulation_service
        self.cleaning = data_cleaning_service
        self.cache = cache_service
        self.alert = alert_service

    def _should_use_simulation(self) -> bool:
        if self.use_simulation:
            return True
        return not self.influxdb.is_connected

    def _compress_data(self, data: Dict) -> Dict:
        try:
            import json as _json
            import base64
            json_str = _json.dumps(data)
            compressed = gzip.compress(json_str.encode('utf-8'), compresslevel=6)
            encoded = base64.b64encode(compressed).decode('ascii')
            data_size = len(json_str)
            compressed_size = len(encoded)
            if compressed_size < data_size * 0.7:
                return {
                    '_compressed': True,
                    '_data': encoded,
                    '_original_size': data_size,
                    '_compressed_size': compressed_size,
                    '_ratio': round(data_size / compressed_size, 2)
                }
        except Exception as e:
            logger.debug(f"Compression skipped: {e}")
        return data

    def get_device_timeseries(self, device_id: str, metrics: List[str],
                               time_range: str = '24h',
                               downsample: bool = True,
                               apply_cleaning: bool = True,
                               enable_alerts: bool = True,
                               compress: bool = False) -> Dict:
        try:
            use_sim = self._should_use_simulation()

            if not use_sim:
                from modules.data_query import data_query_service
                def fetch_influxdb(*a, **kw):
                    return data_query_service.get_device_timeseries(
                        device_id=device_id, metrics=metrics,
                        time_range=time_range, downsample=downsample
                    )
                result, from_cache = self.cache.get_timeseries(
                    fetch_influxdb, device_id, ','.join(metrics),
                    time_range=time_range, downsample=downsample
                )
                if result.get('success') and result.get('series'):
                    result['from_cache'] = from_cache
                    if apply_cleaning:
                        result = self._clean_timeseries_result(result, metrics)
                    if enable_alerts:
                        alert_result = self.alert.detect_anomalies(result, metrics)
                        result['alerts'] = alert_result['alerts']
                        result['warning_points'] = alert_result['warning_points']
                        for s in result.get('series', []):
                            if s.get('name') in result.get('warning_points', {}):
                                s['markPoint'] = {
                                    'data': [{'coord': [idx, s['data'][idx]], 'value': s['data'][idx]}
                                              for idx in result['warning_points'][s['name']]['indices']],
                                    'itemStyle': result['warning_points'][s['name']]['itemStyle']
                                }
                    result['data_source'] = 'influxdb'
                    if compress:
                        result = self._compress_data(result)
                    return result
                logger.warning(f"InfluxDB empty for {device_id}, falling back to simulation")

            def fetch_simulation(*a, **kw):
                return self.simulation.generate_device_timeseries(
                    device_id=device_id, metrics=metrics, time_range=time_range
                )
            result, from_cache = self.cache.get_timeseries(
                fetch_simulation, device_id, ','.join(metrics),
                time_range=time_range, simulation=True
            )

            if apply_cleaning and result.get('success') and result.get('series'):
                result = self._clean_timeseries_result(result, metrics)
            if enable_alerts and result.get('success'):
                alert_result = self.alert.detect_anomalies(result, metrics)
                result['alerts'] = alert_result['alerts']
                result['warning_points'] = alert_result['warning_points']
                for s in result.get('series', []):
                    if s.get('name') in result.get('warning_points', {}):
                        wp = result['warning_points'][s['name']]
                        s['markPoint'] = {
                            'data': [{'coord': [idx, s['data'][idx]], 'value': s['data'][idx]}
                                      for idx in wp['indices']],
                            'itemStyle': wp['itemStyle'],
                            'symbol': 'pin',
                            'symbolSize': 10
                        }

            result['from_cache'] = from_cache
            result['data_source'] = 'simulation'
            if compress:
                result = self._compress_data(result)
            return result
        except Exception as e:
            logger.error(f"Error in get_device_timeseries: {e}")
            return self._empty_timeseries(device_id)

    def get_incremental_timeseries(self, device_id: str, metrics: List[str],
                                    last_timestamp: str,
                                    time_range: str = '24h',
                                    enable_alerts: bool = True) -> Dict:
        try:
            if self._should_use_simulation():
                result = self.simulation.generate_device_timeseries(
                    device_id=device_id, metrics=metrics,
                    time_range=time_range, with_anomalies=True
                )
                if result.get('success') and result.get('timestamps'):
                    num_incremental = min(10, len(result['timestamps']))
                    result['timestamps'] = result['timestamps'][-num_incremental:]
                    for s in result.get('series', []):
                        s['data'] = s['data'][-num_incremental:]
                    result['incremental'] = True
                    result['new_points'] = num_incremental
            else:
                from modules.data_query import data_query_service
                result = data_query_service.get_incremental_timeseries(
                    device_id=device_id, metrics=metrics,
                    last_timestamp=last_timestamp, time_range=time_range
                )

            if enable_alerts and result.get('success') and result.get('new_points', 0) > 0:
                alert_result = self.alert.detect_anomalies(result, metrics)
                result['alerts'] = alert_result['alerts']

            return result
        except Exception as e:
            logger.error(f"Error in get_incremental_timeseries: {e}")
            return {'success': True, 'timestamps': [], 'series': [], 'incremental': True, 'new_points': 0}

    def get_statistics(self, device_id: str, metrics: List[str],
                        time_range: str = '24h',
                        enable_alerts: bool = True) -> Dict:
        try:
            use_sim = self._should_use_simulation()

            if not use_sim:
                from modules.data_query import data_query_service
                def fetch_influxdb(*a, **kw):
                    return data_query_service.get_device_statistics(
                        device_id=device_id, metrics=metrics, time_range=time_range
                    )
                result, from_cache = self.cache.get_statistics(
                    fetch_influxdb, device_id, ','.join(metrics), time_range=time_range
                )
                if result.get('success') and result.get('statistics'):
                    result = self._enhance_statistics(result)
                    if enable_alerts:
                        stat_alerts = self.alert.detect_statistics_alerts(result)
                        result['alerts'] = stat_alerts
                        result['alert_summary'] = self.alert.get_alert_summary(device_id, stat_alerts)
                    result['from_cache'] = from_cache
                    result['data_source'] = 'influxdb'
                    return result
                logger.warning(f"InfluxDB statistics empty for {device_id}")

            def fetch_simulation(*a, **kw):
                return self.simulation.generate_statistics(
                    device_id=device_id, metrics=metrics, time_range=time_range
                )
            result, from_cache = self.cache.get_statistics(
                fetch_simulation, device_id, ','.join(metrics), time_range=time_range
            )

            if enable_alerts and result.get('success'):
                stat_alerts = self.alert.detect_statistics_alerts(result)
                result['alerts'] = stat_alerts
                result['alert_summary'] = self.alert.get_alert_summary(device_id, stat_alerts)

            result['from_cache'] = from_cache
            return result
        except Exception as e:
            logger.error(f"Error in get_statistics: {e}")
            return {'success': True, 'device_id': device_id, 'statistics': {}, 'time_range': time_range}

    def get_heatmap_data(self, device_ids: List[str], metric: str,
                          time_range: str = '24h',
                          resolution: str = '1h',
                          compress: bool = False) -> Dict:
        try:
            use_sim = self._should_use_simulation()

            if not use_sim:
                from modules.data_query import data_query_service
                def fetch_influxdb(*a, **kw):
                    return data_query_service.get_heatmap_data(
                        device_ids=device_ids, metric=metric,
                        time_range=time_range, resolution=resolution
                    )
                result, from_cache = self.cache.get_heatmap(
                    fetch_influxdb, ','.join(device_ids), metric,
                    time_range=time_range, resolution=resolution
                )
                if result.get('success') and result.get('data'):
                    config = Config.METRIC_CONFIGS.get(metric, {})
                    result['visual_min'] = config.get('min', 0)
                    result['visual_max'] = config.get('max', 100)
                    result['from_cache'] = from_cache
                    result['data_source'] = 'influxdb'
                    if compress:
                        result = self._compress_data(result)
                    return result
                logger.warning("InfluxDB heatmap data empty")

            def fetch_simulation(*a, **kw):
                return self.simulation.generate_heatmap_data(
                    device_ids=device_ids, metric=metric,
                    time_range=time_range, resolution=resolution
                )
            result, from_cache = self.cache.get_heatmap(
                fetch_simulation, ','.join(device_ids), metric,
                time_range=time_range, resolution=resolution
            )

            result['from_cache'] = from_cache
            if compress:
                result = self._compress_data(result)
            return result
        except Exception as e:
            logger.error(f"Error in get_heatmap_data: {e}")
            return {'success': True, 'x_axis': [], 'y_axis': [], 'data': [], 'metric': metric, 'visual_min': 0, 'visual_max': 100}

    def get_group_timeseries(self, group_id: str, metrics: List[str],
                              time_range: str = '24h',
                              aggregate_window: str = '1m') -> Dict:
        try:
            use_sim = self._should_use_simulation()

            if not use_sim:
                from modules.data_query import data_query_service
                result = data_query_service.get_group_timeseries(
                    group_id=group_id, metrics=metrics,
                    time_range=time_range, aggregate_window=aggregate_window
                )
                if result.get('success') and result.get('series'):
                    result['data_source'] = 'influxdb'
                    return result

            return self.simulation.generate_device_timeseries(
                device_id=group_id, metrics=metrics, time_range=time_range
            )
        except Exception as e:
            logger.error(f"Error in get_group_timeseries: {e}")
            return self._empty_timeseries(group_id)

    def get_cache_stats(self) -> Dict:
        return self.cache.stats

    def invalidate_cache(self, cache_type: str = None) -> Dict:
        if cache_type == 'timeseries':
            cleared = self.cache.invalidate_timeseries()
        elif cache_type == 'all':
            self.cache.invalidate_all()
            cleared = -1
        else:
            cleared = self.cache.invalidate_timeseries()
        return {'success': True, 'cleared_entries': cleared}

    def _clean_timeseries_result(self, result: Dict, metrics: List[str]) -> Dict:
        try:
            timestamps = pd.to_datetime(result.get('timestamps', []))
            if len(timestamps) == 0:
                return result
            data = {'_time': timestamps}
            for s in result.get('series', []):
                data[s['name']] = s['data']
            df = pd.DataFrame(data)
            if df.empty:
                return result
            df = self.cleaning.remove_outliers_iqr(df, metrics, threshold=2.0)
            df = self.cleaning.handle_missing_values(df, metrics, method='linear')
            df = self.cleaning.smooth_data(df, metrics, window_size=3, method='ewm')
            for s in result.get('series', []):
                if s['name'] in df.columns:
                    s['data'] = df[s['name']].ffill().bfill().fillna(0).round(2).tolist()
                    s['cleaned'] = True
            result['cleaning_applied'] = True
            return result
        except Exception as e:
            logger.warning(f"Data cleaning failed: {e}")
            return result

    def _enhance_statistics(self, result: Dict) -> Dict:
        stats = result.get('statistics', {})
        for metric in stats:
            m = stats[metric]
            if 'median' not in m:
                m['median'] = m.get('avg', 0)
            if 'p95' not in m:
                m['p95'] = round(m.get('avg', 0) + m.get('std', 0) * 1.645, 2)
            if 'p99' not in m:
                m['p99'] = round(m.get('avg', 0) + m.get('std', 0) * 2.326, 2)
        return result

    def _empty_timeseries(self, id: str) -> Dict:
        return {
            'success': True, 'timestamps': [], 'series': [],
            'device_id': id, 'total_points': 0,
            'data_source': 'fallback', 'message': 'No data available'
        }

data_service = DataService()

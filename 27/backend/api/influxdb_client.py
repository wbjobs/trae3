"""
InfluxDB客户端封装 - 深度优化版
- 查询结果缓存（TTL过期机制）
- 智能降采样（自动根据时间范围选择聚合粒度）
- 分页查询支持
- Flux查询优化（limit裁剪、pivot展开）
"""
import os
import time
import hashlib
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import pandas as pd
import numpy as np
from django.conf import settings

try:
    from influxdb_client import InfluxDBClient, Point, WriteOptions
    from influxdb_client.client.write_api import SYNCHRONOUS
    INFLUXDB_AVAILABLE = True
except ImportError:
    INFLUXDB_AVAILABLE = False


class QueryCache:
    """查询结果缓存"""

    def __init__(self, max_size=200, default_ttl=60):
        self._cache = {}
        self._max_size = max_size
        self._default_ttl = default_ttl

    def _make_key(self, prefix: str, **kwargs) -> str:
        parts = [prefix]
        for k, v in sorted(kwargs.items()):
            if v is not None:
                parts.append(f"{k}={v}")
        raw = "|".join(parts)
        return hashlib.md5(raw.encode()).hexdigest()[:16]

    def get(self, key: str):
        entry = self._cache.get(key)
        if entry is None:
            return None
        if time.time() > entry['expire']:
            del self._cache[key]
            return None
        return entry['data']

    def set(self, key: str, data, ttl=None):
        if len(self._cache) >= self._max_size:
            oldest_key = min(self._cache, key=lambda k: self._cache[k]['expire'])
            del self._cache[oldest_key]
        self._cache[key] = {
            'data': data,
            'expire': time.time() + (ttl or self._default_ttl)
        }

    def invalidate(self, prefix: str = None):
        if prefix is None:
            self._cache.clear()
        else:
            keys_to_del = [k for k in self._cache if k.startswith(prefix)]
            for k in keys_to_del:
                del self._cache[k]

    def stats(self) -> Dict:
        return {
            'size': len(self._cache),
            'max_size': self._max_size,
            'hit_rate': getattr(self, '_hits', 0) / max(getattr(self, '_total', 1), 1)
        }


class DownsamplingStrategy:
    """智能降采样策略"""

    STRATEGIES = [
        (timedelta(hours=6),   '5m',  72),
        (timedelta(hours=24),  '15m', 96),
        (timedelta(days=3),    '1h',  72),
        (timedelta(days=7),    '1h',  168),
        (timedelta(days=30),   '6h',  120),
        (timedelta(days=90),   '1d',  90),
    ]

    @classmethod
    def get_aggregation(cls, start_time: datetime, end_time: datetime,
                        requested_agg: Optional[str] = None) -> Tuple[str, int]:
        if requested_agg and requested_agg not in ('auto',):
            limit_map = {
                '5m': 288, '15m': 96, '1h': 168,
                '6h': 120, '1d': 90
            }
            return requested_agg, limit_map.get(requested_agg, 500)

        delta = end_time - start_time
        for threshold, agg, limit in cls.STRATEGIES:
            if delta <= threshold:
                return agg, limit

        return '1d', 90


class PipelineInfluxDBClient:
    """管网时序数据库客户端 - 深度优化版"""

    def __init__(self):
        self.url = settings.INFLUXDB['URL']
        self.token = settings.INFLUXDB['TOKEN']
        self.org = settings.INFLUXDB['ORG']
        self.bucket = settings.INFLUXDB['BUCKET']
        self.timeout = settings.INFLUXDB['TIMEOUT']
        self.client = None
        self.query_api = None
        self.write_api = None
        self.use_mock = True
        self.mock_data = None
        self._cache = QueryCache(max_size=300, default_ttl=60)

        if INFLUXDB_AVAILABLE:
            try:
                self.client = InfluxDBClient(
                    url=self.url,
                    token=self.token,
                    org=self.org,
                    timeout=self.timeout
                )
                self.query_api = self.client.query_api()
                self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
                self.use_mock = False
                print("InfluxDB连接成功")
            except Exception as e:
                print(f"InfluxDB连接失败，使用模拟数据: {e}")
                self._init_mock_data()
        else:
            print("InfluxDB库不可用，使用模拟数据")
            self._init_mock_data()

    def _init_mock_data(self):
        self.mock_data = self._generate_mock_data()

    def _generate_mock_data(self) -> pd.DataFrame:
        zones = ['东城区', '西城区', '南城区', '北城区', '中心区', '工业区', '住宅区A', '住宅区B']
        devices = [f'P{i:03d}' for i in range(1, 51)]

        data = []
        end_time = datetime.now()
        start_time = end_time - timedelta(days=7)

        np.random.seed(42)
        for device in devices:
            zone = zones[hash(device) % len(zones)]
            current_time = start_time
            base_pressure = 0.3 + (hash(device) % 30) / 100
            base_flow = 50 + (hash(device) % 100)

            while current_time <= end_time:
                hour_factor = 1 + 0.3 * np.sin(2 * np.pi * (current_time.hour - 6) / 24)
                noise_p = np.random.normal(0, 0.02)
                noise_f = np.random.normal(0, 5)

                pressure = base_pressure * hour_factor + noise_p
                flow = base_flow * hour_factor + noise_f

                is_fault = 0
                if np.random.random() < 0.001:
                    pressure *= 0.5
                    is_fault = 1

                data.append({
                    'time': current_time,
                    'device_id': device,
                    'zone': zone,
                    'pressure': round(pressure, 3),
                    'flow': round(flow, 2),
                    'is_fault': is_fault
                })

                current_time += timedelta(minutes=15)

        return pd.DataFrame(data)

    def query_pressure_data(self,
                            device_id: Optional[str] = None,
                            zone: Optional[str] = None,
                            start_time: Optional[datetime] = None,
                            end_time: Optional[datetime] = None,
                            aggregation: Optional[str] = None,
                            page: int = 1,
                            page_size: int = 0) -> Dict:
        cache_key = self._cache._make_key(
            'pressure', device_id=device_id, zone=zone,
            start=start_time.isoformat() if start_time else None,
            end=end_time.isoformat() if end_time else None,
            agg=aggregation
        )
        cached = self._cache.get(cache_key)
        if cached is not None:
            return self._apply_pagination(cached, page, page_size)

        if self.use_mock:
            result = self._mock_query('pressure', device_id, zone, start_time, end_time, aggregation)
        else:
            try:
                query = self._build_query('pressure', device_id, zone, start_time, end_time, aggregation)
                raw = self.query_api.query(query)
                result = self._parse_result(raw, 'pressure')
            except Exception as e:
                print(f"InfluxDB查询失败，使用模拟数据: {e}")
                self.use_mock = True
                self._init_mock_data()
                result = self._mock_query('pressure', device_id, zone, start_time, end_time, aggregation)

        self._cache.set(cache_key, result, ttl=30 if page > 0 else 60)
        return self._apply_pagination(result, page, page_size)

    def query_flow_data(self,
                        device_id: Optional[str] = None,
                        zone: Optional[str] = None,
                        start_time: Optional[datetime] = None,
                        end_time: Optional[datetime] = None,
                        aggregation: Optional[str] = None,
                        page: int = 1,
                        page_size: int = 0) -> Dict:
        cache_key = self._cache._make_key(
            'flow', device_id=device_id, zone=zone,
            start=start_time.isoformat() if start_time else None,
            end=end_time.isoformat() if end_time else None,
            agg=aggregation
        )
        cached = self._cache.get(cache_key)
        if cached is not None:
            return self._apply_pagination(cached, page, page_size)

        if self.use_mock:
            result = self._mock_query('flow', device_id, zone, start_time, end_time, aggregation)
        else:
            try:
                query = self._build_query('flow', device_id, zone, start_time, end_time, aggregation)
                raw = self.query_api.query(query)
                result = self._parse_result(raw, 'flow')
            except Exception as e:
                print(f"InfluxDB查询失败，使用模拟数据: {e}")
                self.use_mock = True
                self._init_mock_data()
                result = self._mock_query('flow', device_id, zone, start_time, end_time, aggregation)

        self._cache.set(cache_key, result, ttl=30 if page > 0 else 60)
        return self._apply_pagination(result, page, page_size)

    def _build_query(self,
                     measurement: str,
                     device_id: Optional[str],
                     zone: Optional[str],
                     start_time: Optional[datetime],
                     end_time: Optional[datetime],
                     aggregation: Optional[str]) -> str:
        start = start_time.isoformat() if start_time else '-7d'
        end = end_time.isoformat() if end_time else 'now()'

        if aggregation and aggregation != 'auto':
            agg_map = {'5m': '5m', '15m': '15m', '1h': '1h', '6h': '6h', '1d': '1d', 'mean': '1h'}
            window = agg_map.get(aggregation, '1h')
        elif start_time and end_time:
            window, _ = DownsamplingStrategy.get_aggregation(start_time, end_time)
        else:
            window = '1h'

        query = f'''
from(bucket: "{self.bucket}")
  |> range(start: {start}, stop: {end})
  |> filter(fn: (r) => r._measurement == "{measurement}")
'''
        if device_id:
            query += f'  |> filter(fn: (r) => r.device_id == "{device_id}")\n'
        if zone:
            query += f'  |> filter(fn: (r) => r.zone == "{zone}")\n'

        query += f'  |> aggregateWindow(every: {window}, fn: mean, createEmpty: false)\n'
        query += '  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")\n'
        query += '  |> limit(n: 5000)\n'

        return query

    def _mock_query(self,
                    field: str,
                    device_id: Optional[str],
                    zone: Optional[str],
                    start_time: Optional[datetime],
                    end_time: Optional[datetime],
                    aggregation: Optional[str]) -> List[Dict]:
        df = self.mock_data.copy()

        if device_id:
            df = df[df['device_id'] == device_id]
        if zone:
            df = df[df['zone'] == zone]
        if start_time:
            df = df[df['time'] >= start_time]
        if end_time:
            df = df[df['time'] <= end_time]

        if aggregation and aggregation != 'auto' and len(df) > 0:
            df = df.set_index('time')
            agg_freq = {'5m': '5min', '15m': '15min', '1h': 'h', '6h': '6h', '1d': 'D', 'mean': 'h'}.get(aggregation, 'h')
            df = df.resample(agg_freq).agg({
                field: 'mean',
                'device_id': 'first',
                'zone': 'first',
                'is_fault': 'max'
            }).reset_index()
        elif start_time and end_time and len(df) > 0:
            _, limit = DownsamplingStrategy.get_aggregation(start_time, end_time)
            if len(df) > limit * 2:
                step = max(1, len(df) // limit)
                df = df.iloc[::step].reset_index(drop=True)

        result = []
        for _, row in df.iterrows():
            result.append({
                'time': row['time'].isoformat() if hasattr(row['time'], 'isoformat') else str(row['time']),
                'device_id': row['device_id'],
                'zone': row['zone'],
                field: round(float(row[field]), 4) if pd.notna(row[field]) else None,
                'is_fault': int(row['is_fault']) if pd.notna(row['is_fault']) else 0
            })

        return result

    def _parse_result(self, result, measurement: str) -> List[Dict]:
        data = []
        for table in result:
            for record in table.records:
                entry = {
                    'time': record.get_time().isoformat(),
                    'device_id': record.values.get('device_id', ''),
                    'zone': record.values.get('zone', ''),
                    measurement: record.get_value(),
                    'is_fault': record.values.get('is_fault', 0)
                }
                data.append(entry)
        return data

    def _apply_pagination(self, data: List[Dict], page: int, page_size: int) -> Dict:
        total = len(data)
        if page_size <= 0 or page <= 0:
            return {'data': data, 'total': total, 'page': 1, 'page_size': total}

        start = (page - 1) * page_size
        end = start + page_size
        return {
            'data': data[start:end],
            'total': total,
            'page': page,
            'page_size': page_size,
            'has_more': end < total
        }

    def get_zones(self) -> List[str]:
        if self.use_mock:
            return sorted(self.mock_data['zone'].unique().tolist())
        return ['东城区', '西城区', '南城区', '北城区', '中心区', '工业区', '住宅区A', '住宅区B']

    def get_devices(self, zone: Optional[str] = None) -> List[str]:
        if self.use_mock:
            df = self.mock_data
            if zone:
                df = df[df['zone'] == zone]
            return sorted(df['device_id'].unique().tolist())
        return [f'P{i:03d}' for i in range(1, 51)]

    def write_data(self, measurement: str, tags: Dict, fields: Dict, time: Optional[datetime] = None):
        if self.use_mock:
            return False

        point = Point(measurement)
        for k, v in tags.items():
            point = point.tag(k, v)
        for k, v in fields.items():
            point = point.field(k, v)
        if time:
            point = point.time(time)

        try:
            self.write_api.write(bucket=self.bucket, org=self.org, record=point)
            self._cache.invalidate()
            return True
        except Exception as e:
            print(f"写入数据失败: {e}")
            return False

    def get_latest_values(self, device_id: str, fields: List[str] = None) -> Dict:
        """获取设备最新数据点（用于实时刷新）"""
        cache_key = self._cache._make_key('latest', device_id=device_id)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        end_time = datetime.now()
        start_time = end_time - timedelta(minutes=30)

        if self.use_mock:
            df = self.mock_data.copy()
            df = df[df['device_id'] == device_id]
            df = df[df['time'] >= start_time]
            if len(df) == 0:
                result = {'device_id': device_id, 'pressure': None, 'flow': None, 'time': None}
            else:
                last = df.iloc[-1]
                result = {
                    'device_id': device_id,
                    'pressure': float(last['pressure']),
                    'flow': float(last['flow']),
                    'time': last['time'].isoformat(),
                    'is_fault': int(last['is_fault'])
                }
        else:
            result = {'device_id': device_id, 'pressure': None, 'flow': None, 'time': None}

        self._cache.set(cache_key, result, ttl=15)
        return result

    def get_fault_points(self, zone: Optional[str] = None,
                         start_time: Optional[datetime] = None,
                         end_time: Optional[datetime] = None) -> List[Dict]:
        """获取故障数据点（用于故障标记）"""
        cache_key = self._cache._make_key('faults', zone=zone,
                                          start=start_time.isoformat() if start_time else None,
                                          end=end_time.isoformat() if end_time else None)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if self.use_mock:
            df = self.mock_data.copy()
            if zone:
                df = df[df['zone'] == zone]
            if start_time:
                df = df[df['time'] >= start_time]
            if end_time:
                df = df[df['time'] <= end_time]
            df = df[df['is_fault'] == 1]
            result = []
            for _, row in df.iterrows():
                result.append({
                    'time': row['time'].isoformat(),
                    'device_id': row['device_id'],
                    'zone': row['zone'],
                    'pressure': float(row['pressure']),
                    'flow': float(row['flow']),
                    'is_fault': 1
                })
        else:
            result = []

        self._cache.set(cache_key, result, ttl=30)
        return result

    def clear_cache(self):
        self._cache.invalidate()

    def close(self):
        if self.client:
            self.client.close()


influx_client = PipelineInfluxDBClient()

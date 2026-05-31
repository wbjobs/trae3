import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
from config import Config
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class InfluxDBManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
            cls._instance._connected = False
            cls._instance.client = None
            cls._instance.write_api = None
            cls._instance.query_api = None
            cls._instance.bucket = Config.INFLUXDB_BUCKET
            cls._instance.org = Config.INFLUXDB_ORG
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        self.client = None
        self.write_api = None
        self.query_api = None
        self.bucket = Config.INFLUXDB_BUCKET
        self.org = Config.INFLUXDB_ORG
        self._connected = False
        try:
            self.client = InfluxDBClient(
                url=Config.INFLUXDB_URL,
                token=Config.INFLUXDB_TOKEN,
                org=Config.INFLUXDB_ORG
            )
            health = self.client.health()
            if health and health.status == "pass":
                self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
                self.query_api = self.client.query_api()
                self._connected = True
                logger.info("InfluxDB connected successfully")
            else:
                logger.warning(f"InfluxDB health check failed: {health}, running in offline mode")
                self.client = None
        except Exception as e:
            logger.warning(f"InfluxDB unavailable ({e}), running in simulation mode")
            self.client = None

    @property
    def is_connected(self) -> bool:
        return self._connected

    def write_metric(self, measurement: str, tags: Dict, fields: Dict,
                     time: Optional[datetime] = None):
        if not self.client:
            return False
        try:
            point = Point(measurement)
            for key, value in tags.items():
                point = point.tag(key, str(value))
            for key, value in fields.items():
                point = point.field(key, float(value))
            if time:
                point = point.time(time, WritePrecision.NS)
            self.write_api.write(bucket=self.bucket, org=self.org, record=point)
            return True
        except Exception as e:
            logger.error(f"Error writing metric: {e}")
            return False

    def write_batch(self, points: List[Point]):
        if not self.client:
            return False
        try:
            self.write_api.write(bucket=self.bucket, org=self.org, records=points)
            return True
        except Exception as e:
            logger.error(f"Error writing batch: {e}")
            return False

    def query_data(self, flux_query: str) -> pd.DataFrame:
        if not self.client:
            return pd.DataFrame()
        try:
            result = self.query_api.query_data_frame(query=flux_query)
            if isinstance(result, list):
                result = pd.concat(result, ignore_index=True) if result else pd.DataFrame()
            return result
        except Exception as e:
            logger.error(f"Error querying data: {e}")
            return pd.DataFrame()

    def get_device_metrics(self, device_id: str, metrics: List[str],
                           start_time: datetime, end_time: datetime) -> pd.DataFrame:
        metrics_str = ' or '.join([f'r._field == "{m}"' for m in metrics])
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
        return self.query_data(flux_query)

    def get_multiple_devices_metrics(self, device_ids: List[str], metrics: List[str],
                                      start_time: datetime, end_time: datetime) -> pd.DataFrame:
        devices_str = ' or '.join([f'r.device_id == "{d}"' for d in device_ids])
        metrics_str = ' or '.join([f'r._field == "{m}"' for m in metrics])
        flux_query = f'''
            from(bucket: "{self.bucket}")
                |> range(start: {int(start_time.timestamp())}, stop: {int(end_time.timestamp())})
                |> filter(fn: (r) => r._measurement == "device_metrics")
                |> filter(fn: (r) => {devices_str})
                |> filter(fn: (r) => {metrics_str})
                |> keep(columns: ["_time", "_field", "_value", "device_id"])
                |> sort(columns: ["_time"])
        '''
        return self.query_data(flux_query)

    def get_group_metrics(self, group_id: str, metrics: List[str],
                          start_time: datetime, end_time: datetime,
                          aggregate_window: str = "1m") -> pd.DataFrame:
        metrics_str = ' or '.join([f'r._field == "{m}"' for m in metrics])
        flux_query = f'''
            from(bucket: "{self.bucket}")
                |> range(start: {int(start_time.timestamp())}, stop: {int(end_time.timestamp())})
                |> filter(fn: (r) => r._measurement == "device_metrics")
                |> filter(fn: (r) => r.group_id == "{group_id}")
                |> filter(fn: (r) => {metrics_str})
                |> aggregateWindow(every: {aggregate_window}, fn: mean)
                |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
                |> sort(columns: ["_time"])
        '''
        return self.query_data(flux_query)

    def close(self):
        if self.client:
            self.client.close()

influxdb_manager = InfluxDBManager()

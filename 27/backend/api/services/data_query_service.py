"""数据查询服务 - 深度优化版"""
from datetime import datetime, timedelta
from typing import Optional, List, Dict
from ..influxdb_client import influx_client


class DataQueryService:
    """数据查询服务类"""

    @staticmethod
    def _parse_time(start_str: Optional[str], end_str: Optional[str], default_hours: int = 24):
        end_time = datetime.fromisoformat(end_str) if end_str else datetime.now()
        start_time = datetime.fromisoformat(start_str) if start_str else (end_time - timedelta(hours=default_hours))
        return start_time, end_time

    @staticmethod
    def get_zones() -> List[str]:
        zones = influx_client.get_zones()
        return zones if zones else ['东城区', '西城区', '南城区', '北城区', '中心区', '工业区', '住宅区A', '住宅区B']

    @staticmethod
    def get_devices(zone: Optional[str] = None) -> List[str]:
        devices = influx_client.get_devices(zone)
        return devices if devices else [f'P{i:03d}' for i in range(1, 51)]

    @staticmethod
    def get_pressure_data(
        device_id: Optional[str] = None,
        zone: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        aggregation: Optional[str] = None,
        page: int = 1,
        page_size: int = 0
    ) -> Dict:
        try:
            start_dt, end_dt = DataQueryService._parse_time(start_time, end_time)
            result = influx_client.query_pressure_data(
                device_id=device_id,
                zone=zone,
                start_time=start_dt,
                end_time=end_dt,
                aggregation=aggregation,
                page=page,
                page_size=page_size
            )
            return result if result else {'data': [], 'total': 0}
        except Exception as e:
            print(f"获取压力数据错误: {e}")
            return {'data': [], 'total': 0}

    @staticmethod
    def get_flow_data(
        device_id: Optional[str] = None,
        zone: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        aggregation: Optional[str] = None,
        page: int = 1,
        page_size: int = 0
    ) -> Dict:
        try:
            start_dt, end_dt = DataQueryService._parse_time(start_time, end_time)
            result = influx_client.query_flow_data(
                device_id=device_id,
                zone=zone,
                start_time=start_dt,
                end_time=end_dt,
                aggregation=aggregation,
                page=page,
                page_size=page_size
            )
            return result if result else {'data': [], 'total': 0}
        except Exception as e:
            print(f"获取流量数据错误: {e}")
            return {'data': [], 'total': 0}

    @staticmethod
    def get_realtime_data():
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=1)

        pressure_data = influx_client.query_pressure_data(
            start_time=start_time,
            end_time=end_time,
            aggregation='15m'
        )
        flow_data = influx_client.query_flow_data(
            start_time=start_time,
            end_time=end_time,
            aggregation='15m'
        )

        p_list = pressure_data.get('data', pressure_data) if isinstance(pressure_data, dict) else pressure_data
        f_list = flow_data.get('data', flow_data) if isinstance(flow_data, dict) else flow_data

        return {
            'pressure_data': p_list if p_list else [],
            'flow_data': f_list if f_list else []
        }

    @staticmethod
    def get_latest_values(device_id: str) -> Dict:
        return influx_client.get_latest_values(device_id)

    @staticmethod
    def get_fault_points(zone: Optional[str] = None,
                         start_time: Optional[str] = None,
                         end_time: Optional[str] = None) -> List[Dict]:
        start_dt = datetime.fromisoformat(start_time) if start_time else None
        end_dt = datetime.fromisoformat(end_time) if end_time else None
        return influx_client.get_fault_points(zone, start_dt, end_dt)

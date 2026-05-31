"""仪表盘数据服务 - 深度优化版"""
from datetime import datetime, timedelta
import pandas as pd
from django.db.models import Count
from ..models import Device, FaultRecord
from ..influxdb_client import influx_client


class DashboardService:

    @staticmethod
    def get_overview():
        end_time = datetime.now()
        start_time = end_time - timedelta(days=1)

        pressure_result = influx_client.query_pressure_data(
            start_time=start_time,
            end_time=end_time,
            aggregation='1h'
        )
        flow_result = influx_client.query_flow_data(
            start_time=start_time,
            end_time=end_time,
            aggregation='1h'
        )

        pressure_data = pressure_result.get('data', pressure_result) if isinstance(pressure_result, dict) else pressure_result
        flow_data = flow_result.get('data', flow_result) if isinstance(flow_result, dict) else flow_result

        df_p = pd.DataFrame(pressure_data) if pressure_data else pd.DataFrame()
        df_f = pd.DataFrame(flow_data) if flow_data else pd.DataFrame()

        total_devices = Device.objects.count()
        online_devices = Device.objects.filter(status='online').count()
        active_faults = FaultRecord.objects.filter(resolved=False).count()

        avg_pressure = float(df_p['pressure'].mean()) if len(df_p) > 0 and 'pressure' in df_p.columns else (
            float(df_p['value'].mean()) if len(df_p) > 0 and 'value' in df_p.columns else 0.45
        )
        avg_flow = float(df_f['flow'].mean()) if len(df_f) > 0 and 'flow' in df_f.columns else (
            float(df_f['value'].mean()) if len(df_f) > 0 and 'value' in df_f.columns else 100.0
        )

        return {
            'summary': {
                'total_devices': total_devices,
                'online_devices': online_devices,
                'online_rate': round(online_devices / total_devices * 100, 2) if total_devices > 0 else 0,
                'active_faults': active_faults,
                'avg_pressure': round(avg_pressure, 3),
                'avg_flow': round(avg_flow, 2)
            },
            'pressure_trend': pressure_data[:100] if pressure_data else [],
            'flow_trend': flow_data[:100] if flow_data else []
        }

    @staticmethod
    def get_device_map_data():
        devices = Device.objects.select_related('zone').all()
        fault_devices = set(
            FaultRecord.objects.filter(resolved=False)
            .values_list('device_id', flat=True)
        )

        device_data = []
        for device in devices:
            is_fault = device.device_id in fault_devices
            device_data.append({
                'device_id': device.device_id,
                'name': device.name or device.device_id,
                'zone': device.zone.name if device.zone else '未分配',
                'longitude': float(device.longitude) if device.longitude else 0,
                'latitude': float(device.latitude) if device.latitude else 0,
                'status': 'fault' if is_fault else (device.status or 'online'),
                'device_type': device.device_type or 'pressure',
                'has_fault': is_fault
            })

        return device_data

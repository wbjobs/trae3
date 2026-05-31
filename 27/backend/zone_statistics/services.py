"""
分区统计服务
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, List
import pandas as pd
import numpy as np
from api.influxdb_client import influx_client
from api.models import Zone


class ZoneStatisticsService:
    """分区统计服务"""
    
    def __init__(self):
        self.zones = [
            '东城区', '西城区', '南城区', '北城区',
            '中心区', '工业区', '住宅区A', '住宅区B'
        ]
    
    def get_zone_overview(self) -> List[Dict]:
        """获取分区概览"""
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=24)
        
        overview = []
        for zone in self.zones:
            pressure_data = influx_client.query_pressure_data(
                zone=zone,
                start_time=start_time,
                end_time=end_time,
                aggregation='1h'
            )
            flow_data = influx_client.query_flow_data(
                zone=zone,
                start_time=start_time,
                end_time=end_time,
                aggregation='1h'
            )
            
            df_p = pd.DataFrame(pressure_data)
            df_f = pd.DataFrame(flow_data)
            
            zone_info = {
                'zone': zone,
                'pressure': {
                    'current': float(df_p['pressure'].iloc[-1]) if len(df_p) > 0 else 0,
                    'avg': float(df_p['pressure'].mean()) if len(df_p) > 0 else 0,
                    'min': float(df_p['pressure'].min()) if len(df_p) > 0 else 0,
                    'max': float(df_p['pressure'].max()) if len(df_p) > 0 else 0
                },
                'flow': {
                    'current': float(df_f['flow'].iloc[-1]) if len(df_f) > 0 else 0,
                    'avg': float(df_f['flow'].mean()) if len(df_f) > 0 else 0,
                    'min': float(df_f['flow'].min()) if len(df_f) > 0 else 0,
                    'max': float(df_f['flow'].max()) if len(df_f) > 0 else 0
                },
                'status': self._determine_zone_status(df_p, df_f)
            }
            overview.append(zone_info)
        
        return overview
    
    def _determine_zone_status(self, df_p: pd.DataFrame, df_f: pd.DataFrame) -> str:
        """判断分区状态"""
        if len(df_p) == 0 or len(df_f) == 0:
            return 'unknown'
        
        avg_p = df_p['pressure'].mean()
        avg_f = df_f['flow'].mean()
        
        if avg_p < 0.15 or avg_p > 0.7:
            return 'warning'
        if avg_f < 10 or avg_f > 180:
            return 'warning'
        
        if df_p['is_fault'].sum() > 0 or df_f['is_fault'].sum() > 0:
            return 'warning'
        
        return 'normal'
    
    def calculate_zone_statistics(self,
                                   zone: Optional[str] = None,
                                   start_time: Optional[datetime] = None,
                                   end_time: Optional[datetime] = None) -> Dict:
        """计算分区统计数据"""
        if not end_time:
            end_time = datetime.now()
        if not start_time:
            start_time = end_time - timedelta(days=7)
        
        zones_to_analyze = [zone] if zone else self.zones
        result = {}
        
        for z in zones_to_analyze:
            pressure_data = influx_client.query_pressure_data(
                zone=z,
                start_time=start_time,
                end_time=end_time
            )
            flow_data = influx_client.query_flow_data(
                zone=z,
                start_time=start_time,
                end_time=end_time
            )
            
            df_p = pd.DataFrame(pressure_data)
            df_f = pd.DataFrame(flow_data)
            
            if len(df_p) > 0:
                df_p['time'] = pd.to_datetime(df_p['time'])
                df_p['hour'] = df_p['time'].dt.hour
                hourly_p = df_p.groupby('hour')['pressure'].agg(['mean', 'std', 'min', 'max']).reset_index()
                hourly_p = hourly_p.rename(columns={'mean': 'avg'})
            else:
                hourly_p = pd.DataFrame()
            
            if len(df_f) > 0:
                df_f['time'] = pd.to_datetime(df_f['time'])
                df_f['hour'] = df_f['time'].dt.hour
                hourly_f = df_f.groupby('hour')['flow'].agg(['mean', 'std', 'min', 'max']).reset_index()
                hourly_f = hourly_f.rename(columns={'mean': 'avg'})
            else:
                hourly_f = pd.DataFrame()
            
            result[z] = {
                'pressure': {
                    'overall': {
                        'count': len(df_p),
                        'avg': float(df_p['pressure'].mean()) if len(df_p) > 0 else 0,
                        'std': float(df_p['pressure'].std()) if len(df_p) > 0 else 0,
                        'min': float(df_p['pressure'].min()) if len(df_p) > 0 else 0,
                        'max': float(df_p['pressure'].max()) if len(df_p) > 0 else 0
                    },
                    'hourly': hourly_p.to_dict('records') if len(hourly_p) > 0 else []
                },
                'flow': {
                    'overall': {
                        'count': len(df_f),
                        'avg': float(df_f['flow'].mean()) if len(df_f) > 0 else 0,
                        'std': float(df_f['flow'].std()) if len(df_f) > 0 else 0,
                        'min': float(df_f['flow'].min()) if len(df_f) > 0 else 0,
                        'max': float(df_f['flow'].max()) if len(df_f) > 0 else 0
                    },
                    'hourly': hourly_f.to_dict('records') if len(hourly_f) > 0 else []
                },
                'fault_count': int(df_p['is_fault'].sum()) if len(df_p) > 0 else 0
            }
        
        return result
    
    def compare_zones(self,
                       metric: str = 'pressure',
                       start_time: Optional[datetime] = None,
                       end_time: Optional[datetime] = None) -> Dict:
        """分区对比"""
        if not end_time:
            end_time = datetime.now()
        if not start_time:
            start_time = end_time - timedelta(days=7)
        
        comparison = {
            'zones': self.zones,
            'metric': metric,
            'period': {
                'start': start_time.isoformat(),
                'end': end_time.isoformat()
            },
            'data': []
        }
        
        for zone in self.zones:
            if metric == 'pressure':
                data = influx_client.query_pressure_data(
                    zone=zone,
                    start_time=start_time,
                    end_time=end_time,
                    aggregation='1d'
                )
                field = 'pressure'
            else:
                data = influx_client.query_flow_data(
                    zone=zone,
                    start_time=start_time,
                    end_time=end_time,
                    aggregation='1d'
                )
                field = 'flow'
            
            df = pd.DataFrame(data)
            
            comparison['data'].append({
                'zone': zone,
                'values': df[field].tolist() if len(df) > 0 else [],
                'avg': float(df[field].mean()) if len(df) > 0 else 0,
                'trend': self._calculate_trend(df, field)
            })
        
        return comparison
    
    def _calculate_trend(self, df: pd.DataFrame, field: str) -> str:
        """计算趋势"""
        if len(df) < 2:
            return 'stable'
        
        first_half = df.iloc[:len(df)//2][field].mean()
        second_half = df.iloc[len(df)//2:][field].mean()
        
        if first_half == 0:
            return 'stable'
        
        change = (second_half - first_half) / first_half
        
        if change > 0.1:
            return 'rising'
        elif change < -0.1:
            return 'falling'
        else:
            return 'stable'
    
    def get_daily_summary(self, date: Optional[datetime] = None) -> Dict:
        """获取每日汇总"""
        if not date:
            date = datetime.now().date()
        
        start_time = datetime.combine(date, datetime.min.time())
        end_time = start_time + timedelta(days=1)
        
        summary = {
            'date': date.isoformat(),
            'zones': {}
        }
        
        for zone in self.zones:
            pressure_data = influx_client.query_pressure_data(
                zone=zone,
                start_time=start_time,
                end_time=end_time,
                aggregation='1h'
            )
            flow_data = influx_client.query_flow_data(
                zone=zone,
                start_time=start_time,
                end_time=end_time,
                aggregation='1h'
            )
            
            df_p = pd.DataFrame(pressure_data)
            df_f = pd.DataFrame(flow_data)
            
            peak_hour_p = self._find_peak_hour(df_p, 'pressure')
            peak_hour_f = self._find_peak_hour(df_f, 'flow')
            
            summary['zones'][zone] = {
                'pressure': {
                    'avg': float(df_p['pressure'].mean()) if len(df_p) > 0 else 0,
                    'peak_hour': peak_hour_p,
                    'compliance_rate': self._calculate_compliance(df_p, 'pressure')
                },
                'flow': {
                    'total': float(df_f['flow'].sum() * 0.25) if len(df_f) > 0 else 0,
                    'avg': float(df_f['flow'].mean()) if len(df_f) > 0 else 0,
                    'peak_hour': peak_hour_f
                }
            }
        
        return summary
    
    def _find_peak_hour(self, df: pd.DataFrame, field: str) -> int:
        """找到峰值小时"""
        if len(df) == 0:
            return 0
        
        df['time'] = pd.to_datetime(df['time'])
        df['hour'] = df['time'].dt.hour
        hourly_avg = df.groupby('hour')[field].mean()
        
        return int(hourly_avg.idxmax()) if len(hourly_avg) > 0 else 0
    
    def _calculate_compliance(self, df: pd.DataFrame, field: str) -> float:
        """计算达标率"""
        if len(df) == 0:
            return 0.0
        
        if field == 'pressure':
            compliant = (df[field] >= 0.2) & (df[field] <= 0.6)
        else:
            compliant = (df[field] >= 10) & (df[field] <= 150)
        
        return round(float(compliant.sum() / len(df) * 100), 2)

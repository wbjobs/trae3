"""
故障预警服务
"""
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import pandas as pd
import numpy as np
from django.utils import timezone
from django.db.models import Count

from api.influxdb_client import influx_client
from api.models import Device, FaultRecord, Zone


class FaultWarningService:
    """故障预警服务"""
    
    def __init__(self):
        self.pressure_thresholds = {
            'min': 0.15,
            'max': 0.7
        }
        self.flow_thresholds = {
            'min': 5,
            'max': 200
        }
        self.consecutive_points = 3
    
    def detect_and_record_faults(self) -> int:
        """检测并记录故障"""
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=2)
        
        detected_count = 0
        
        pressure_data = influx_client.query_pressure_data(
            start_time=start_time,
            end_time=end_time
        )
        flow_data = influx_client.query_flow_data(
            start_time=start_time,
            end_time=end_time
        )
        
        df_p = pd.DataFrame(pressure_data)
        df_f = pd.DataFrame(flow_data)
        
        if len(df_p) > 0:
            pressure_faults = self._detect_pressure_faults(df_p)
            for fault in pressure_faults:
                if self._record_fault(fault):
                    detected_count += 1
        
        if len(df_f) > 0:
            flow_faults = self._detect_flow_faults(df_f)
            for fault in flow_faults:
                if self._record_fault(fault):
                    detected_count += 1
        
        return detected_count
    
    def _detect_pressure_faults(self, df: pd.DataFrame) -> List[Dict]:
        """检测压力故障"""
        faults = []
        
        for device_id in df['device_id'].unique():
            device_df = df[df['device_id'] == device_id].sort_values('time')
            
            if len(device_df) < self.consecutive_points:
                continue
            
            low_mask = device_df['pressure'] < self.pressure_thresholds['min']
            high_mask = device_df['pressure'] > self.pressure_thresholds['max']
            
            low_consecutive = low_mask.rolling(window=self.consecutive_points).sum() >= self.consecutive_points
            high_consecutive = high_mask.rolling(window=self.consecutive_points).sum() >= self.consecutive_points
            
            if low_consecutive.any():
                fault_point = device_df[low_consecutive.shift(-2).fillna(False)].iloc[0] if len(device_df[low_consecutive.shift(-2).fillna(False)]) > 0 else device_df[low_mask].iloc[0] if len(device_df[low_mask]) > 0 else None
                if fault_point is not None:
                    faults.append({
                        'device_id': device_id,
                        'fault_type': 'low_pressure',
                        'fault_time': pd.to_datetime(fault_point['time']),
                        'fault_value': float(fault_point['pressure']),
                        'threshold': self.pressure_thresholds['min'],
                        'description': f'压力连续低于阈值 {self.pressure_thresholds["min"]} MPa'
                    })
            
            if high_consecutive.any():
                fault_point = device_df[high_consecutive.shift(-2).fillna(False)].iloc[0] if len(device_df[high_consecutive.shift(-2).fillna(False)]) > 0 else device_df[high_mask].iloc[0] if len(device_df[high_mask]) > 0 else None
                if fault_point is not None:
                    faults.append({
                        'device_id': device_id,
                        'fault_type': 'high_pressure',
                        'fault_time': pd.to_datetime(fault_point['time']),
                        'fault_value': float(fault_point['pressure']),
                        'threshold': self.pressure_thresholds['max'],
                        'description': f'压力连续高于阈值 {self.pressure_thresholds["max"]} MPa'
                    })
        
        return faults
    
    def _detect_flow_faults(self, df: pd.DataFrame) -> List[Dict]:
        """检测流量故障"""
        faults = []
        
        for device_id in df['device_id'].unique():
            device_df = df[df['device_id'] == device_id].sort_values('time')
            
            if len(device_df) < self.consecutive_points:
                continue
            
            low_mask = device_df['flow'] < self.flow_thresholds['min']
            high_mask = device_df['flow'] > self.flow_thresholds['max']
            
            low_consecutive = low_mask.rolling(window=self.consecutive_points).sum() >= self.consecutive_points
            high_consecutive = high_mask.rolling(window=self.consecutive_points).sum() >= self.consecutive_points
            
            if low_consecutive.any():
                fault_point = device_df[low_consecutive.shift(-2).fillna(False)].iloc[0] if len(device_df[low_consecutive.shift(-2).fillna(False)]) > 0 else device_df[low_mask].iloc[0] if len(device_df[low_mask]) > 0 else None
                if fault_point is not None:
                    faults.append({
                        'device_id': device_id,
                        'fault_type': 'low_flow',
                        'fault_time': pd.to_datetime(fault_point['time']),
                        'fault_value': float(fault_point['flow']),
                        'threshold': self.flow_thresholds['min'],
                        'description': f'流量连续低于阈值 {self.flow_thresholds["min"]} m³/h'
                    })
            
            if high_consecutive.any():
                fault_point = device_df[high_consecutive.shift(-2).fillna(False)].iloc[0] if len(device_df[high_consecutive.shift(-2).fillna(False)]) > 0 else device_df[high_mask].iloc[0] if len(device_df[high_mask]) > 0 else None
                if fault_point is not None:
                    faults.append({
                        'device_id': device_id,
                        'fault_type': 'high_flow',
                        'fault_time': pd.to_datetime(fault_point['time']),
                        'fault_value': float(fault_point['flow']),
                        'threshold': self.flow_thresholds['max'],
                        'description': f'流量连续高于阈值 {self.flow_thresholds["max"]} m³/h'
                    })
        
        return faults
    
    def _record_fault(self, fault_data: Dict) -> bool:
        """记录故障"""
        try:
            device = Device.objects.filter(device_id=fault_data['device_id']).first()
            if not device:
                zone = Zone.objects.first()
                if not zone:
                    zone = Zone.objects.create(
                        name='默认分区',
                        code='DEFAULT',
                        pressure_min=0.2,
                        pressure_max=0.6,
                        flow_min=10,
                        flow_max=200
                    )
                device = Device.objects.create(
                    device_id=fault_data['device_id'],
                    name=f'设备-{fault_data["device_id"]}',
                    zone=zone,
                    longitude=116.4 + np.random.random() * 0.2,
                    latitude=39.9 + np.random.random() * 0.2,
                    status='fault'
                )
            
            existing = FaultRecord.objects.filter(
                device=device,
                fault_type=fault_data['fault_type'],
                fault_time__gte=fault_data['fault_time'] - timedelta(hours=1),
                resolved=False
            ).first()
            
            if existing:
                return False
            
            FaultRecord.objects.create(
                device=device,
                fault_type=fault_data['fault_type'],
                fault_time=fault_data['fault_time'],
                fault_value=fault_data['fault_value'],
                threshold=fault_data['threshold'],
                description=fault_data.get('description', '')
            )
            
            device.status = 'fault'
            device.save()
            
            return True
        except Exception as e:
            print(f"记录故障失败: {e}")
            return False
    
    def get_fault_statistics(self) -> Dict:
        """获取故障统计"""
        end_date = timezone.now()
        start_date = end_date - timedelta(days=30)
        
        faults = FaultRecord.objects.filter(fault_time__gte=start_date)
        
        by_type = faults.values('fault_type').annotate(
            count=Count('id')
        ).order_by('-count')
        
        by_zone = faults.values('device__zone__name').annotate(
            count=Count('id')
        ).order_by('-count')
        
        resolved_count = faults.filter(resolved=True).count()
        total_count = faults.count()
        
        daily_stats = []
        for i in range(7):
            day = end_date - timedelta(days=i)
            day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            day_count = FaultRecord.objects.filter(
                fault_time__gte=day_start,
                fault_time__lt=day_end
            ).count()
            daily_stats.append({
                'date': day.strftime('%Y-%m-%d'),
                'count': day_count
            })
        
        return {
            'total': total_count,
            'resolved': resolved_count,
            'active': total_count - resolved_count,
            'resolution_rate': round(resolved_count / total_count * 100, 2) if total_count > 0 else 0,
            'by_type': list(by_type),
            'by_zone': list(by_zone),
            'daily': daily_stats
        }
    
    def get_fault_prone_zones(self) -> List[Dict]:
        """获取易发故障区域"""
        end_date = timezone.now()
        start_date = end_date - timedelta(days=30)
        
        zone_stats = FaultRecord.objects.filter(
            fault_time__gte=start_date
        ).values('device__zone__name', 'device__zone__id').annotate(
            count=models.Count('id'),
            avg_resolution_time=models.Avg(
                models.F('resolved_time') - models.F('fault_time')
            )
        ).order_by('-count')[:5]
        
        return list(zone_stats)
    
    def predict_faults(self) -> List[Dict]:
        """预测潜在故障"""
        predictions = []
        
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=24)
        
        pressure_data = influx_client.query_pressure_data(
            start_time=start_time,
            end_time=end_time,
            aggregation='1h'
        )
        
        df = pd.DataFrame(pressure_data)
        if len(df) == 0:
            return predictions
        
        for device_id in df['device_id'].unique():
            device_df = df[df['device_id'] == device_id].sort_values('time')
            if len(device_df) < 12:
                continue
            
            recent = device_df.tail(6)['pressure']
            earlier = device_df.head(6)['pressure']
            
            recent_avg = recent.mean()
            earlier_avg = earlier.mean()
            
            if earlier_avg > 0:
                decline_rate = (earlier_avg - recent_avg) / earlier_avg
            else:
                decline_rate = 0
            
            if decline_rate > 0.15 or recent_avg < 0.2:
                predictions.append({
                    'device_id': device_id,
                    'risk_level': 'high' if recent_avg < 0.18 else 'medium',
                    'current_pressure': round(float(recent_avg), 3),
                    'decline_rate': round(decline_rate * 100, 2),
                    'prediction': '压力持续下降，可能出现管网泄漏或设备故障'
                })
        
        return predictions

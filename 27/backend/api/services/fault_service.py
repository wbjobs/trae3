"""故障管理服务"""
from datetime import datetime, timedelta
from django.utils import timezone
from django.db.models import Count, Q
from ..models import FaultRecord
from fault_warning.services import FaultWarningService


class FaultService:
    """故障管理服务类"""
    
    @staticmethod
    def get_fault_list(resolved=None, days=7):
        """获取故障列表"""
        queryset = FaultRecord.objects.select_related('device', 'zone').all()
        
        if resolved is not None and resolved != '':
            queryset = queryset.filter(resolved=(resolved == 'true'))
        
        if days and days > 0:
            start_date = timezone.now() - timedelta(days=days)
            queryset = queryset.filter(fault_time__gte=start_date)
        
        faults = queryset.order_by('-fault_time')
        
        result = []
        for fault in faults:
            fault_type_display = {
                'low_pressure': '压力过低',
                'high_pressure': '压力过高',
                'low_flow': '流量过低',
                'high_flow': '流量过高',
                'offline': '设备离线',
                'abnormal': '数据异常'
            }.get(fault.fault_type, fault.fault_type)
            
            result.append({
                'id': fault.id,
                'device_id': fault.device_id,
                'device_name': fault.device.name if fault.device else fault.device_id,
                'zone_name': fault.zone.name if fault.zone else '未分配',
                'fault_type': fault.fault_type,
                'fault_type_display': fault_type_display,
                'fault_value': fault.fault_value,
                'threshold': fault.threshold,
                'fault_time': fault.fault_time.isoformat() if fault.fault_time else None,
                'resolved': fault.resolved,
                'resolved_time': fault.resolved_time.isoformat() if fault.resolved_time else None
            })
        
        return result
    
    @staticmethod
    def get_statistics():
        """获取故障统计"""
        service = FaultWarningService()
        stats = service.get_fault_statistics()
        
        total = FaultRecord.objects.count()
        resolved = FaultRecord.objects.filter(resolved=True).count()
        active = FaultRecord.objects.filter(resolved=False).count()
        
        by_type = FaultRecord.objects.values('fault_type').annotate(
            count=Count('id')
        ).values('fault_type', 'count')
        
        daily_stats = []
        for i in range(7):
            date = timezone.now().date() - timedelta(days=i)
            count = FaultRecord.objects.filter(
                fault_time__date=date
            ).count()
            daily_stats.append({
                'date': date.isoformat(),
                'count': count
            })
        daily_stats.reverse()
        
        return {
            'total': total,
            'resolved': resolved,
            'active': active,
            'resolution_rate': round(resolved / total * 100, 1) if total > 0 else 0,
            'by_type': list(by_type) if by_type else [],
            'daily': daily_stats
        }
    
    @staticmethod
    def detect_faults():
        """执行故障检测"""
        service = FaultWarningService()
        detected = service.detect_and_record_faults()
        return detected
    
    @staticmethod
    def resolve_fault(fault_id):
        """标记故障已解决"""
        try:
            fault = FaultRecord.objects.get(id=fault_id)
            fault.resolved = True
            fault.resolved_time = timezone.now()
            fault.save()
            return True
        except FaultRecord.DoesNotExist:
            return False

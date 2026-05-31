"""
数据模型
"""
from django.db import models


class Zone(models.Model):
    """分区信息"""
    name = models.CharField(max_length=100, verbose_name='分区名称')
    code = models.CharField(max_length=50, unique=True, verbose_name='分区编码')
    description = models.TextField(blank=True, verbose_name='描述')
    pressure_min = models.FloatField(default=0.2, verbose_name='最低压力阈值(MPa)')
    pressure_max = models.FloatField(default=0.6, verbose_name='最高压力阈值(MPa)')
    flow_min = models.FloatField(default=10, verbose_name='最低流量阈值(m³/h)')
    flow_max = models.FloatField(default=200, verbose_name='最高流量阈值(m³/h)')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'zone'
        verbose_name = '分区'
        verbose_name_plural = verbose_name
    
    def __str__(self):
        return self.name


class Device(models.Model):
    """设备信息"""
    device_id = models.CharField(max_length=50, unique=True, verbose_name='设备ID')
    name = models.CharField(max_length=100, verbose_name='设备名称')
    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, verbose_name='所属分区')
    device_type = models.CharField(max_length=50, choices=(
        ('pressure', '压力传感器'),
        ('flow', '流量传感器'),
        ('combo', '压力流量一体')
    ), default='combo', verbose_name='设备类型')
    longitude = models.FloatField(verbose_name='经度')
    latitude = models.FloatField(verbose_name='纬度')
    status = models.CharField(max_length=20, choices=(
        ('online', '在线'),
        ('offline', '离线'),
        ('fault', '故障')
    ), default='online', verbose_name='状态')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'device'
        verbose_name = '设备'
        verbose_name_plural = verbose_name
    
    def __str__(self):
        return f"{self.device_id} - {self.name}"


class FaultRecord(models.Model):
    """故障记录"""
    device = models.ForeignKey(Device, on_delete=models.CASCADE, verbose_name='设备')
    fault_type = models.CharField(max_length=50, choices=(
        ('low_pressure', '压力过低'),
        ('high_pressure', '压力过高'),
        ('low_flow', '流量过低'),
        ('high_flow', '流量过高'),
        ('offline', '设备离线'),
        ('abnormal', '数据异常')
    ), verbose_name='故障类型')
    fault_time = models.DateTimeField(verbose_name='故障时间')
    fault_value = models.FloatField(verbose_name='故障值')
    threshold = models.FloatField(verbose_name='阈值')
    resolved = models.BooleanField(default=False, verbose_name='是否已解决')
    resolved_time = models.DateTimeField(null=True, blank=True, verbose_name='解决时间')
    description = models.TextField(blank=True, verbose_name='故障描述')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'fault_record'
        verbose_name = '故障记录'
        verbose_name_plural = verbose_name
    
    def __str__(self):
        return f"{self.device.device_id} - {self.fault_type}"


class MaintenanceReport(models.Model):
    """运维报表"""
    report_date = models.DateField(unique=True, verbose_name='报表日期')
    total_devices = models.IntegerField(default=0, verbose_name='设备总数')
    online_devices = models.IntegerField(default=0, verbose_name='在线设备数')
    fault_devices = models.IntegerField(default=0, verbose_name='故障设备数')
    total_faults = models.IntegerField(default=0, verbose_name='故障总数')
    resolved_faults = models.IntegerField(default=0, verbose_name='已解决故障数')
    avg_pressure = models.FloatField(default=0, verbose_name='平均压力(MPa)')
    avg_flow = models.FloatField(default=0, verbose_name='平均流量(m³/h)')
    online_rate = models.FloatField(default=0, verbose_name='在线率(%)')
    fault_rate = models.FloatField(default=0, verbose_name='故障率(%)')
    resolution_rate = models.FloatField(default=0, verbose_name='解决率(%)')
    report_file = models.CharField(max_length=255, blank=True, verbose_name='报表文件路径')
    report_notes = models.TextField(blank=True, verbose_name='报表备注')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'maintenance_report'
        verbose_name = '运维报表'
        verbose_name_plural = verbose_name
    
    def __str__(self):
        return f"运维报表 - {self.report_date}"

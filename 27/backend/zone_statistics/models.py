"""
分区统计模块模型
"""
from django.db import models


class ZoneStatistics(models.Model):
    """分区统计记录"""
    zone = models.CharField(max_length=100, verbose_name='分区')
    stat_date = models.DateField(verbose_name='统计日期')
    avg_pressure = models.FloatField(default=0, verbose_name='平均压力(MPa)')
    min_pressure = models.FloatField(default=0, verbose_name='最低压力(MPa)')
    max_pressure = models.FloatField(default=0, verbose_name='最高压力(MPa)')
    avg_flow = models.FloatField(default=0, verbose_name='平均流量(m³/h)')
    total_flow = models.FloatField(default=0, verbose_name='总流量(m³)')
    pressure_compliance = models.FloatField(default=0, verbose_name='压力达标率(%)')
    flow_compliance = models.FloatField(default=0, verbose_name='流量达标率(%)')
    fault_count = models.IntegerField(default=0, verbose_name='故障次数')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'zone_statistics'
        verbose_name = '分区统计'
        verbose_name_plural = verbose_name
        unique_together = ('zone', 'stat_date')
    
    def __str__(self):
        return f"{self.zone} - {self.stat_date}"

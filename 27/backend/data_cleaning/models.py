"""
数据清洗模块模型
"""
from django.db import models


class DataQualityReport(models.Model):
    """数据质量报告"""
    report_date = models.DateField(verbose_name='报告日期')
    zone = models.CharField(max_length=100, blank=True, verbose_name='分区')
    overall_score = models.FloatField(verbose_name='总体质量评分')
    pressure_score = models.FloatField(verbose_name='压力数据质量评分')
    flow_score = models.FloatField(verbose_name='流量数据质量评分')
    total_records = models.IntegerField(verbose_name='总记录数')
    cleaned_records = models.IntegerField(verbose_name='清洗记录数')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'data_quality_report'
        verbose_name = '数据质量报告'
        verbose_name_plural = verbose_name
        unique_together = ('report_date', 'zone')
    
    def __str__(self):
        return f"{self.report_date} - {self.zone or '全部'}"

"""
故障预警模块模型
"""
from django.db import models


class WarningRule(models.Model):
    """预警规则"""
    name = models.CharField(max_length=100, verbose_name='规则名称')
    metric = models.CharField(max_length=50, choices=(
        ('pressure', '压力'),
        ('flow', '流量')
    ), verbose_name='监测指标')
    condition = models.CharField(max_length=20, choices=(
        ('lt', '小于'),
        ('gt', '大于'),
        ('lte', '小于等于'),
        ('gte', '大于等于')
    ), verbose_name='条件')
    threshold = models.FloatField(verbose_name='阈值')
    consecutive_points = models.IntegerField(default=3, verbose_name='连续点数')
    enabled = models.BooleanField(default=True, verbose_name='是否启用')
    severity = models.CharField(max_length=20, choices=(
        ('low', '低'),
        ('medium', '中'),
        ('high', '高')
    ), default='medium', verbose_name='严重程度')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'warning_rule'
        verbose_name = '预警规则'
        verbose_name_plural = verbose_name
    
    def __str__(self):
        return self.name

"""
分区统计模块配置
"""
from django.apps import AppConfig


class ZoneStatisticsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'zone_statistics'
    verbose_name = '分区统计'

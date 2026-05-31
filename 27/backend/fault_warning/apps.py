"""
故障预警模块配置
"""
from django.apps import AppConfig


class FaultWarningConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'fault_warning'
    verbose_name = '故障预警'

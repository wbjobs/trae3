"""
数据清洗模块配置
"""
from django.apps import AppConfig


class DataCleaningConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'data_cleaning'
    verbose_name = '数据清洗'

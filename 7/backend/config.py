import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')

    INFLUXDB_URL = os.getenv('INFLUXDB_URL', 'http://localhost:8086')
    INFLUXDB_TOKEN = os.getenv('INFLUXDB_TOKEN', 'your-token-here')
    INFLUXDB_ORG = os.getenv('INFLUXDB_ORG', 'industrial-iot')
    INFLUXDB_BUCKET = os.getenv('INFLUXDB_BUCKET', 'device_metrics')

    USE_SIMULATION = os.getenv('USE_SIMULATION', 'true').lower() == 'true'

    CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',')

    DATA_CACHE_TTL = 300
    MAX_QUERY_POINTS = 100000

    REPORT_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'reports')
    EXPORT_DIR = os.path.join(os.path.dirname(__file__), '..', 'exports')

    METRIC_CONFIGS = {
        'temperature': {'base': 55, 'std': 8, 'min': 20, 'max': 100, 'unit': '°C', 'warn_high': 80, 'warn_low': 25},
        'vibration': {'base': 15, 'std': 5, 'min': 0, 'max': 50, 'unit': 'mm/s', 'warn_high': 30, 'warn_low': 0},
        'current': {'base': 25, 'std': 4, 'min': 5, 'max': 60, 'unit': 'A', 'warn_high': 45, 'warn_low': 8},
        'rpm': {'base': 1480, 'std': 50, 'min': 1000, 'max': 2000, 'unit': 'RPM', 'warn_high': 1800, 'warn_low': 1100},
        'pressure': {'base': 5.5, 'std': 0.8, 'min': 0, 'max': 12, 'unit': 'MPa', 'warn_high': 9, 'warn_low': 1},
        'flow_rate': {'base': 120, 'std': 15, 'min': 30, 'max': 250, 'unit': 'L/min', 'warn_high': 180, 'warn_low': 50},
        'power': {'base': 45, 'std': 8, 'min': 5, 'max': 120, 'unit': 'kW', 'warn_high': 90, 'warn_low': 10},
    }

    @staticmethod
    def ensure_dirs():
        for dir_path in [Config.REPORT_OUTPUT_DIR, Config.EXPORT_DIR]:
            os.makedirs(dir_path, exist_ok=True)

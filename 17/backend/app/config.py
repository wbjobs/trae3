from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "光伏阵列工况时序数据分析系统"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    DEBUG: bool = True

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    DATABASE_URL: str = "sqlite:///./data/pv_monitor.db"

    VICTORIA_METRICS_URL: str = "http://localhost:8428"
    VICTORIA_METRICS_TIMEOUT: int = 30

    CORS_ORIGINS: list = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    DATA_RETENTION_DAYS: int = 365
    MAX_PAGE_SIZE: int = 1000

    TEMP_FILE_DIR: str = "./data/temp"
    REPORT_OUTPUT_DIR: str = "./data/reports"

    FAULT_DETECTION_THRESHOLDS: dict = {
        "voltage_low": 20.0,
        "voltage_high": 45.0,
        "current_low": 1.0,
        "current_high": 12.0,
        "temperature_high": 75.0,
        "temperature_critical": 85.0,
    }

    MOCK_DATA_ENABLED: bool = True
    MOCK_COMPONENT_COUNT: int = 200
    MOCK_DATA_DAYS: int = 7


settings = Settings()

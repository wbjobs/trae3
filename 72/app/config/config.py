from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "Multi-module API Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DATABASE_URL: str = "sqlite:///./multi_module_db.db"
    DEVICE_DATABASE_URL: str = "sqlite:///./device_db.db"
    MESSAGE_LOG_DATABASE_URL: str = "sqlite:///./message_log_db.db"

    REDIS_URL: str = "redis://localhost:6379/0"

    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    TENANT_HEADER: str = "X-Tenant-ID"

    SCHEDULER_MAX_WORKERS: int = 10
    SCHEDULER_TIMEZONE: str = "Asia/Shanghai"

    MESSAGE_QUEUE_MAX_SIZE: int = 1000
    MESSAGE_PUSH_BATCH_SIZE: int = 100

    class Config:
        env_file = ".env"


settings = Settings()

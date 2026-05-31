from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    APP_NAME: str = "MonitoringSystem"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    DATABASE_URL: str = "sqlite:///./data/monitoring.db"

    GENERATE_MOCK_DATA: bool = True
    MOCK_DATA_INTERVAL: float = 1.0

    ANOMALY_DETECTION_ENABLED: bool = True
    Z_SCORE_THRESHOLD: float = 3.0
    IQR_MULTIPLIER: float = 1.5

    WS_HEARTBEAT_INTERVAL: int = 30
    WS_MAX_CLIENTS: int = 100


settings = Settings()

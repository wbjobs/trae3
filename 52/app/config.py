from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "OTA Upgrade Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    DATABASE_URL: str = "sqlite:///./ota_service.db"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

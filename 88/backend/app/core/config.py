from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./database/nameplate.db"
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE: int = 10 * 1024 * 1024
    ALLOWED_EXTENSIONS: str = ".jpg,.jpeg,.png,.bmp"
    OCR_LANG: str = "ch"
    OCR_USE_ANGLE_CLS: bool = True

    class Config:
        env_file = ".env"

    @property
    def allowed_extensions_list(self) -> List[str]:
        return [ext.strip().lower() for ext in self.ALLOWED_EXTENSIONS.split(",")]

    @property
    def upload_dir_absolute(self) -> str:
        return os.path.abspath(self.UPLOAD_DIR)


settings = Settings()

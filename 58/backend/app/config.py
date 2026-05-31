from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    mongodb_url: str = "mongodb://admin:password123@localhost:27017"
    mongodb_db_name: str = "document_ocr"
    
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    
    upload_dir: str = "./uploads"
    max_file_size: int = 10 * 1024 * 1024
    
    ocr_use_gpu: bool = False
    ocr_lang: str = "ch"
    ocr_det_model_dir: str = ""
    ocr_rec_model_dir: str = ""
    ocr_cls_model_dir: str = ""
    
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    class Config:
        env_file = ".env"


settings = Settings()

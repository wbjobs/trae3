import os
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    APP_NAME: str = "FastAPI Backend"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    SECRET_KEY: str = "your-secret-key-change-in-production-please-0123456789abcdef"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    DATABASE_HOST: str = "localhost"
    DATABASE_PORT: int = 5432
    DATABASE_USER: str = "postgres"
    DATABASE_PASSWORD: str = "postgres"
    DATABASE_NAME: str = "app_db"

    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+psycopg2://{self.DATABASE_USER}:{self.DATABASE_PASSWORD}@{self.DATABASE_HOST}:{self.DATABASE_PORT}/{self.DATABASE_NAME}"

    VECTOR_STORE_PATH: str = os.path.join("data", "vector_store")
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"
    EMBEDDING_DEVICE: str = "cpu"
    EMBEDDING_BATCH_SIZE: int = 32
    EMBEDDING_MAX_SEQ_LENGTH: int = 256
    EMBEDDING_CACHE_SIZE: int = 10000
    VECTOR_INDEX_DIMENSION: int = 384
    VECTOR_INDEX_TYPE: str = "IVF"
    VECTOR_NLIST: int = 100
    VECTOR_NPROBE: int = 10
    VECTOR_TRAIN_THRESHOLD: int = 1000
    VECTOR_AUTO_SAVE_BATCH: int = 500
    VECTOR_USE_QUANTIZATION: bool = False

    UPLOAD_DIR: str = os.path.join("data", "uploads")
    TEMP_DIR: str = os.path.join("data", "temp")
    OUTPUT_DIR: str = os.path.join("data", "output")

    MAX_FILE_SIZE: int = 50 * 1024 * 1024
    ALLOWED_EXTENSIONS: List[str] = [".pdf", ".jpg", ".jpeg", ".png", ".txt", ".csv"]

    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8080",
    ]
    CORS_METHODS: List[str] = ["*"]
    CORS_HEADERS: List[str] = ["*"]

    LLM_BACKEND_TYPE: str = "openai"
    LLM_API_BASE: Optional[str] = None
    LLM_API_KEY: Optional[str] = None
    LLM_MODEL_NAME: str = "gpt-3.5-turbo"
    LLM_TEMPERATURE: float = 0.7
    LLM_MAX_TOKENS: int = 2048
    LLM_REQUEST_TIMEOUT: float = 120.0
    LLM_MAX_RETRIES: int = 3
    LLM_RETRY_DELAY: float = 2.0
    LLM_LOCAL_MODEL_PATH: str = ""
    LLM_LOAD_IN_4BIT: bool = True
    LLM_LOAD_IN_8BIT: bool = False
    LLM_USE_CPU: bool = False
    LLM_DEVICE_MAP: str = "auto"

    HTTP_CLIENT_TIMEOUT: float = 60.0
    HTTP_MAX_RETRIES: int = 3
    HTTP_RETRY_DELAY: float = 1.0

    PDF_PARSER_CHUNK_SIZE: int = 10
    PDF_PARSER_STREAM_THRESHOLD: int = 50
    PDF_PARSER_MEMORY_LIMIT_MB: int = 1024

    RAG_PROMPT_MAX_LENGTH: int = 4000
    RAG_MIN_RELEVANCE_SCORE: float = 0.5
    RAG_MAX_REFERENCES: int = 5

    STATIC_FILES_DIR: str = os.path.join("data", "output")
    STATIC_URL_PREFIX: str = "/static"

    def ensure_directories(self):
        for dir_path in [
            self.VECTOR_STORE_PATH,
            self.UPLOAD_DIR,
            self.TEMP_DIR,
            self.OUTPUT_DIR,
        ]:
            os.makedirs(dir_path, exist_ok=True)


settings = Settings()
settings.ensure_directories()

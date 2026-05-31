import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
CHROMA_DIR = BASE_DIR / "chroma_data"
DB_PATH = BASE_DIR / "data.db"

UPLOAD_DIR.mkdir(exist_ok=True)
CHROMA_DIR.mkdir(exist_ok=True)

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8001/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "empty")
LLM_MODEL_NAME = os.getenv("LLM_MODEL_NAME", "qwen2.5")
EMBEDDING_BASE_URL = os.getenv("EMBEDDING_BASE_URL", "http://localhost:8001/v1")
EMBEDDING_API_KEY = os.getenv("EMBEDDING_API_KEY", "empty")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "bge-m3")

JWT_SECRET = os.getenv("JWT_SECRET", "docusem-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 1440

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

API_TIMEOUT = int(os.getenv("API_TIMEOUT", "120"))
EMBEDDING_TIMEOUT = int(os.getenv("EMBEDDING_TIMEOUT", "180"))
LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT", "300"))
API_MAX_RETRIES = int(os.getenv("API_MAX_RETRIES", "3"))
API_RETRY_DELAY = float(os.getenv("API_RETRY_DELAY", "2.0"))

EMBEDDING_BATCH_SIZE = int(os.getenv("EMBEDDING_BATCH_SIZE", "32"))
CHROMA_MAX_BATCH_SIZE = int(os.getenv("CHROMA_MAX_BATCH_SIZE", "100"))

SEARCH_DEFAULT_TOP_K = int(os.getenv("SEARCH_DEFAULT_TOP_K", "5"))
SEARCH_MIN_THRESHOLD = float(os.getenv("SEARCH_MIN_THRESHOLD", "0.15"))
SEARCH_MAX_TOP_K = int(os.getenv("SEARCH_MAX_TOP_K", "20"))

LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "2"))
LLM_RETRY_DELAY = float(os.getenv("LLM_RETRY_DELAY", "3.0"))
LLM_MAX_NEW_TOKENS = int(os.getenv("LLM_MAX_NEW_TOKENS", "512"))

CONTEXT_MAX_TOKENS = int(os.getenv("CONTEXT_MAX_TOKENS", "3000"))
CONTEXT_RERANK_TOP_K = int(os.getenv("CONTEXT_RERANK_TOP_K", "5"))
PROMPT_COMPRESSION_ENABLED = os.getenv("PROMPT_COMPRESSION_ENABLED", "True").lower() == "true"

LLM_CACHE_SIZE = int(os.getenv("LLM_CACHE_SIZE", "100"))
CACHE_ENABLED = os.getenv("CACHE_ENABLED", "True").lower() == "true"

INCREMENTAL_UPDATE_ENABLED = os.getenv("INCREMENTAL_UPDATE_ENABLED", "True").lower() == "true"
SHARD_DEDUP_ENABLED = os.getenv("SHARD_DEDUP_ENABLED", "True").lower() == "true"

REQUEST_BATCH_SIZE = int(os.getenv("REQUEST_BATCH_SIZE", "10"))
ASYNC_PROCESSING_ENABLED = os.getenv("ASYNC_PROCESSING_ENABLED", "True").lower() == "true"

CHROMA_HNSW_M = int(os.getenv("CHROMA_HNSW_M", "64"))
CHROMA_HNSW_EF_CONSTRUCTION = int(os.getenv("CHROMA_HNSW_EF_CONSTRUCTION", "128"))
CHROMA_HNSW_EF_SEARCH = int(os.getenv("CHROMA_HNSW_EF_SEARCH", "64"))
VECTOR_PARTITION_ENABLED = os.getenv("VECTOR_PARTITION_ENABLED", "true").lower() == "true"
VECTOR_DISTANCE_METRIC = os.getenv("VECTOR_DISTANCE_METRIC", "ip")
VECTOR_QUANTIZATION_ENABLED = os.getenv("VECTOR_QUANTIZATION_ENABLED", "true").lower() == "true"

SHARD_BY_SECTION = os.getenv("SHARD_BY_SECTION", "true").lower() == "true"
SHARD_DEDUP_ENABLED = os.getenv("SHARD_DEDUP_ENABLED", "true").lower() == "true"
INCREMENTAL_UPDATE_ENABLED = os.getenv("INCREMENTAL_UPDATE_ENABLED", "true").lower() == "true"
CONTENT_HASH_ALGO = os.getenv("CONTENT_HASH_ALGO", "xxhash")

CONTEXT_MAX_TOKENS = int(os.getenv("CONTEXT_MAX_TOKENS", "3000"))
CONTEXT_RERANK_TOP_K = int(os.getenv("CONTEXT_RERANK_TOP_K", "3"))
PROMPT_COMPRESSION_ENABLED = os.getenv("PROMPT_COMPRESSION_ENABLED", "true").lower() == "true"
LLM_MAX_NEW_TOKENS = int(os.getenv("LLM_MAX_NEW_TOKENS", "1024"))

CACHE_ENABLED = os.getenv("CACHE_ENABLED", "true").lower() == "true"
EMBEDDING_CACHE_SIZE = int(os.getenv("EMBEDDING_CACHE_SIZE", "10000"))
LLM_CACHE_SIZE = int(os.getenv("LLM_CACHE_SIZE", "1000"))
REQUEST_BATCH_SIZE = int(os.getenv("REQUEST_BATCH_SIZE", "16"))
ASYNC_PROCESSING_ENABLED = os.getenv("ASYNC_PROCESSING_ENABLED", "true").lower() == "true"

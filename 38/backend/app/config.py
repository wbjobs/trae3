import os

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
EXTRACTED_DIR = os.path.join(os.path.dirname(__file__), "extracted")

CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")
CHROMA_COLLECTION_NAME = "doc_embeddings"

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
LIGHTWEIGHT_MODEL = os.getenv("LIGHTWEIGHT_MODEL", os.getenv("OPENAI_MODEL", "gpt-4o-mini"))

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

MAX_BATCH_SIZE = 10
MAX_FILE_SIZE = 50 * 1024 * 1024

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EXTRACTED_DIR, exist_ok=True)

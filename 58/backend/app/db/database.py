import logging
from typing import Optional, Union

from app.config import settings
from app.db.memory_repo import InMemoryRepository

logger = logging.getLogger(__name__)

try:
    from motor.motor_asyncio import AsyncIOMotorClient
    MOTOR_AVAILABLE = True
except ImportError:
    AsyncIOMotorClient = None
    MOTOR_AVAILABLE = False
    logger.warning("motor 未安装，将使用内存模式")

try:
    from app.db.repository import DocumentRepository
    REPO_AVAILABLE = True
except ImportError:
    DocumentRepository = None
    REPO_AVAILABLE = False
    logger.warning("MongoDB repository 不可用，将使用内存模式")


class Database:
    _instance: Optional["Database"] = None
    _client = None
    _db = None
    _memory_repo: Optional[InMemoryRepository] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._connect()
        return cls._instance
    
    def _connect(self):
        if MOTOR_AVAILABLE and AsyncIOMotorClient is not None:
            try:
                self._client = AsyncIOMotorClient(settings.mongodb_url, serverSelectionTimeoutMS=3000)
                self._db = self._client[settings.mongodb_db_name]
                logger.info("MongoDB 连接成功")
                return
            except Exception as e:
                logger.warning(f"MongoDB 连接失败，将使用内存模式: {e}")
        
        self._client = None
        self._db = None
        self._memory_repo = InMemoryRepository()
    
    @property
    def db(self):
        return self._db
    
    @property
    def client(self):
        return self._client
    
    def is_connected(self) -> bool:
        return self._client is not None
    
    async def check_connection(self) -> bool:
        if not self._client:
            return False
        try:
            await self._client.admin.command('ping')
            return True
        except Exception:
            return False


database = Database()


def get_document_repository() -> Union[DocumentRepository, InMemoryRepository]:
    if REPO_AVAILABLE and database.db is not None:
        try:
            return DocumentRepository(database.db)
        except Exception as e:
            logger.warning(f"创建 MongoDB 仓库失败，使用内存仓库: {e}")
    
    if database._memory_repo is None:
        database._memory_repo = InMemoryRepository()
    return database._memory_repo

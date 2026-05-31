import logging
import json
import os
import time
from typing import Dict, List, Any, Optional
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class DatabaseConnectionPool:
    def __init__(self, config=None):
        self._config = config
        self._pool_size = config.get("storage", "pool_size") if config else 10
        self._db_type = config.get("storage", "db_type") if config else "postgresql"
        self._db_host = config.get("storage", "db_host") if config else "localhost"
        self._db_port = config.get("storage", "db_port") if config else 5432
        self._db_name = config.get("storage", "db_name") if config else "sediment_db"
        self._db_user = config.get("storage", "db_user") if config else "sediment_admin"
        self._db_password = config.get("storage", "db_password") if config else ""
        self._connections: List[Any] = []
        self._available: List[int] = []
        self._in_use: set = set()
        self._initialized = False

    def initialize(self):
        if self._initialized:
            return
        logger.info(
            f"Initializing connection pool: {self._db_type}://"
            f"{self._db_host}:{self._db_port}/{self._db_name} "
            f"pool_size={self._pool_size}"
        )
        for i in range(self._pool_size):
            conn = self._create_connection(i)
            self._connections.append(conn)
            self._available.append(i)
        self._initialized = True
        logger.info(f"Connection pool initialized with {self._pool_size} connections")

    def _create_connection(self, index: int) -> dict:
        return {
            "index": index,
            "host": self._db_host,
            "port": self._db_port,
            "database": self._db_name,
            "user": self._db_user,
            "connected_at": time.time(),
        }

    @contextmanager
    def acquire(self):
        if not self._initialized:
            self.initialize()
        if not self._available:
            logger.warning("No available connections, waiting...")
        conn_idx = self._available.pop(0) if self._available else None
        if conn_idx is not None:
            self._in_use.add(conn_idx)
            try:
                yield self._connections[conn_idx]
            finally:
                self._in_use.discard(conn_idx)
                self._available.append(conn_idx)
        else:
            yield None

    def close_all(self):
        self._connections.clear()
        self._available.clear()
        self._in_use.clear()
        self._initialized = False
        logger.info("All database connections closed")

    @property
    def available_count(self) -> int:
        return len(self._available)

    @property
    def in_use_count(self) -> int:
        return len(self._in_use)

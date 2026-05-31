from contextlib import contextmanager
from typing import Optional, Dict, Any, Iterator
from urllib.parse import quote_plus
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker, scoped_session
from sqlalchemy.pool import QueuePool
from common.exceptions import ConnectionError, DatabaseError
from common.models import Base


class DatabaseConfig:
    def __init__(
        self,
        host: str = "localhost",
        port: int = 5432,
        database: str = "ocean_db",
        username: str = "postgres",
        password: str = "",
        pool_size: int = 20,
        max_overflow: int = 30,
        pool_timeout: int = 30,
        pool_recycle: int = 1800,
        pool_pre_ping: bool = True,
        echo: bool = False,
        isolation_level: str = "READ COMMITTED",
    ) -> None:
        self.host = host
        self.port = port
        self.database = database
        self.username = username
        self.password = password
        self.pool_size = pool_size
        self.max_overflow = max_overflow
        self.pool_timeout = pool_timeout
        self.pool_recycle = pool_recycle
        self.pool_pre_ping = pool_pre_ping
        self.echo = echo
        self.isolation_level = isolation_level

    def get_url(self) -> str:
        encoded_password = quote_plus(self.password) if self.password else ""
        return f"postgresql+psycopg2://{self.username}:{encoded_password}@{self.host}:{self.port}/{self.database}"


class DatabaseManager:
    def __init__(self, config: Optional[DatabaseConfig] = None) -> None:
        self._config = config or DatabaseConfig()
        self._engine: Optional[Engine] = None
        self._session_factory: Optional[sessionmaker] = None
        self._scoped_session: Optional[scoped_session] = None
        self._initialize()

    def _initialize(self) -> None:
        try:
            self._engine = create_engine(
                self._config.get_url(),
                poolclass=QueuePool,
                pool_size=self._config.pool_size,
                max_overflow=self._config.max_overflow,
                pool_timeout=self._config.pool_timeout,
                pool_recycle=self._config.pool_recycle,
                pool_pre_ping=self._config.pool_pre_ping,
                echo=self._config.echo,
                isolation_level=self._config.isolation_level,
                connect_args={
                    "connect_timeout": 10,
                    "options": "-c statement_timeout=300000",
                },
            )
            self._session_factory = sessionmaker(
                bind=self._engine,
                autoflush=False,
                autocommit=False,
                expire_on_commit=False,
            )
            self._scoped_session = scoped_session(self._session_factory)
            self._register_event_listeners()
        except SQLAlchemyError as e:
            raise ConnectionError(f"Failed to initialize database: {str(e)}") from e

    def _register_event_listeners(self) -> None:
        @event.listens_for(self._engine, "connect")
        def _on_connect(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("SET TIME ZONE 'UTC'")
            cursor.execute("SET client_encoding = 'UTF8'")
            cursor.close()

        @event.listens_for(self._engine, "checkout")
        def _on_checkout(dbapi_connection, connection_record, connection_proxy):
            try:
                cursor = dbapi_connection.cursor()
                cursor.execute("SELECT 1")
                cursor.close()
            except Exception:
                connection_record.invalidate()

    @property
    def engine(self) -> Engine:
        if self._engine is None:
            raise ConnectionError("Database engine not initialized")
        return self._engine

    def create_tables(self) -> None:
        try:
            Base.metadata.create_all(self.engine)
        except SQLAlchemyError as e:
            raise DatabaseError(f"Failed to create tables: {str(e)}") from e

    def drop_tables(self) -> None:
        try:
            Base.metadata.drop_all(self.engine)
        except SQLAlchemyError as e:
            raise DatabaseError(f"Failed to drop tables: {str(e)}") from e

    def create_partition(self, table_name: str, partition_name: str, start_date: str, end_date: str) -> None:
        try:
            with self.engine.connect() as conn:
                conn.execute(text(
                    f"CREATE TABLE IF NOT EXISTS {partition_name} "
                    f"PARTITION OF {table_name} "
                    f"FOR VALUES FROM ('{start_date}') TO ('{end_date}')"
                ))
                conn.commit()
        except SQLAlchemyError as e:
            raise DatabaseError(f"Failed to create partition: {str(e)}") from e

    def create_index(self, table_name: str, index_name: str, columns: list[str], concurrently: bool = True) -> None:
        try:
            with self.engine.connect() as conn:
                concurrently_sql = "CONCURRENTLY " if concurrently else ""
                columns_sql = ", ".join(columns)
                conn.execute(text(
                    f"CREATE INDEX IF NOT EXISTS {concurrently_sql}{index_name} "
                    f"ON {table_name} ({columns_sql})"
                ))
                conn.commit()
        except SQLAlchemyError as e:
            raise DatabaseError(f"Failed to create index: {str(e)}") from e

    def session(self) -> Session:
        if self._session_factory is None:
            raise ConnectionError("Database not initialized")
        return self._session_factory()

    def scoped_session(self) -> scoped_session:
        if self._scoped_session is None:
            raise ConnectionError("Database not initialized")
        return self._scoped_session

    @contextmanager
    def get_session(self) -> Iterator[Session]:
        session = self.session()
        try:
            yield session
            session.commit()
        except SQLAlchemyError as e:
            session.rollback()
            raise DatabaseError(f"Session error: {str(e)}") from e
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()

    @contextmanager
    def transaction(self) -> Iterator[Session]:
        session = self.session()
        try:
            yield session
            session.commit()
        except SQLAlchemyError as e:
            session.rollback()
            raise DatabaseError(f"Transaction error: {str(e)}") from e
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()

    def execute(self, sql: str, params: Optional[Dict[str, Any]] = None) -> Any:
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text(sql), params or {})
                conn.commit()
                return result
        except SQLAlchemyError as e:
            raise DatabaseError(f"Execution error: {str(e)}") from e

    def health_check(self) -> bool:
        try:
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    def pool_status(self) -> Dict[str, Any]:
        if self._engine is None:
            return {}
        pool = self._engine.pool
        return {
            "size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
        }

    def dispose(self) -> None:
        if self._scoped_session:
            self._scoped_session.remove()
        if self._engine:
            self._engine.dispose()
            self._engine = None
            self._session_factory = None
            self._scoped_session = None


_default_manager: Optional[DatabaseManager] = None


def init_db(config: Optional[DatabaseConfig] = None) -> DatabaseManager:
    global _default_manager
    _default_manager = DatabaseManager(config)
    return _default_manager


def get_db() -> DatabaseManager:
    global _default_manager
    if _default_manager is None:
        _default_manager = DatabaseManager()
    return _default_manager


@contextmanager
def get_session() -> Iterator[Session]:
    db = get_db()
    with db.get_session() as session:
        yield session

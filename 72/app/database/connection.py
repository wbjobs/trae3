import logging
from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool, QueuePool

from app.config import settings

logger = logging.getLogger(__name__)

_common_engine_kwargs = {
    "echo": False,
}

if "sqlite" in settings.DATABASE_URL:
    _common_engine_kwargs.update({
        "connect_args": {"check_same_thread": False},
        "poolclass": StaticPool,
    })
else:
    _common_engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_timeout": 30,
        "pool_size": 20,
        "max_overflow": 30,
        "poolclass": QueuePool,
    })

engine = create_engine(
    settings.DATABASE_URL,
    **_common_engine_kwargs
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False
)

Base = declarative_base()

device_engine = create_engine(
    settings.DEVICE_DATABASE_URL,
    **_common_engine_kwargs
)

DeviceSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=device_engine,
    expire_on_commit=False
)

DeviceBase = declarative_base()

message_log_engine_kwargs = _common_engine_kwargs.copy()
if "sqlite" not in settings.MESSAGE_LOG_DATABASE_URL:
    message_log_engine_kwargs["pool_size"] = 30
    message_log_engine_kwargs["max_overflow"] = 50

message_log_engine = create_engine(
    settings.MESSAGE_LOG_DATABASE_URL,
    **message_log_engine_kwargs
)

MessageLogSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=message_log_engine,
    expire_on_commit=False
)

MessageLogBase = declarative_base()


if "sqlite" not in settings.DATABASE_URL:
    @event.listens_for(engine, "checkout")
    def _checkout_listener(dbapi_connection, connection_record, connection_proxy):
        if hasattr(engine.pool, 'status'):
            logger.debug(f"Database connection checked out, pool status: {engine.pool.status()}")


    @event.listens_for(engine, "checkin")
    def _checkin_listener(dbapi_connection, connection_record):
        if hasattr(engine.pool, 'status'):
            logger.debug(f"Database connection checked in, pool status: {engine.pool.status()}")


def get_db():
    db = None
    try:
        db = SessionLocal()
        yield db
    except Exception as e:
        logger.error(f"Error in database session: {e}", exc_info=True)
        if db:
            db.rollback()
        raise
    finally:
        if db:
            try:
                db.close()
            except Exception as e:
                logger.error(f"Error closing database session: {e}")


def get_device_db():
    db = None
    try:
        db = DeviceSessionLocal()
        yield db
    except Exception as e:
        logger.error(f"Error in device database session: {e}", exc_info=True)
        if db:
            db.rollback()
        raise
    finally:
        if db:
            try:
                db.close()
            except Exception as e:
                logger.error(f"Error closing device database session: {e}")


def get_message_log_db():
    db = None
    try:
        db = MessageLogSessionLocal()
        yield db
    except Exception as e:
        logger.error(f"Error in message log database session: {e}", exc_info=True)
        if db:
            db.rollback()
        raise
    finally:
        if db:
            try:
                db.close()
            except Exception as e:
                logger.error(f"Error closing message log database session: {e}")


def get_database_health() -> dict:
    health_status = {
        "main_db": "unknown",
        "device_db": "unknown",
        "message_log_db": "unknown",
        "main_pool": {},
        "device_pool": {},
        "message_log_pool": {}
    }

    def _get_pool_stats(pool_obj):
        stats = {}
        if hasattr(pool_obj, 'checkedin') and callable(pool_obj.checkedin):
            try:
                stats["checked_in"] = pool_obj.checkedin()
            except Exception:
                pass
        if hasattr(pool_obj, 'checkedout') and callable(pool_obj.checkedout):
            try:
                stats["checked_out"] = pool_obj.checkedout()
            except Exception:
                pass
        if hasattr(pool_obj, 'overflow') and callable(pool_obj.overflow):
            try:
                stats["overflow"] = pool_obj.overflow()
            except Exception:
                pass
        if hasattr(pool_obj, 'size') and callable(pool_obj.size):
            try:
                stats["size"] = pool_obj.size()
            except Exception:
                pass
        return stats

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            health_status["main_db"] = "healthy"
            health_status["main_pool"] = _get_pool_stats(engine.pool)
    except Exception as e:
        logger.error(f"Main database health check failed: {e}")
        health_status["main_db"] = f"unhealthy: {str(e)[:100]}"

    try:
        with device_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            health_status["device_db"] = "healthy"
            health_status["device_pool"] = _get_pool_stats(device_engine.pool)
    except Exception as e:
        logger.error(f"Device database health check failed: {e}")
        health_status["device_db"] = f"unhealthy: {str(e)[:100]}"

    try:
        with message_log_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            health_status["message_log_db"] = "healthy"
            health_status["message_log_pool"] = _get_pool_stats(message_log_engine.pool)
    except Exception as e:
        logger.error(f"Message log database health check failed: {e}")
        health_status["message_log_db"] = f"unhealthy: {str(e)[:100]}"

    return health_status

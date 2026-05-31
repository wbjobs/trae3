from app.database.connection import (
    Base,
    DeviceBase,
    MessageLogBase,
    engine,
    device_engine,
    message_log_engine,
    get_db,
    get_device_db,
    get_message_log_db,
    get_database_health,
)


def init_db():
    from app.tenant.models import Tenant
    from app.scheduler.models import ScheduledTask

    Base.metadata.create_all(bind=engine)

    from app.device.models import Device
    DeviceBase.metadata.create_all(bind=device_engine)

    from app.message_log.models import MessageLog
    MessageLogBase.metadata.create_all(bind=message_log_engine)


__all__ = [
    "Base",
    "DeviceBase",
    "MessageLogBase",
    "engine",
    "device_engine",
    "message_log_engine",
    "get_db",
    "get_device_db",
    "get_message_log_db",
    "get_database_health",
    "init_db",
]

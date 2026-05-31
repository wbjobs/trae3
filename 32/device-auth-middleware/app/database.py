from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.utils.config import get_config


_engine = None
_session_factory = None


def _build_db_url() -> str:
    cfg = get_config()["database"]
    return (
        f"{cfg['driver']}://{cfg['user']}:{cfg['password']}"
        f"@{cfg['host']}:{cfg['port']}/{cfg['name']}"
    )


def get_engine():
    global _engine
    if _engine is None:
        cfg = get_config()["database"]
        _engine = create_async_engine(
            _build_db_url(),
            pool_size=cfg["pool_size"],
            max_overflow=cfg["max_overflow"],
            pool_recycle=cfg["pool_recycle"],
            echo=False,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def get_db() -> AsyncSession:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

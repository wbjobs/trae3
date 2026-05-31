import redis.asyncio as aioredis

from app.utils.config import get_config

_redis_pool: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis_pool
    if _redis_pool is None:
        cfg = get_config()["redis"]
        _redis_pool = aioredis.Redis(
            host=cfg["host"],
            port=cfg["port"],
            db=cfg.get("db", 0),
            password=cfg.get("password") or None,
            max_connections=cfg.get("pool_size", 20),
            decode_responses=True,
        )
    return _redis_pool


async def close_redis():
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.close()
        _redis_pool = None

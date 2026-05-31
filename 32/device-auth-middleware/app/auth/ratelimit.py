import logging
import time

from app.redis import get_redis
from app.utils.config import get_config

logger = logging.getLogger(__name__)

DEFAULT_CAPACITY = 100
DEFAULT_REFILL_RATE = 10


class RateLimitService:

    @staticmethod
    async def check_rate_limit(
        tenant_id: str,
        endpoint: str,
        capacity: int | None = None,
        refill_rate: int | None = None,
    ) -> tuple[bool, dict]:
        cfg = get_config().get("ratelimit", {})
        if not cfg.get("enabled", True):
            return True, {}

        cap = capacity or cfg.get("capacity", DEFAULT_CAPACITY)
        rate = refill_rate or cfg.get("refill_rate", DEFAULT_REFILL_RATE)

        key = f"ratelimit:{tenant_id}:{endpoint}"
        redis = get_redis()

        now = time.time()
        window = 1.0

        pipe = redis.pipeline()
        pipe.hgetall(key)
        results = await pipe.execute()

        if results and results[0]:
            bucket = results[0]
            tokens = float(bucket.get("tokens", cap))
            last_refill = float(bucket.get("last_refill", now))
        else:
            tokens = float(cap)
            last_refill = now

        elapsed = now - last_refill
        tokens = min(float(cap), tokens + elapsed * rate)

        if tokens >= 1.0:
            tokens -= 1.0
            allowed = True
        else:
            allowed = False

        pipe = redis.pipeline()
        pipe.hset(key, mapping={
            "tokens": str(tokens),
            "last_refill": str(now),
        })
        pipe.expire(key, max(60, int(cap / rate) + 10) if rate > 0 else 3600)
        await pipe.execute()

        headers = {
            "X-RateLimit-Limit": str(cap),
            "X-RateLimit-Remaining": str(int(tokens)),
            "X-RateLimit-Reset": str(int(now + window)),
        }

        if not allowed:
            logger.warning(f"Rate limit exceeded: tenant={tenant_id}, endpoint={endpoint}")

        return allowed, headers

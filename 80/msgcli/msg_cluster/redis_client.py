import json
import time
from typing import List, Dict, Any, Optional, Callable
from redis import Redis
from redis.exceptions import RedisError, ConnectionError, TimeoutError

from ..common import get_logger, load_config


class RedisClient:
    def __init__(self, max_retries: int = 3, retry_delay: float = 1.0):
        config = load_config()
        self.redis_config = config.redis
        self.logger = get_logger("RedisClient")
        self.client = None
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    def _retry_on_failure(self, func: Callable, *args, **kwargs) -> Any:
        last_exception = None
        for attempt in range(self.max_retries):
            try:
                if not self.client:
                    self.connect()
                return func(*args, **kwargs)
            except (RedisError, ConnectionError, TimeoutError) as e:
                last_exception = e
                self.client = None
                if attempt < self.max_retries - 1:
                    self.logger.warning(
                        f"Redis operation failed (attempt {attempt + 1}/{self.max_retries}): {e}. "
                        f"Retrying in {self.retry_delay}s..."
                    )
                    time.sleep(self.retry_delay)
                else:
                    self.logger.error(f"Redis operation failed after {self.max_retries} attempts: {e}")
        raise last_exception if last_exception else Exception("Unknown Redis error")

    def connect(self) -> bool:
        try:
            self.client = Redis(
                host=self.redis_config.host,
                port=self.redis_config.port,
                password=self.redis_config.password,
                db=self.redis_config.db,
                decode_responses=True,
                socket_timeout=5,
                socket_connect_timeout=5,
                retry_on_timeout=True,
            )
            self.client.ping()
            self.logger.info("Redis client connected successfully")
            return True
        except RedisError as e:
            self.logger.error(f"Failed to connect Redis: {e}")
            self.client = None
            return False

    def set(self, key: str, value: Any, expire: Optional[int] = None) -> bool:
        try:
            def _set():
                if isinstance(value, (dict, list)):
                    v = json.dumps(value, ensure_ascii=False)
                else:
                    v = str(value)
                if expire:
                    self.client.setex(key, expire, v)
                else:
                    self.client.set(key, v)
                return True
            
            return self._retry_on_failure(_set)
        except Exception as e:
            self.logger.error(f"Failed to set key {key}: {e}")
            return False

    def get(self, key: str) -> Optional[Any]:
        try:
            def _get():
                value = self.client.get(key)
                if value:
                    try:
                        return json.loads(value)
                    except (json.JSONDecodeError, TypeError):
                        return value
                return None
            
            return self._retry_on_failure(_get)
        except Exception as e:
            self.logger.error(f"Failed to get key {key}: {e}")
            return None

    def delete(self, key: str) -> bool:
        try:
            def _delete():
                self.client.delete(key)
                return True
            
            return self._retry_on_failure(_delete)
        except Exception as e:
            self.logger.error(f"Failed to delete key {key}: {e}")
            return False

    def publish(self, channel: str, message: Dict[str, Any]) -> int:
        try:
            def _publish():
                return self.client.publish(channel, json.dumps(message, ensure_ascii=False))
            
            return self._retry_on_failure(_publish)
        except Exception as e:
            self.logger.error(f"Failed to publish to channel {channel}: {e}")
            return 0

    def subscribe(self, channel: str, callback):
        if not self.client:
            if not self.connect():
                return
        
        try:
            pubsub = self.client.pubsub()
            pubsub.subscribe(channel)
            
            for message in pubsub.listen():
                if message['type'] == 'message':
                    try:
                        data = json.loads(message['data'])
                        callback(data)
                    except json.JSONDecodeError:
                        callback(message['data'])
        except RedisError as e:
            self.logger.error(f"Failed to subscribe to channel {channel}: {e}")

    def lpush(self, key: str, value: Any) -> int:
        try:
            def _lpush():
                if isinstance(value, (dict, list)):
                    v = json.dumps(value, ensure_ascii=False)
                else:
                    v = str(value)
                return self.client.lpush(key, v)
            
            return self._retry_on_failure(_lpush)
        except Exception as e:
            self.logger.error(f"Failed to lpush to key {key}: {e}")
            return 0

    def rpop(self, key: str) -> Optional[Any]:
        try:
            def _rpop():
                value = self.client.rpop(key)
                if value:
                    try:
                        return json.loads(value)
                    except (json.JSONDecodeError, TypeError):
                        return value
                return None
            
            return self._retry_on_failure(_rpop)
        except Exception as e:
            self.logger.error(f"Failed to rpop from key {key}: {e}")
            return None

    def llen(self, key: str) -> int:
        try:
            def _llen():
                return self.client.llen(key)
            
            return self._retry_on_failure(_llen)
        except Exception as e:
            self.logger.error(f"Failed to get llen for key {key}: {e}")
            return 0

    def lrange(self, key: str, start: int = 0, end: int = -1) -> List[Any]:
        try:
            def _lrange():
                values = self.client.lrange(key, start, end)
                result = []
                for value in values:
                    try:
                        result.append(json.loads(value))
                    except (json.JSONDecodeError, TypeError):
                        result.append(value)
                return result
            
            return self._retry_on_failure(_lrange)
        except Exception as e:
            self.logger.error(f"Failed to lrange key {key}: {e}")
            return []

    def keys(self, pattern: str = "*") -> List[str]:
        try:
            def _keys():
                return self.client.keys(pattern)
            
            return self._retry_on_failure(_keys)
        except Exception as e:
            self.logger.error(f"Failed to get keys: {e}")
            return []

    def close(self):
        if self.client:
            try:
                self.client.close()
                self.logger.info("Redis client closed")
            except Exception as e:
                self.logger.warning(f"Error closing Redis client: {e}")
            self.client = None

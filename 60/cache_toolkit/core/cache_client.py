import time
from typing import Optional, List, Callable, Any
from functools import wraps
import redis
from redis.cluster import RedisCluster, ClusterNode
from cache_toolkit.models.node import CacheNode, ClusterInfo, NodeRole, NodeStatus
from cache_toolkit.utils.logger import get_logger

logger = get_logger()


class CacheClientError(Exception):
    pass


def with_retry(max_retries: int = 3, delay: float = 1.0, backoff: float = 2.0):
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(self: "CacheClient", *args, **kwargs) -> Any:
            last_exception = None
            current_delay = delay
            for attempt in range(max_retries):
                try:
                    return func(self, *args, **kwargs)
                except (
                    redis.exceptions.TimeoutError,
                    redis.exceptions.ConnectionError,
                    redis.exceptions.BusyLoadingError,
                ) as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        logger.warning(
                            f"{func.__name__} timeout on attempt {attempt + 1}/{max_retries}, "
                            f"retrying in {current_delay:.1f}s..."
                        )
                        time.sleep(current_delay)
                        current_delay *= backoff
                    else:
                        logger.error(
                            f"{func.__name__} failed after {max_retries} attempts: {e}"
                        )
            raise CacheClientError(
                f"Operation failed after {max_retries} retries: {last_exception}"
            )
        return wrapper
    return decorator


class CacheClient:
    def __init__(
        self,
        hosts: list,
        password: Optional[str] = None,
        timeout: int = 10,
        connect_timeout: int = 5,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        pool_size: int = 50,
        socket_keepalive: bool = True,
    ):
        self._hosts = hosts
        self._password = password
        self._timeout = timeout
        self._connect_timeout = connect_timeout
        self._max_retries = max_retries
        self._retry_delay = retry_delay
        self._pool_size = pool_size
        self._socket_keepalive = socket_keepalive
        self._clients: dict = {}
        self._cluster_client: Optional[RedisCluster] = None
        self._standalone_client: Optional[redis.Redis] = None
        self._is_cluster = False
        self._connected = False

    def connect(self, max_retries: Optional[int] = None) -> bool:
        max_retries = max_retries or self._max_retries
        startup_nodes = []
        for h in self._hosts:
            parts = h.split(":")
            host = parts[0]
            port = int(parts[1]) if len(parts) > 1 else 6379
            startup_nodes.append(ClusterNode(host=host, port=port))

        last_error = None
        current_delay = self._retry_delay

        for attempt in range(max_retries):
            try:
                self._cluster_client = RedisCluster(
                    startup_nodes=startup_nodes,
                    password=self._password,
                    decode_responses=True,
                    socket_timeout=self._timeout,
                    socket_connect_timeout=self._connect_timeout,
                    skip_full_coverage_check=True,
                    max_connections=self._pool_size,
                    socket_keepalive=self._socket_keepalive,
                    health_check_interval=30,
                )
                self._cluster_client.ping()
                self._is_cluster = True
                self._connected = True
                logger.info("Connected to Redis cluster mode")
                return True
            except (
                redis.exceptions.RedisClusterException,
                redis.exceptions.ConnectionError,
            ) as e:
                last_error = e
                logger.debug(f"Cluster mode connection failed: {e}")
            except Exception as e:
                last_error = e
                logger.debug(f"Cluster connection attempt {attempt + 1} failed: {e}")

            if attempt < max_retries - 1:
                time.sleep(current_delay)
                current_delay *= 1.5

        logger.debug("Falling back to standalone mode")

        for attempt in range(max_retries):
            try:
                first = startup_nodes[0]
                self._standalone_client = redis.Redis(
                    host=first.host,
                    port=first.port,
                    password=self._password,
                    decode_responses=True,
                    socket_timeout=self._timeout,
                    socket_connect_timeout=self._connect_timeout,
                    max_connections=self._pool_size,
                    socket_keepalive=self._socket_keepalive,
                    health_check_interval=30,
                )
                self._standalone_client.ping()
                self._is_cluster = False
                self._connected = True
                logger.info(f"Connected to standalone Redis at {first.host}:{first.port}")
                return True
            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    time.sleep(current_delay)
                    current_delay *= 1.5

        self._connected = False
        raise CacheClientError(f"Failed to connect after {max_retries} attempts: {last_error}")

    @property
    def is_cluster(self) -> bool:
        return self._is_cluster

    @property
    def connected(self) -> bool:
        return self._connected

    def _get_client(self):
        if not self._connected:
            raise CacheClientError("Not connected to cache")
        if self._is_cluster:
            return self._cluster_client
        return self._standalone_client

    @with_retry(max_retries=2)
    def get_cluster_info(self, cluster_name: str = "default") -> ClusterInfo:
        client = self._get_client()
        info = ClusterInfo(cluster_name=cluster_name)

        if self._is_cluster:
            try:
                cluster_info_raw = client.cluster_info()
                info.status = cluster_info_raw.get("cluster_state", "unknown")
                info.slots_assigned = int(cluster_info_raw.get("cluster_slots_assigned", 0))

                nodes_raw = client.cluster_nodes()
                for line in nodes_raw.split("\n"):
                    line = line.strip()
                    if not line:
                        continue
                    parts = line.split()
                    if len(parts) < 8:
                        continue
                    node_id = parts[0]
                    addr = parts[1]
                    flags = parts[2]

                    host_port = addr.split("@")[0]
                    h, p = host_port.rsplit(":", 1)

                    role = NodeRole.SLAVE if "slave" in flags else NodeRole.MASTER

                    if "fail" in flags or "disconnected" in flags:
                        status = NodeStatus.OFFLINE
                    elif "connected" in flags:
                        status = NodeStatus.ONLINE
                    else:
                        status = NodeStatus.UNKNOWN

                    slots = []
                    for slot_part in parts[8:]:
                        if slot_part.startswith("[") and slot_part.endswith("]"):
                            continue
                        if "-<-" in slot_part or "->-" in slot_part:
                            continue
                        if "-" in slot_part:
                            try:
                                start, end = slot_part.split("-")
                                slots.extend(range(int(start), int(end) + 1))
                            except ValueError:
                                pass
                        else:
                            try:
                                slots.append(int(slot_part))
                            except ValueError:
                                pass

                    node = CacheNode(
                        node_id=node_id,
                        host=h,
                        port=int(p),
                        role=role,
                        status=status,
                        password=self._password,
                        slots=slots,
                    )
                    info.nodes.append(node)
            except Exception as e:
                logger.warning(f"Error parsing cluster info: {e}")
                info.status = "parsing_error"
        else:
            try:
                standalone_info = client.info()
                node = CacheNode(
                    node_id="standalone",
                    host=self._hosts[0].split(":")[0],
                    port=int(self._hosts[0].split(":")[1]) if ":" in self._hosts[0] else 6379,
                    role=NodeRole.MASTER,
                    status=NodeStatus.ONLINE,
                    memory_used=standalone_info.get("used_memory"),
                    memory_total=standalone_info.get("maxmemory") or standalone_info.get("total_system_memory"),
                    keys_count=standalone_info.get("db0", {}).get("keys", 0) if isinstance(standalone_info.get("db0"), dict) else 0,
                )
                info.nodes.append(node)
                info.status = "ok"
            except Exception as e:
                logger.warning(f"Error getting standalone info: {e}")
                info.status = "error"

        return info

    def scan_keys(self, pattern: str = "*", count: int = 200, node_id: Optional[str] = None):
        client = self._get_client()
        keys = []

        if self._is_cluster:
            if node_id:
                target = self._get_node_client(node_id)
                keys = self._safe_scan(target, pattern, count)
            else:
                for master in self._get_master_nodes_safe():
                    try:
                        node_client = self._get_node_client(master.get("name", master.get("id", "")))
                        node_keys = self._safe_scan(node_client, pattern, count)
                        keys.extend(node_keys)
                    except Exception as e:
                        logger.warning(f"Failed to scan node {master.get('name', 'unknown')}: {e}")
        else:
            keys = self._safe_scan(client, pattern, count)

        return keys

    def _safe_scan(self, client, pattern: str, count: int) -> list:
        keys = []
        cursor = 0
        try:
            while True:
                try:
                    cursor, batch = client.scan(cursor=cursor, match=pattern, count=count)
                    keys.extend(batch)
                    if cursor == 0:
                        break
                except redis.exceptions.TimeoutError:
                    logger.warning(f"Scan timeout at cursor {cursor}, continuing...")
                    cursor = 0
                    break
        except Exception as e:
            logger.warning(f"Scan interrupted: {e}")
        return keys

    @with_retry(max_retries=2)
    def get_key_info(self, key: str) -> dict:
        client = self._get_client()
        key_type = client.type(key)
        ttl = client.ttl(key)

        size = 0
        try:
            if key_type == "string":
                size = client.strlen(key)
            elif key_type == "list":
                size = client.llen(key)
            elif key_type == "set":
                size = client.scard(key)
            elif key_type == "zset":
                size = client.zcard(key)
            elif key_type == "hash":
                size = client.hlen(key)
        except Exception:
            pass

        slot = None
        if self._is_cluster:
            try:
                slot = client.cluster_keyslot(key)
            except Exception:
                pass

        return {
            "key": key,
            "type": key_type,
            "ttl": ttl,
            "size": size,
            "slot": slot,
            "node_id": None,
        }

    def get_key_value(self, key: str, key_type: Optional[str] = None) -> Optional[str]:
        client = self._get_client()
        try:
            if key_type is None:
                key_type = client.type(key)

            if key_type == "string":
                return client.get(key)
            elif key_type == "list":
                return str(client.lrange(key, 0, -1))
            elif key_type == "set":
                return str(client.smembers(key))
            elif key_type == "zset":
                return str(client.zrange(key, 0, -1, withscores=True))
            elif key_type == "hash":
                return str(client.hgetall(key))
        except Exception as e:
            logger.warning(f"Error getting value for {key}: {e}")
        return None

    def delete_key(self, key: str) -> bool:
        try:
            client = self._get_client()
            return client.delete(key) > 0
        except Exception as e:
            logger.warning(f"Error deleting key {key}: {e}")
            return False

    def set_key(self, key: str, value: str, ttl: Optional[int] = None) -> bool:
        try:
            client = self._get_client()
            if ttl and ttl > 0:
                return client.setex(key, ttl, value)
            return client.set(key, value)
        except Exception as e:
            logger.warning(f"Error setting key {key}: {e}")
            return False

    def get_node_memory(self, node_id: Optional[str] = None) -> dict:
        try:
            if node_id:
                node_client = self._get_node_client(node_id)
                info = node_client.info("memory")
            else:
                client = self._get_client()
                info = client.info("memory")
            return {
                "used_memory": info.get("used_memory"),
                "used_memory_human": info.get("used_memory_human"),
                "maxmemory": info.get("maxmemory"),
                "maxmemory_human": info.get("maxmemory_human"),
                "used_memory_peak": info.get("used_memory_peak"),
                "used_memory_peak_human": info.get("used_memory_peak_human"),
            }
        except Exception as e:
            logger.warning(f"Error getting memory info: {e}")
            return {"error": str(e)}

    def _get_master_nodes_safe(self) -> list:
        if not self._is_cluster or not self._cluster_client:
            return []
        try:
            return list(self._cluster_client.get_nodes())
        except Exception as e:
            logger.warning(f"Error getting master nodes: {e}")
            return []

    def _get_node_client(self, node_id: str):
        if node_id in self._clients:
            return self._clients[node_id]

        if not self._cluster_client:
            raise CacheClientError("Not connected to cluster")

        try:
            for node in self._cluster_client.get_nodes():
                if node.name == node_id or node.name.startswith(node_id):
                    r = redis.Redis(
                        host=node.host,
                        port=node.port,
                        password=self._password,
                        decode_responses=True,
                        socket_timeout=self._timeout,
                        socket_connect_timeout=self._connect_timeout,
                        max_connections=self._pool_size,
                        socket_keepalive=self._socket_keepalive,
                    )
                    self._clients[node_id] = r
                    return r
        except Exception as e:
            raise CacheClientError(f"Error creating node client: {e}")

        raise CacheClientError(f"Node {node_id} not found in cluster")

    def close(self):
        if self._cluster_client:
            try:
                self._cluster_client.close()
            except Exception:
                pass
        if self._standalone_client:
            try:
                self._standalone_client.close()
            except Exception:
                pass
        for c in self._clients.values():
            try:
                c.close()
            except Exception:
                pass
        self._clients.clear()
        self._connected = False

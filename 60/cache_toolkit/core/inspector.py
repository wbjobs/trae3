from typing import Optional, List
from collections import Counter
from cache_toolkit.core.cache_client import CacheClient, CacheClientError
from cache_toolkit.models.node import KeyInfo, NodeStatus
from cache_toolkit.utils.logger import get_logger
from cache_toolkit.utils.progress import ProgressTracker

logger = get_logger()


class Inspector:
    def __init__(self, client: CacheClient):
        self._client = client

    def health_check(self, max_retries: int = 2) -> dict:
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                cluster_info = self._client.get_cluster_info()
                return self._analyze_health(cluster_info)
            except CacheClientError as e:
                last_error = str(e)
                if attempt < max_retries:
                    import time
                    time.sleep(1)
                    logger.warning(f"Health check attempt {attempt + 1} failed, retrying...")
                    continue
            break
        return {
            "status": "error",
            "error": last_error or "Unknown error",
            "healthy": False,
        }

    def _analyze_health(self, cluster_info) -> dict:
        masters = cluster_info.get_masters()
        slaves = cluster_info.get_slaves()

        online_nodes = []
        offline_nodes = []
        unknown_nodes = []

        for n in cluster_info.nodes:
            if n.status == NodeStatus.ONLINE:
                online_nodes.append(n)
            elif n.status == NodeStatus.OFFLINE:
                offline_nodes.append(n)
            else:
                unknown_nodes.append(n)

        warnings = []

        if offline_nodes:
            warnings.append(
                f"{len(offline_nodes)} node(s) confirmed offline: "
                f"{[n.address for n in offline_nodes]}"
            )

        if unknown_nodes:
            warnings.append(
                f"{len(unknown_nodes)} node(s) status unknown: "
                f"{[n.address for n in unknown_nodes]}"
            )

        if self._client.is_cluster and cluster_info.slots_assigned < cluster_info.slots_total:
            unassigned = cluster_info.slots_total - cluster_info.slots_assigned
            if unassigned > 100:
                warnings.append(f"{unassigned} slot(s) unassigned")

        if not self._client.is_cluster and len(masters) == 0:
            warnings.append("No master nodes found")

        critical_memory_warn_threshold = 0.9
        warning_memory_threshold = 0.8

        for node in masters:
            try:
                ratio = node.memory_usage_ratio
                if ratio is not None:
                    if ratio > critical_memory_warn_threshold:
                        warnings.append(
                            f"Node {node.address} memory usage > 90%: {ratio:.1%} (CRITICAL)")
                    elif ratio > warning_memory_threshold:
                        warnings.append(
                            f"Node {node.address} memory usage > 80%: {ratio:.1%}")
            except Exception:
                pass

        healthy = (
            len(offline_nodes) == 0
            and cluster_info.status in ("ok", "connected")
            and not any("CRITICAL" in w for w in warnings)
        )

        return {
            "cluster_name": cluster_info.cluster_name,
            "status": cluster_info.status,
            "is_cluster": self._client.is_cluster,
            "total_nodes": len(cluster_info.nodes),
            "online_nodes": len(online_nodes),
            "offline_nodes": len(offline_nodes),
            "unknown_nodes": len(unknown_nodes),
            "masters": len(masters),
            "slaves": len(slaves),
            "slots_total": cluster_info.slots_total,
            "slots_assigned": cluster_info.slots_assigned,
            "warnings": warnings,
            "healthy": healthy,
        }

    def scan_keys(
        self,
        pattern: str = "*",
        scan_count: int = 200,
        node_id: Optional[str] = None,
        max_errors: int = 100,
    ) -> List[KeyInfo]:
        logger.info(f"Scanning keys with pattern: {pattern}")
        raw_keys = self._client.scan_keys(pattern=pattern, count=scan_count, node_id=node_id)

        key_infos = []
        error_count = 0

        for k in raw_keys:
            try:
                info = self._safe_get_key_info(k)
                if info:
                    key_infos.append(info)
            except Exception as e:
                error_count += 1
                if error_count <= max_errors:
                    logger.warning(f"Failed to get info for key {k}: {e}")
                elif error_count == max_errors + 1:
                    logger.warning("Too many errors, suppressing further warnings...")

        if error_count > 0:
            logger.info(f"Scan completed with {error_count} errors out of {len(raw_keys)} keys")

        return key_infos

    def _safe_get_key_info(self, key: str) -> Optional[KeyInfo]:
        try:
            info = self._client.get_key_info(key)
            return KeyInfo(
                key=key,
                type=info["type"],
                ttl=info["ttl"],
                size=info["size"],
                node_id=info.get("node_id"),
                slot=info.get("slot"),
            )
        except Exception:
            return None

    def key_stats(self, keys: List[KeyInfo]) -> dict:
        type_counter = Counter(k.type for k in keys)
        ttl_no_expire = sum(1 for k in keys if k.ttl == -1)
        ttl_expiring = sum(1 for k in keys if 0 < k.ttl < 3600)
        total_size = sum(k.size for k in keys)

        return {
            "total_keys": len(keys),
            "types_distribution": dict(type_counter),
            "keys_no_ttl": ttl_no_expire,
            "keys_expiring_soon": ttl_expiring,
            "total_logical_size": total_size,
        }

    def inspect_ttl(self, pattern: str = "*", scan_count: int = 200) -> dict:
        keys = self.scan_keys(pattern=pattern, scan_count=scan_count)
        no_ttl = [k for k in keys if k.ttl == -1]
        expiring_soon = [k for k in keys if 0 < k.ttl < 3600]
        expired = [k for k in keys if k.ttl == -2]

        return {
            "pattern": pattern,
            "total_scanned": len(keys),
            "keys_no_ttl": len(no_ttl),
            "keys_expiring_within_1h": len(expiring_soon),
            "keys_already_expired": len(expired),
            "no_ttl_keys_sample": [k.key for k in no_ttl[:20]],
            "expiring_soon_sample": [{"key": k.key, "ttl": k.ttl} for k in expiring_soon[:20]],
        }

    def inspect_memory(self, pattern: str = "*", top_n: int = 20, scan_count: int = 200) -> dict:
        keys = self.scan_keys(pattern=pattern, scan_count=scan_count)
        sorted_keys = sorted(keys, key=lambda k: k.size, reverse=True)
        top_keys = sorted_keys[:top_n]

        return {
            "pattern": pattern,
            "total_scanned": len(keys),
            "top_keys_by_size": [k.to_dict() for k in top_keys],
            "total_logical_size": sum(k.size for k in keys),
            "avg_key_size": round(sum(k.size for k in keys) / len(keys), 2) if keys else 0,
        }

    def inspect_by_pattern(self, patterns: List[str], scan_count: int = 200) -> dict:
        results = {}
        for pattern in patterns:
            try:
                keys = self.scan_keys(pattern=pattern, scan_count=scan_count)
                results[pattern] = {
                    "count": len(keys),
                    "types": dict(Counter(k.type for k in keys)),
                    "sample_keys": [k.key for k in keys[:5]],
                }
            except Exception as e:
                results[pattern] = {
                    "error": str(e),
                    "count": 0,
                    "types": {},
                    "sample_keys": [],
                }
        return results

import hashlib
import bisect
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models import Device, FirmwareVersion, GrayscaleRule, GrayscaleStrategy, VersionStatus
from app.repository import DeviceRepository, GrayscaleRepository, VersionRepository
from app.schemas import GrayscaleRuleCreate, GrayscaleRuleUpdate
from app.cache import grayscale_cache


class ConsistentHash:
    def __init__(self, nodes: list[str] | None = None, replicas: int = 160):
        self._replicas = replicas
        self._ring: list[int] = []
        self._nodes: dict[int, str] = {}
        if nodes:
            for node in nodes:
                self.add_node(node)

    def _hash(self, key: str) -> int:
        h = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return int(h, 16)

    def add_node(self, node: str) -> None:
        for i in range(self._replicas):
            replica_key = f"{node}:{i}"
            h = self._hash(replica_key)
            bisect.insort(self._ring, h)
            self._nodes[h] = node

    def remove_node(self, node: str) -> None:
        for i in range(self._replicas):
            replica_key = f"{node}:{i}"
            h = self._hash(replica_key)
            if h in self._nodes:
                idx = bisect.bisect_left(self._ring, h)
                if idx < len(self._ring) and self._ring[idx] == h:
                    self._ring.pop(idx)
                del self._nodes[h]

    def get_node(self, key: str) -> str | None:
        if not self._ring:
            return None
        h = self._hash(key)
        idx = bisect.bisect(self._ring, h) % len(self._ring)
        return self._nodes[self._ring[idx]]


class VersionMatcher:
    @staticmethod
    def parse_version(v: str) -> tuple[int, ...]:
        parts = []
        for part in v.replace("v", "").split("."):
            try:
                parts.append(int(part))
            except ValueError:
                parts.append(0)
        while len(parts) < 3:
            parts.append(0)
        return tuple(parts[:3])

    @staticmethod
    def matches(device_version: str, min_version: str, max_version: str) -> bool:
        if not device_version:
            return True
        dv = VersionMatcher.parse_version(device_version)
        if min_version:
            if dv < VersionMatcher.parse_version(min_version):
                return False
        if max_version:
            if dv > VersionMatcher.parse_version(max_version):
                return False
        return True


def create_grayscale_rule(db: Session, data: GrayscaleRuleCreate) -> GrayscaleRule:
    repo = GrayscaleRepository(db)
    version_repo = VersionRepository(db)
    version = version_repo.get_by_id(data.version_id)
    if not version:
        raise ValueError("Version not found")
    if version.status not in (VersionStatus.GRAYSCALE, VersionStatus.TESTING):
        raise ValueError("Grayscale rules can only be added to TESTING or GRAYSCALE versions")

    rule = repo.create(**data.model_dump())
    db.commit()
    db.refresh(rule)
    grayscale_cache.invalidate_pattern(f"grayscale:version:{data.version_id}")
    return rule


def get_grayscale_rules(db: Session, version_id: str) -> list[GrayscaleRule]:
    repo = GrayscaleRepository(db)
    return repo.list_active_by_version(version_id)


def update_grayscale_rule(db: Session, rule_id: str, data: GrayscaleRuleUpdate) -> GrayscaleRule | None:
    repo = GrayscaleRepository(db)
    rule = repo.get_by_id(rule_id)
    if not rule:
        return None
    update_data = data.model_dump(exclude_unset=True)
    repo.update(rule, **update_data)
    db.commit()
    db.refresh(rule)
    grayscale_cache.invalidate_pattern(f"grayscale:version:{rule.version_id}")
    return rule


def delete_grayscale_rule(db: Session, rule_id: str) -> bool:
    repo = GrayscaleRepository(db)
    rule = repo.get_by_id(rule_id)
    if not rule:
        return False
    version_id = rule.version_id
    repo.delete(rule)
    db.commit()
    grayscale_cache.invalidate_pattern(f"grayscale:version:{version_id}")
    return True


def _stable_hash(key: str) -> int:
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return int(h, 16) % 10000


def match_grayscale_devices(db: Session, version_id: str) -> list[str]:
    version_repo = VersionRepository(db)
    version = version_repo.get_by_id(version_id)
    if not version:
        return []

    rules = get_grayscale_rules(db, version_id)
    if not rules:
        return []

    device_repo = DeviceRepository(db)
    all_devices = device_repo.list_by_filters(product_model=version.product_model, limit=10000)

    rules.sort(key=lambda r: (-r.priority, r.created_at))

    matched_device_ids: set[str] = set()
    matched_sources: dict[str, set[str]] = defaultdict(set)

    for rule in rules:
        if rule.strategy == GrayscaleStrategy.DEVICE_LIST:
            sn_list = [sn.strip() for sn in rule.device_list.split(",") if sn.strip()]
            if not sn_list:
                continue
            devices = device_repo.list_by_filters(product_model=version.product_model)
            device_map = {d.device_sn: d for d in devices}
            for sn in sn_list:
                if sn in device_map:
                    device = device_map[sn]
                    if not VersionMatcher.matches(device.current_version, rule.min_version, rule.max_version):
                        continue
                    matched_device_ids.add(device.id)
                    matched_sources[device.id].add("device_list")

        elif rule.strategy == GrayscaleStrategy.REGION:
            region_list = [r.strip() for r in rule.region_list.split(",") if r.strip()]
            if not region_list:
                continue
            devices = device_repo.list_by_filters(product_model=version.product_model)
            for device in devices:
                if device.region not in region_list:
                    continue
                if not VersionMatcher.matches(device.current_version, rule.min_version, rule.max_version):
                    continue
                matched_device_ids.add(device.id)
                matched_sources[device.id].add("region")

        elif rule.strategy == GrayscaleStrategy.PERCENTAGE:
            if not all_devices:
                continue
            target_count = max(1, int(len(all_devices) * rule.percentage / 100.0))

            scored = []
            for device in all_devices:
                if not VersionMatcher.matches(device.current_version, rule.min_version, rule.max_version):
                    continue
                bucket = _stable_hash(f"{device.device_sn}:{version.version_code}")
                scored.append((bucket, device.id))

            scored.sort(key=lambda x: x[0])
            for _, device_id in scored[:target_count]:
                matched_device_ids.add(device_id)
                matched_sources[device_id].add("percentage")

        elif rule.strategy == GrayscaleStrategy.CONSISTENT_HASH:
            if not all_devices:
                continue
            target_percentage = max(1.0, rule.percentage) / 100.0

            nodes = [f"selected_{i}" for i in range(100)]
            hash_ring = ConsistentHash(nodes, replicas=rule.hash_ring_nodes)

            target_count = max(1, int(len(all_devices) * target_percentage))
            selected_node = hash_ring.get_node(f"version:{version.version_code}")

            scored = []
            for device in all_devices:
                if not VersionMatcher.matches(device.current_version, rule.min_version, rule.max_version):
                    continue
                bucket = _stable_hash(f"{device.device_sn}:{version.version_code}")
                scored.append((bucket, device.id))

            scored.sort(key=lambda x: x[0])
            for _, device_id in scored[:target_count]:
                matched_device_ids.add(device_id)
                matched_sources[device_id].add("consistent_hash")

        elif rule.strategy == GrayscaleStrategy.VERSION_RANGE:
            if not all_devices:
                continue
            for device in all_devices:
                if VersionMatcher.matches(device.current_version, rule.min_version, rule.max_version):
                    matched_device_ids.add(device.id)
                    matched_sources[device.id].add("version_range")

    return list(matched_device_ids)

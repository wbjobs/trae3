import json
import random
import hashlib
import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
import ipaddress

logger = logging.getLogger(__name__)


class CanaryStrategy(Enum):
    PERCENTAGE = "percentage"
    IP_WHITELIST = "ip_whitelist"
    LABEL_MATCH = "label_match"
    HEADER_MATCH = "header_match"


class CanaryStatus(Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


@dataclass
class CanaryRule:
    strategy: CanaryStrategy
    value: Any
    description: str = ""


@dataclass
class CanaryRelease:
    release_id: str
    data_id: str
    group: str
    namespace: str
    cluster: str
    new_content: str
    old_content: Optional[str] = None
    config_type: str = "yaml"
    status: CanaryStatus = CanaryStatus.DRAFT
    rules: List[CanaryRule] = field(default_factory=list)
    traffic_percentage: int = 10
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    hit_count: int = 0
    success_count: int = 0


class CanaryTargetSelector:
    def __init__(self, release: CanaryRelease):
        self.release = release
    
    def should_use_canary(self, **context):
        if self.release.status != CanaryStatus.ACTIVE:
            return False
        
        match_rules = [
            self._check_rule(rule, context) for rule in self.release.rules
        ]
        
        if match_rules and any(match_rules):
            return True
        
        return self._check_percentage(context)
    
    def _check_rule(self, rule: CanaryRule, context: Dict[str, Any]) -> bool:
        if rule.strategy == CanaryStrategy.IP_WHITELIST:
            return self._check_ip_whitelist(rule, context)
        elif rule.strategy == CanaryStrategy.LABEL_MATCH:
            return self._check_label_match(rule, context)
        elif rule.strategy == CanaryStrategy.HEADER_MATCH:
            return self._check_header_match(rule, context)
        elif rule.strategy == CanaryStrategy.PERCENTAGE:
            return random.randint(1, 100) <= (rule.value if isinstance(rule.value, int) else int(rule.value))
        
        return False
    
    def _check_ip_whitelist(self, rule: CanaryRule, context: Dict[str, Any]) -> bool:
        client_ip = context.get("client_ip", "")
        whitelist = rule.value if isinstance(rule.value, list) else [rule.value]
        
        if not client_ip:
            return False
        
        try:
            ip = ipaddress.ip_address(client_ip)
            for ip_range in whitelist:
                if "/" in ip_range:
                    network = ipaddress.ip_network(ip_range, strict=False)
                    if ip in network:
                        return True
                elif client_ip == ip_range:
                    return True
        except ValueError:
            pass
        
        return False
    
    def _check_label_match(self, rule: CanaryRule, context: Dict[str, Any]) -> bool:
        labels = context.get("labels", {})
        required_labels = rule.value if isinstance(rule.value, dict) else {}
        
        for key, expected_value in required_labels.items():
            if labels.get(key) != expected_value:
                return False
        
        return True
    
    def _check_header_match(self, rule: CanaryRule, context: Dict[str, Any]) -> bool:
        headers = context.get("headers", {})
        required_headers = rule.value if isinstance(rule.value, dict) else {}
        
        for key, expected_value in required_headers.items():
            if headers.get(key) != expected_value:
                return False
        
        return True
    
    def _check_percentage(self, context: Dict[str, Any]) -> bool:
        if self.release.traffic_percentage <= 0:
            return False
        if self.release.traffic_percentage >= 100:
            return True
        
        identifier = context.get("request_id") or context.get("client_ip") or str(random.random())
        hash_val = int(hashlib.md5(identifier.encode()).hexdigest(), 16) % 100
        return hash_val < self.release.traffic_percentage


class CanaryReleaseManager:
    def __init__(self):
        self._releases: Dict[str, CanaryRelease] = {}
        self._selectors: Dict[str, CanaryTargetSelector] = {}
    
    def create_release(
        self,
        data_id: str,
        group: str,
        namespace: str,
        cluster: str,
        new_content: str,
        old_content: Optional[str] = None,
        config_type: str = "yaml",
        rules: Optional[List[CanaryRule]] = None,
        traffic_percentage: int = 10
    ) -> CanaryRelease:
        release_id = f"canary_{data_id}_{int(datetime.now().timestamp())}"
        
        release = CanaryRelease(
            release_id=release_id,
            data_id=data_id,
            group=group,
            namespace=namespace,
            cluster=cluster,
            new_content=new_content,
            old_content=old_content,
            config_type=config_type,
            rules=rules or [],
            traffic_percentage=traffic_percentage
        )
        
        self._releases[release_id] = release
        self._selectors[release_id] = CanaryTargetSelector(release)
        
        logger.info(f"创建灰度发布: {release_id}")
        
        return release
    
    def start_release(self, release_id: str):
        if release_id not in self._releases:
            raise ValueError(f"灰度发布不存在: {release_id}")
        
        release = self._releases[release_id]
        release.status = CanaryStatus.ACTIVE
        release.updated_at = datetime.now()
        logger.info(f"启动灰度发布: {release_id}")
    
    def pause_release(self, release_id: str):
        if release_id in self._releases:
            release = self._releases[release_id]
            release.status = CanaryStatus.PAUSED
            release.updated_at = datetime.now()
            logger.info(f"暂停灰度发布: {release_id}")
    
    def complete_release(self, release_id: str):
        if release_id in self._releases:
            release = self._releases[release_id]
            release.status = CanaryStatus.COMPLETED
            release.updated_at = datetime.now()
            logger.info(f"完成灰度发布: {release_id}")
    
    def cancel_release(self, release_id: str):
        if release_id in self._releases:
            release = self._releases[release_id]
            release.status = CanaryStatus.CANCELLED
            release.updated_at = datetime.now()
            logger.info(f"取消灰度发布: {release_id}")
    
    def get_config_for_request(self, release_id: str, **context) -> Optional[str]:
        if release_id not in self._selectors:
            return None
        
        selector = self._selectors[release_id]
        release = self._releases[release_id]
        
        use_new = selector.should_use_canary(**context)
        
        release.hit_count += 1
        
        if use_new:
            release.success_count += 1
            return release.new_content
        else:
            return release.old_content
    
    def update_traffic_percentage(self, release_id: str, percentage: int):
        if release_id in self._releases:
            release = self._releases[release_id]
            release.traffic_percentage = max(0, min(100, percentage))
            release.updated_at = datetime.now()
            logger.info(f"更新灰度流量比例: {release_id} -> {percentage}%")
    
    def get_active_releases(self) -> List[CanaryRelease]:
        return [
            release
            for release in self._releases.values()
            if release.status == CanaryStatus.ACTIVE
        ]
    
    def get_release_stats(self, release_id: str) -> Dict[str, Any]:
        if release_id not in self._releases:
            return {}
        
        release = self._releases[release_id]
        canary_ratio = f"{(release.success_count / release.hit_count * 100):.1f}%" if release.hit_count > 0 else "0%"
        
        return {
            "release_id": release.release_id,
            "data_id": release.data_id,
            "status": release.status.value,
            "hit_count": release.hit_count,
            "success_count": release.success_count,
            "traffic_percentage": release.traffic_percentage,
            "canary_ratio": canary_ratio
        }


def build_ip_whitelist_rule(ip_list: List[str]) -> CanaryRule:
    return CanaryRule(
        strategy=CanaryStrategy.IP_WHITELIST,
        value=ip_list,
        description=f"IP白名单: {', '.join(ip_list)}"
    )


def build_label_rule(labels: Dict[str, str]) -> CanaryRule:
    return CanaryRule(
        strategy=CanaryStrategy.LABEL_MATCH,
        value=labels,
        description=f"标签匹配: {json.dumps(labels, ensure_ascii=False)}"
    )


def build_header_rule(headers: Dict[str, str]) -> CanaryRule:
    return CanaryRule(
        strategy=CanaryStrategy.HEADER_MATCH,
        value=headers,
        description=f"Header匹配: {json.dumps(headers, ensure_ascii=False)}"
    )

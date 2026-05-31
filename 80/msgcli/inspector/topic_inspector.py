import time
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime

from ..common import get_logger
from ..msg_cluster import KafkaClient
from ..configdb import ConfigDBClient


@dataclass
class TopicHealth:
    name: str
    exists: bool = True
    partition_count: int = 0
    under_replicated_partitions: int = 0
    has_under_min_isr: bool = False
    leader_count: int = 0
    message_rate: float = 0.0
    status: str = "unknown"
    issues: List[str] = field(default_factory=list)


@dataclass
class InspectionReport:
    timestamp: datetime
    total_topics: int = 0
    healthy_topics: int = 0
    warning_topics: int = 0
    critical_topics: int = 0
    topics: List[TopicHealth] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp.isoformat(),
            "total_topics": self.total_topics,
            "healthy_topics": self.healthy_topics,
            "warning_topics": self.warning_topics,
            "critical_topics": self.critical_topics,
            "topics": [
                {
                    "name": t.name,
                    "exists": t.exists,
                    "partition_count": t.partition_count,
                    "under_replicated_partitions": t.under_replicated_partitions,
                    "has_under_min_isr": t.has_under_min_isr,
                    "leader_count": t.leader_count,
                    "message_rate": t.message_rate,
                    "status": t.status,
                    "issues": t.issues,
                }
                for t in self.topics
            ],
            "summary": self.summary,
        }


class TopicInspector:
    def __init__(self):
        self.logger = get_logger("TopicInspector")
        self.kafka_client = KafkaClient()
        self.config_db = ConfigDBClient()

    def inspect_all(self, check_config_sync: bool = True) -> InspectionReport:
        report = InspectionReport(timestamp=datetime.now())
        
        self.logger.info("Starting topic inspection...")
        
        kafka_topics = self.kafka_client.list_topics()
        self.logger.info(f"Found {len(kafka_topics)} topics in Kafka")
        
        config_topics = []
        if check_config_sync:
            config_topics = [t.name for t in self.config_db.list_topics()]
            self.logger.info(f"Found {len(config_topics)} topics in config DB")
        
        report.total_topics = len(kafka_topics)
        
        for topic_name in kafka_topics:
            health = self._inspect_topic(topic_name)
            report.topics.append(health)
            
            if health.status == "healthy":
                report.healthy_topics += 1
            elif health.status == "warning":
                report.warning_topics += 1
            elif health.status == "critical":
                report.critical_topics += 1
        
        if check_config_sync:
            report.summary["config_sync"] = self._check_config_sync(kafka_topics, config_topics)
        
        report.summary["inspection_time"] = datetime.now().isoformat()
        
        self.logger.info(
            f"Inspection complete: {report.healthy_topics} healthy, "
            f"{report.warning_topics} warning, {report.critical_topics} critical"
        )
        
        return report

    def inspect_topic(self, topic_name: str) -> TopicHealth:
        self.logger.info(f"Inspecting topic: {topic_name}")
        return self._inspect_topic(topic_name)

    def _inspect_topic(self, topic_name: str) -> TopicHealth:
        health = TopicHealth(name=topic_name)
        
        try:
            topics = self.kafka_client.list_topics()
            if topic_name not in topics:
                health.exists = False
                health.status = "critical"
                health.issues.append("Topic does not exist in Kafka")
                return health
            
            config = self.kafka_client.get_topic_config(topic_name)
            if config:
                health.partition_count = self._get_partition_count(config)
            
            health = self._check_partition_health(topic_name, health)
            
            health.message_rate = self._estimate_message_rate(topic_name)
            
            if not health.issues:
                health.status = "healthy"
            elif any("critical" in issue.lower() for issue in health.issues):
                health.status = "critical"
            else:
                health.status = "warning"
        
        except (ConnectionError, TimeoutError) as e:
            self.logger.warning(f"Connection error inspecting topic {topic_name}: {e}")
            health.issues.append("Connection timeout - cluster may be temporarily unavailable")
            health.status = "unknown"
        except Exception as e:
            self.logger.error(f"Error inspecting topic {topic_name}: {e}")
            health.issues.append(f"Inspection error: {str(e)}")
            health.status = "unknown"
        
        return health

    def _check_partition_health(self, topic_name: str, health: TopicHealth) -> TopicHealth:
        try:
            groups = self.kafka_client.get_consumer_groups()
            for group_id in groups:
                lag_info = self.kafka_client.get_consumer_group_lag(group_id)
                for key in lag_info:
                    if key.startswith(f"{topic_name}-"):
                        health.leader_count += 1
        except (ConnectionError, TimeoutError) as e:
            self.logger.warning(f"Connection error checking partition health for {topic_name}: {e}")
        except Exception as e:
            self.logger.debug(f"Could not check partition health for {topic_name}: {e}")
        
        return health

    def _get_partition_count(self, config: Dict[str, Any]) -> int:
        try:
            for key in config:
                if "partition" in key.lower() or "partitions" in key.lower():
                    value = config[key]
                    if isinstance(value, str) and value.isdigit():
                        return int(value)
                    elif isinstance(value, int):
                        return value
        except Exception:
            pass
        return 0

    def _estimate_message_rate(self, topic_name: str) -> float:
        return 0.0

    def _check_config_sync(self, kafka_topics: List[str], config_topics: List[str]) -> Dict[str, Any]:
        only_in_kafka = set(kafka_topics) - set(config_topics)
        only_in_config = set(config_topics) - set(kafka_topics)
        
        return {
            "topics_only_in_kafka": list(only_in_kafka),
            "topics_only_in_config": list(only_in_config),
            "in_sync_count": len(set(kafka_topics) & set(config_topics)),
            "is_synced": len(only_in_kafka) == 0 and len(only_in_config) == 0,
        }

    def generate_report(self, report: InspectionReport, output_format: str = "text") -> str:
        if output_format == "json":
            import json
            return json.dumps(report.to_dict(), indent=2)
        elif output_format == "markdown":
            return self._generate_markdown_report(report)
        else:
            return self._generate_text_report(report)

    def _generate_text_report(self, report: InspectionReport) -> str:
        lines = [
            "=" * 60,
            f"TOPIC INSPECTION REPORT - {report.timestamp.strftime('%Y-%m-%d %H:%M:%S')}",
            "=" * 60,
            "",
            f"Total Topics: {report.total_topics}",
            f"  Healthy:   {report.healthy_topics}",
            f"  Warning:   {report.warning_topics}",
            f"  Critical:  {report.critical_topics}",
            "",
            "-" * 60,
            "DETAILS:",
            "-" * 60,
            "",
        ]
        
        for topic in report.topics:
            status_icon = {"healthy": "✓", "warning": "⚠", "critical": "✗", "unknown": "?"}.get(topic.status, "?")
            lines.append(f"{status_icon} {topic.name} [{topic.status.upper()}]")
            lines.append(f"  Partitions: {topic.partition_count}")
            if topic.issues:
                for issue in topic.issues:
                    lines.append(f"    - {issue}")
            lines.append("")
        
        if report.summary.get("config_sync"):
            sync = report.summary["config_sync"]
            lines.extend([
                "-" * 60,
                "CONFIG SYNC SUMMARY:",
                "-" * 60,
                f"  In Sync: {sync['in_sync_count']} topics",
                f"  Synced:  {'Yes' if sync['is_synced'] else 'No'}",
            ])
            if sync["topics_only_in_kafka"]:
                lines.append(f"  Topics only in Kafka: {', '.join(sync['topics_only_in_kafka'])}")
            if sync["topics_only_in_config"]:
                lines.append(f"  Topics only in Config: {', '.join(sync['topics_only_in_config'])}")
        
        lines.extend([
            "",
            "=" * 60,
        ])
        
        return "\n".join(lines)

    def _generate_markdown_report(self, report: InspectionReport) -> str:
        lines = [
            "# Topic Inspection Report",
            "",
            f"**Generated:** {report.timestamp.strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "## Summary",
            "",
            "| Metric | Count |",
            "|--------|-------|",
            f"| Total Topics | {report.total_topics} |",
            f"| Healthy | {report.healthy_topics} |",
            f"| Warning | {report.warning_topics} |",
            f"| Critical | {report.critical_topics} |",
            "",
            "## Topic Details",
            "",
        ]
        
        for topic in report.topics:
            status_badge = {
                "healthy": "✅ Healthy",
                "warning": "⚠️ Warning",
                "critical": "❌ Critical",
                "unknown": "❓ Unknown"
            }.get(topic.status, "❓ Unknown")
            
            lines.extend([
                f"### {topic.name} - {status_badge}",
                "",
                f"- **Partitions:** {topic.partition_count}",
                f"- **Message Rate:** {topic.message_rate:.2f} msg/s",
            ])
            
            if topic.issues:
                lines.extend([
                    "",
                    "**Issues:**",
                    "",
                ])
                for issue in topic.issues:
                    lines.append(f"- {issue}")
            
            lines.append("")
        
        return "\n".join(lines)

    def close(self):
        self.kafka_client.close()
        self.config_db.disconnect()

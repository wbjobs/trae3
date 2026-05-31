from typing import List, Optional, Dict, Any
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from ..common import get_logger, load_config
from .models import TopicConfig, ConsumerConfig, SystemConfig


class ConfigDBClient:
    def __init__(self):
        config = load_config()
        self.logger = get_logger("ConfigDBClient")
        db_config = config.database
        self.connection_string = (
            f"mysql+pymysql://{db_config.username}:{db_config.password}"
            f"@{db_config.host}:{db_config.port}/{db_config.database}"
            f"?charset={db_config.charset}"
        )
        self.engine = None

    def connect(self) -> bool:
        try:
            self.engine = create_engine(self.connection_string)
            with self.engine.connect():
                self.logger.info("Successfully connected to config database")
                return True
        except SQLAlchemyError as e:
            self.logger.error(f"Failed to connect to database: {e}")
            return False

    def disconnect(self):
        if self.engine:
            self.engine.dispose()
            self.logger.info("Disconnected from config database")

    def list_topics(self) -> List[TopicConfig]:
        if not self.engine:
            self.connect()
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text("SELECT * FROM topic_configs WHERE status != 'deleted'"))
                rows = result.fetchall()
                columns = result.keys()
                topics = []
                for row in rows:
                    data = dict(zip(columns, row))
                    topics.append(TopicConfig(**data))
                return topics
        except SQLAlchemyError as e:
            self.logger.error(f"Failed to list topics: {e}")
            return []

    def get_topic(self, topic_name: str) -> Optional[TopicConfig]:
        if not self.engine:
            self.connect()
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(
                    text("SELECT * FROM topic_configs WHERE name = :name"),
                    {"name": topic_name}
                )
                row = result.fetchone()
                if row:
                    columns = result.keys()
                    return TopicConfig(**dict(zip(columns, row)))
                return None
        except SQLAlchemyError as e:
            self.logger.error(f"Failed to get topic {topic_name}: {e}")
            return None

    def create_topic(self, topic: TopicConfig) -> bool:
        if not self.engine:
            self.connect()
        
        try:
            with self.engine.connect() as conn:
                conn.execute(
                    text("""
                        INSERT INTO topic_configs 
                        (name, partitions, replicas, retention_ms, description, status, created_at, updated_at)
                        VALUES 
                        (:name, :partitions, :replicas, :retention_ms, :description, :status, NOW(), NOW())
                    """),
                    {
                        "name": topic.name,
                        "partitions": topic.partitions,
                        "replicas": topic.replicas,
                        "retention_ms": topic.retention_ms,
                        "description": topic.description,
                        "status": topic.status,
                    }
                )
                conn.commit()
                self.logger.info(f"Topic {topic.name} created successfully")
                return True
        except SQLAlchemyError as e:
            self.logger.error(f"Failed to create topic {topic.name}: {e}")
            return False

    def update_topic(self, topic_name: str, updates: Dict[str, Any]) -> bool:
        if not self.engine:
            self.connect()
        
        set_clause = ", ".join([f"{k} = :{k}" for k in updates.keys()])
        updates["updated_at"] = text("NOW()")
        updates["name"] = topic_name
        
        try:
            with self.engine.connect() as conn:
                conn.execute(
                    text(f"UPDATE topic_configs SET {set_clause}, updated_at = NOW() WHERE name = :name"),
                    updates
                )
                conn.commit()
                self.logger.info(f"Topic {topic_name} updated successfully")
                return True
        except SQLAlchemyError as e:
            self.logger.error(f"Failed to update topic {topic_name}: {e}")
            return False

    def delete_topic(self, topic_name: str) -> bool:
        return self.update_topic(topic_name, {"status": "deleted"})

    def list_consumers(self) -> List[ConsumerConfig]:
        if not self.engine:
            self.connect()
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text("SELECT * FROM consumer_configs WHERE status != 'deleted'"))
                rows = result.fetchall()
                columns = result.keys()
                consumers = []
                for row in rows:
                    data = dict(zip(columns, row))
                    consumers.append(ConsumerConfig(**data))
                return consumers
        except SQLAlchemyError as e:
            self.logger.error(f"Failed to list consumers: {e}")
            return []

    def get_system_config(self, key: str) -> Optional[str]:
        if not self.engine:
            self.connect()
        
        try:
            with self.engine.connect() as conn:
                result = conn.execute(
                    text("SELECT value FROM system_configs WHERE `key` = :key"),
                    {"key": key}
                )
                row = result.fetchone()
                return row[0] if row else None
        except SQLAlchemyError as e:
            self.logger.error(f"Failed to get system config {key}: {e}")
            return None

    def set_system_config(self, key: str, value: str, description: str = "") -> bool:
        if not self.engine:
            self.connect()
        
        try:
            with self.engine.connect() as conn:
                conn.execute(
                    text("""
                        INSERT INTO system_configs (`key`, value, description, created_at, updated_at)
                        VALUES (:key, :value, :description, NOW(), NOW())
                        ON DUPLICATE KEY UPDATE 
                        value = VALUES(value), 
                        description = VALUES(description),
                        updated_at = NOW()
                    """),
                    {"key": key, "value": value, "description": description}
                )
                conn.commit()
                return True
        except SQLAlchemyError as e:
            self.logger.error(f"Failed to set system config {key}: {e}")
            return False

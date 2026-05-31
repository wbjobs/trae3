import os
from typing import Optional
from pydantic import BaseModel, Field


class DatabaseConfig(BaseModel):
    host: str = Field(default="localhost")
    port: int = Field(default=3306)
    username: str = Field(default="root")
    password: str = Field(default="")
    database: str = Field(default="config_db")
    charset: str = Field(default="utf8mb4")


class KafkaConfig(BaseModel):
    bootstrap_servers: str = Field(default="localhost:9092")
    group_id: str = Field(default="msgcli-group")
    auto_offset_reset: str = Field(default="earliest")


class RedisConfig(BaseModel):
    host: str = Field(default="localhost")
    port: int = Field(default=6379)
    password: Optional[str] = Field(default=None)
    db: int = Field(default=0)


class RPCConfig(BaseModel):
    endpoint: str = Field(default="http://localhost:8080")
    timeout: int = Field(default=30)
    api_key: Optional[str] = Field(default=None)


class Config(BaseModel):
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    kafka: KafkaConfig = Field(default_factory=KafkaConfig)
    redis: RedisConfig = Field(default_factory=RedisConfig)
    rpc: RPCConfig = Field(default_factory=RPCConfig)


def load_config() -> Config:
    return Config(
        database=DatabaseConfig(
            host=os.getenv("DB_HOST", "localhost"),
            port=int(os.getenv("DB_PORT", "3306")),
            username=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", ""),
            database=os.getenv("DB_NAME", "config_db"),
        ),
        kafka=KafkaConfig(
            bootstrap_servers=os.getenv("KAFKA_SERVERS", "localhost:9092"),
            group_id=os.getenv("KAFKA_GROUP_ID", "msgcli-group"),
        ),
        redis=RedisConfig(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            password=os.getenv("REDIS_PASSWORD"),
            db=int(os.getenv("REDIS_DB", "0")),
        ),
        rpc=RPCConfig(
            endpoint=os.getenv("RPC_ENDPOINT", "http://localhost:8080"),
            timeout=int(os.getenv("RPC_TIMEOUT", "30")),
            api_key=os.getenv("RPC_API_KEY"),
        ),
    )

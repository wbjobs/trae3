import os
import yaml
from typing import List, Optional
from pydantic import BaseModel, Field


class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 1


class LoggingConfig(BaseModel):
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    file_path: str = "./logs/app.log"
    max_bytes: int = 10485760
    backup_count: int = 5


class DatabaseConfig(BaseModel):
    url: str = "sqlite:///./data/gateway.db"
    echo: bool = False


class RedisConfig(BaseModel):
    host: str = "localhost"
    port: int = 6379
    db: int = 0
    password: Optional[str] = None


class SerialPortConfig(BaseModel):
    name: str
    port: str
    baudrate: int = 9600
    timeout: int = 1
    parity: str = "N"
    stopbits: int = 1
    bytesize: int = 8


class SerialConfig(BaseModel):
    ports: List[SerialPortConfig] = Field(default_factory=list)


class MQTTBrokerConfig(BaseModel):
    name: str
    host: str
    port: int = 1883
    username: Optional[str] = None
    password: Optional[str] = None
    keepalive: int = 60


class MQTTConfig(BaseModel):
    brokers: List[MQTTBrokerConfig] = Field(default_factory=list)
    topics: List[str] = Field(default_factory=list)


class HTTPConfig(BaseModel):
    timeout: int = 30
    max_retries: int = 3


class ClusterConfig(BaseModel):
    enabled: bool = False
    service_name: str = "api-gateway"
    consul_host: str = "localhost"
    consul_port: int = 8500
    node_id: str = "node-1"


class TrafficConfig(BaseModel):
    enable_statistics: bool = True
    statistics_interval: int = 60
    max_history: int = 10000


class AppConfig(BaseModel):
    server: ServerConfig = Field(default_factory=ServerConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    redis: RedisConfig = Field(default_factory=RedisConfig)
    serial: SerialConfig = Field(default_factory=SerialConfig)
    mqtt: MQTTConfig = Field(default_factory=MQTTConfig)
    http: HTTPConfig = Field(default_factory=HTTPConfig)
    cluster: ClusterConfig = Field(default_factory=ClusterConfig)
    traffic: TrafficConfig = Field(default_factory=TrafficConfig)


_config: Optional[AppConfig] = None


def load_config(config_path: str = "config.yaml") -> AppConfig:
    global _config
    if _config is not None:
        return _config

    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f)
        _config = AppConfig(**config_data)
    else:
        _config = AppConfig()

    os.makedirs(os.path.dirname(_config.logging.file_path), exist_ok=True)
    os.makedirs(os.path.dirname(_config.database.url.replace("sqlite:///", "")), exist_ok=True)

    return _config


def get_config() -> AppConfig:
    global _config
    if _config is None:
        _config = load_config()
    return _config

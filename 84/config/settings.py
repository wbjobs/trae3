import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import yaml


@dataclass
class ClusterConfig:
    name: str = "ocean-compute-cluster"
    master_node: Dict[str, Any] = field(default_factory=dict)
    heartbeat_interval: int = 30
    node_timeout: int = 120
    max_nodes: int = 100
    auto_scaling: bool = False
    min_nodes: int = 1
    max_idle_nodes: int = 5


@dataclass
class DatabaseConfig:
    type: str = "sqlite"
    host: str = "localhost"
    port: int = 5432
    name: str = "ocean_compute"
    user: str = "admin"
    password: str = "admin123"
    sqlite_path: str = "./data/ocean_compute.db"
    pool_size: int = 10
    max_overflow: int = 20
    pool_recycle: int = 3600
    echo: bool = False


@dataclass
class KernelConfig:
    default_kernel: str = "default"
    kernels: List[Dict[str, Any]] = field(default_factory=list)
    shared_memory: int = 1024
    network_mode: str = "bridge"


@dataclass
class SchedulerConfig:
    strategy: str = "least_loaded"
    max_concurrent_tasks: int = 50
    max_queue_size: int = 1000
    task_timeout: int = 3600
    default_retry_count: int = 3
    retry_delay: int = 5
    priority_weights: Dict[str, int] = field(default_factory=dict)
    scheduling_interval: int = 5
    preemption_enabled: bool = False
    fair_share: bool = True


@dataclass
class StorageConfig:
    data_dir: str = "./data"
    result_dir: str = "./results"
    temp_dir: str = "./tmp"
    log_dir: str = "./logs"
    max_storage_size: int = 107374182400
    cleanup_interval: int = 86400
    retention_days: int = 30


@dataclass
class LoggingConfig:
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    file_enabled: bool = True
    file_rotation: str = "daily"
    max_file_size: int = 10485760
    backup_count: int = 30


@dataclass
class SecurityConfig:
    authentication_enabled: bool = False
    jwt_secret: str = "your-secret-key-here"
    jwt_expiry: int = 86400
    allowed_origins: List[str] = field(default_factory=lambda: ["*"])
    api_key_enabled: bool = False
    rate_limit: int = 100
    rate_limit_window: int = 60


class Settings:
    _instance: Optional["Settings"] = None
    _config: Dict[str, Any] = field(default_factory=dict)

    def __new__(cls) -> "Settings":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._config = {}
        self.cluster: ClusterConfig = ClusterConfig()
        self.database: DatabaseConfig = DatabaseConfig()
        self.kernel: KernelConfig = KernelConfig()
        self.scheduler: SchedulerConfig = SchedulerConfig()
        self.storage: StorageConfig = StorageConfig()
        self.logging: LoggingConfig = LoggingConfig()
        self.security: SecurityConfig = SecurityConfig()

    def load_from_yaml(self, config_path: str) -> None:
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Config file not found: {config_path}")

        with open(config_path, "r", encoding="utf-8") as f:
            self._config = yaml.safe_load(f) or {}

        self._apply_config(self._config)
        self._apply_env_overrides()

    def load_from_dict(self, config_dict: Dict[str, Any]) -> None:
        self._config = config_dict
        self._apply_config(self._config)
        self._apply_env_overrides()

    def _apply_config(self, config: Dict[str, Any]) -> None:
        if "cluster" in config:
            self.cluster = ClusterConfig(**config["cluster"])
        if "database" in config:
            self.database = DatabaseConfig(**config["database"])
        if "kernel" in config:
            self.kernel = KernelConfig(**config["kernel"])
        if "scheduler" in config:
            self.scheduler = SchedulerConfig(**config["scheduler"])
        if "storage" in config:
            self.storage = StorageConfig(**config["storage"])
        if "logging" in config:
            self.logging = LoggingConfig(**config["logging"])
        if "security" in config:
            self.security = SecurityConfig(**config["security"])

    def _apply_env_overrides(self) -> None:
        env_mapping = {
            "OCEAN_CLUSTER_NAME": ("cluster", "name"),
            "OCEAN_DB_TYPE": ("database", "type"),
            "OCEAN_DB_HOST": ("database", "host"),
            "OCEAN_DB_PORT": ("database", "port", int),
            "OCEAN_DB_NAME": ("database", "name"),
            "OCEAN_DB_USER": ("database", "user"),
            "OCEAN_DB_PASSWORD": ("database", "password"),
            "OCEAN_DB_SQLITE_PATH": ("database", "sqlite_path"),
            "OCEAN_LOG_LEVEL": ("logging", "level"),
            "OCEAN_DATA_DIR": ("storage", "data_dir"),
            "OCEAN_RESULT_DIR": ("storage", "result_dir"),
            "OCEAN_JWT_SECRET": ("security", "jwt_secret"),
        }

        for env_key, config_path in env_mapping.items():
            env_value = os.environ.get(env_key)
            if env_value is not None:
                section, key = config_path[0], config_path[1]
                type_converter = config_path[2] if len(config_path) > 2 else str
                config_obj = getattr(self, section)
                setattr(config_obj, key, type_converter(env_value))

    def get(self, key: str, default: Any = None) -> Any:
        keys = key.split(".")
        value: Any = self._config
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        return value

    def to_dict(self) -> Dict[str, Any]:
        return {
            "cluster": self.cluster.__dict__,
            "database": self.database.__dict__,
            "kernel": self.kernel.__dict__,
            "scheduler": self.scheduler.__dict__,
            "storage": self.storage.__dict__,
            "logging": self.logging.__dict__,
            "security": self.security.__dict__,
        }


def get_settings(config_path: Optional[str] = None) -> Settings:
    settings = Settings()
    if config_path is None:
        config_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "config.yaml"
        )
    if os.path.exists(config_path):
        settings.load_from_yaml(config_path)
    return settings

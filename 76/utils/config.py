import os
from dataclasses import dataclass, field
from typing import Any

import yaml

from exceptions import ConfigError


@dataclass
class CloudConfig:
    program_library_url: str = ""
    program_library_timeout: int = 30
    program_library_retry_count: int = 3
    program_library_retry_delay: int = 5
    version_database_url: str = ""
    version_database_timeout: int = 30
    version_database_retry_count: int = 3
    version_database_retry_delay: int = 5
    token_endpoint: str = "/auth/token"
    refresh_endpoint: str = "/auth/refresh"


@dataclass
class SyncConfig:
    auto_sync: bool = True
    sync_interval: int = 300
    conflict_strategy: str = "manual"
    max_retries: int = 5
    batch_size: int = 50


@dataclass
class CacheConfig:
    db_path: str = "./data/cache.db"
    max_size_mb: int = 512
    eviction_policy: str = "lru"
    ttl_seconds: int = 86400


@dataclass
class SimulatorConfig:
    max_concurrent_tasks: int = 4
    default_timeout: int = 3600
    workspace: str = "./data/workspace"
    log_level: str = "INFO"


@dataclass
class VersionConfig:
    storage_path: str = "./data/versions"
    max_versions: int = 100
    auto_commit: bool = False


@dataclass
class LoggingConfig:
    level: str = "INFO"
    file: str = "./logs/sim-platform.log"
    max_bytes: int = 10 * 1024 * 1024
    backup_count: int = 5


@dataclass
class AppConfig:
    name: str = "SimPlatform"
    version: str = "1.0.0"
    language: str = "zh_CN"
    theme: str = "default"
    cloud: CloudConfig = field(default_factory=CloudConfig)
    sync: SyncConfig = field(default_factory=SyncConfig)
    cache: CacheConfig = field(default_factory=CacheConfig)
    simulator: SimulatorConfig = field(default_factory=SimulatorConfig)
    version_mgmt: VersionConfig = field(default_factory=VersionConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)


class ConfigManager:
    _instance: "ConfigManager | None" = None
    _config: AppConfig | None = None

    def __new__(cls) -> "ConfigManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def load(cls, config_path: str = "config.yaml") -> AppConfig:
        instance = cls()
        if not os.path.exists(config_path):
            instance._config = AppConfig()
            return instance._config

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                raw: dict[str, Any] = yaml.safe_load(f) or {}
        except yaml.YAMLError as e:
            raise ConfigError(f"配置文件解析失败: {e}") from e

        instance._config = instance._parse(raw)
        return instance._config

    @classmethod
    def get(cls) -> AppConfig:
        instance = cls()
        if instance._config is None:
            return cls.load()
        return instance._config

    @classmethod
    def reset(cls) -> None:
        cls._instance = None
        cls._config = None

    def _parse(self, raw: dict[str, Any]) -> AppConfig:
        cloud_raw = raw.get("cloud", {})
        auth_raw = cloud_raw.get("auth", {})
        pl_raw = cloud_raw.get("program_library", {})
        vd_raw = cloud_raw.get("version_database", {})

        cloud = CloudConfig(
            program_library_url=pl_raw.get("base_url", ""),
            program_library_timeout=pl_raw.get("timeout", 30),
            program_library_retry_count=pl_raw.get("retry_count", 3),
            program_library_retry_delay=pl_raw.get("retry_delay", 5),
            version_database_url=vd_raw.get("base_url", ""),
            version_database_timeout=vd_raw.get("timeout", 30),
            version_database_retry_count=vd_raw.get("retry_count", 3),
            version_database_retry_delay=vd_raw.get("retry_delay", 5),
            token_endpoint=auth_raw.get("token_endpoint", "/auth/token"),
            refresh_endpoint=auth_raw.get("refresh_endpoint", "/auth/refresh"),
        )

        sync_raw = raw.get("sync", {})
        sync = SyncConfig(
            auto_sync=sync_raw.get("auto_sync", True),
            sync_interval=sync_raw.get("sync_interval", 300),
            conflict_strategy=sync_raw.get("conflict_strategy", "manual"),
            max_retries=sync_raw.get("max_retries", 5),
            batch_size=sync_raw.get("batch_size", 50),
        )

        cache_raw = raw.get("cache", {})
        cache = CacheConfig(
            db_path=cache_raw.get("db_path", "./data/cache.db"),
            max_size_mb=cache_raw.get("max_size_mb", 512),
            eviction_policy=cache_raw.get("eviction_policy", "lru"),
            ttl_seconds=cache_raw.get("ttl_seconds", 86400),
        )

        sim_raw = raw.get("simulator", {})
        simulator = SimulatorConfig(
            max_concurrent_tasks=sim_raw.get("max_concurrent_tasks", 4),
            default_timeout=sim_raw.get("default_timeout", 3600),
            workspace=sim_raw.get("workspace", "./data/workspace"),
            log_level=sim_raw.get("log_level", "INFO"),
        )

        ver_raw = raw.get("version", {})
        version_mgmt = VersionConfig(
            storage_path=ver_raw.get("storage_path", "./data/versions"),
            max_versions=ver_raw.get("max_versions", 100),
            auto_commit=ver_raw.get("auto_commit", False),
        )

        log_raw = raw.get("logging", {})
        logging_cfg = LoggingConfig(
            level=log_raw.get("level", "INFO"),
            file=log_raw.get("file", "./logs/sim-platform.log"),
            max_bytes=log_raw.get("max_bytes", 10 * 1024 * 1024),
            backup_count=log_raw.get("backup_count", 5),
        )

        app_raw = raw.get("app", {})
        return AppConfig(
            name=app_raw.get("name", "SimPlatform"),
            version=app_raw.get("version", "1.0.0"),
            language=app_raw.get("language", "zh_CN"),
            theme=app_raw.get("theme", "default"),
            cloud=cloud,
            sync=sync,
            cache=cache,
            simulator=simulator,
            version_mgmt=version_mgmt,
            logging=logging_cfg,
        )

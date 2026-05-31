import os
import json
import logging
from pathlib import Path
from typing import Any

_CONFIG_INSTANCE = None

_DEFAULT_CONFIG = {
    "cluster": {
        "master_host": "0.0.0.0",
        "master_port": 9500,
        "heartbeat_interval": 10,
        "node_timeout": 30,
        "max_retries": 3
    },
    "scheduler": {
        "max_concurrent_tasks": 100,
        "task_timeout": 3600,
        "retry_delay": 30,
        "priority_levels": 5
    },
    "sediment": {
        "default_model": "yang_sediment",
        "time_step": 3600,
        "max_iterations": 1000,
        "convergence_threshold": 1e-6
    },
    "storage": {
        "db_type": "postgresql",
        "db_host": "localhost",
        "db_port": 5432,
        "db_name": "sediment_db",
        "db_user": "sediment_admin",
        "db_password": "",
        "pool_size": 10,
        "batch_insert_size": 500
    },
    "logging": {
        "level": "INFO",
        "log_dir": "logs",
        "max_file_size_mb": 50,
        "backup_count": 5
    }
}


class Config:
    def __init__(self, config_path: str = None):
        self._data = dict(_DEFAULT_CONFIG)
        if config_path and Path(config_path).exists():
            self._load(config_path)
        self._setup_logging()

    def _load(self, path: str):
        with open(path, "r", encoding="utf-8") as f:
            user_cfg = json.load(f)
        self._deep_merge(self._data, user_cfg)

    @staticmethod
    def _deep_merge(base: dict, override: dict):
        for k, v in override.items():
            if k in base and isinstance(base[k], dict) and isinstance(v, dict):
                Config._deep_merge(base[k], v)
            else:
                base[k] = v

    def _setup_logging(self):
        log_cfg = self._data.get("logging", {})
        level = getattr(logging, log_cfg.get("level", "INFO").upper(), logging.INFO)
        log_dir = log_cfg.get("log_dir", "logs")
        os.makedirs(log_dir, exist_ok=True)

        logging.basicConfig(
            level=level,
            format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
            handlers=[
                logging.StreamHandler(),
                logging.FileHandler(
                    os.path.join(log_dir, "sediment_cluster.log"),
                    encoding="utf-8"
                )
            ]
        )

    def get(self, *keys: str, default: Any = None) -> Any:
        node = self._data
        for k in keys:
            if isinstance(node, dict) and k in node:
                node = node[k]
            else:
                return default
        return node

    @property
    def data(self) -> dict:
        return dict(self._data)


def load_config(config_path: str = None) -> Config:
    global _CONFIG_INSTANCE
    if _CONFIG_INSTANCE is None:
        _CONFIG_INSTANCE = Config(config_path)
    return _CONFIG_INSTANCE

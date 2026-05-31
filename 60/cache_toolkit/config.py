import json
import os
from pathlib import Path
from typing import Optional

_DEFAULT_CONFIG_DIR = Path.home() / ".cache_toolkit"
_DEFAULT_CONFIG_FILE = _DEFAULT_CONFIG_DIR / "config.json"

_DEFAULT_CONFIG = {
    "clusters": {},
    "config_db": {
        "type": "sqlite",
        "path": str(_DEFAULT_CONFIG_DIR / "metadata.db"),
    },
    "rpc": {
        "timeout": 30,
        "retry_count": 3,
        "retry_delay": 2,
    },
    "migrate": {
        "batch_size": 500,
        "ttl_preserve": True,
    },
    "inspect": {
        "sample_size": 1000,
        "scan_count": 200,
    },
}


class ConfigManager:
    def __init__(self, config_path: Optional[str] = None):
        self._config_path = Path(config_path) if config_path else _DEFAULT_CONFIG_FILE
        self._config: dict = {}
        self._load()

    def _load(self):
        if self._config_path.exists():
            with open(self._config_path, "r", encoding="utf-8") as f:
                self._config = json.load(f)
        else:
            self._config = json.loads(json.dumps(_DEFAULT_CONFIG))
            self.save()

    def save(self):
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._config_path, "w", encoding="utf-8") as f:
            json.dump(self._config, f, indent=2, ensure_ascii=False)

    @property
    def config(self) -> dict:
        return self._config

    def get(self, key_path: str, default=None):
        keys = key_path.split(".")
        value = self._config
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        return value

    def set(self, key_path: str, value):
        keys = key_path.split(".")
        cfg = self._config
        for k in keys[:-1]:
            if k not in cfg or not isinstance(cfg[k], dict):
                cfg[k] = {}
            cfg = cfg[k]
        cfg[keys[-1]] = value
        self.save()

    def add_cluster(self, name: str, hosts: list, password: Optional[str] = None):
        clusters = self._config.setdefault("clusters", {})
        clusters[name] = {
            "hosts": hosts,
            "password": password,
        }
        self.save()

    def remove_cluster(self, name: str) -> bool:
        clusters = self._config.get("clusters", {})
        if name in clusters:
            del clusters[name]
            self.save()
            return True
        return False

    def get_cluster(self, name: str) -> Optional[dict]:
        return self._config.get("clusters", {}).get(name)

    def list_clusters(self) -> list:
        clusters = self._config.get("clusters", {})
        return [
            {"name": k, "hosts": v.get("hosts", []), "has_password": bool(v.get("password"))}
            for k, v in clusters.items()
        ]

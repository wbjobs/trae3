import os
from pathlib import Path
from typing import Any

import yaml


_config: dict[str, Any] | None = None

CONFIG_DIR = Path(__file__).resolve().parent.parent.parent / "config"


def _deep_merge(base: dict, override: dict) -> dict:
    merged = base.copy()
    for key, value in override.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _resolve_env_vars(config: dict) -> dict:
    resolved = {}
    for key, value in config.items():
        if isinstance(value, dict):
            resolved[key] = _resolve_env_vars(value)
        elif isinstance(value, str) and value.isidentifier() and value in os.environ:
            resolved[key] = os.environ[value]
        else:
            resolved[key] = value
    return resolved


def load_config(env: str | None = None) -> dict[str, Any]:
    global _config
    if _config is not None:
        return _config

    env = env or os.environ.get("APP_ENV", "development")
    env_file = CONFIG_DIR / f"{env}.yaml"
    if not env_file.exists():
        raise FileNotFoundError(f"Config file not found: {env_file}")

    with open(env_file, "r", encoding="utf-8") as f:
        env_config = yaml.safe_load(f) or {}

    inherit = env_config.pop("inherit", None)
    if inherit:
        base_file = CONFIG_DIR / inherit
        if not base_file.exists():
            raise FileNotFoundError(f"Inherited config file not found: {base_file}")
        with open(base_file, "r", encoding="utf-8") as f:
            base_config = yaml.safe_load(f) or {}
        config = _deep_merge(base_config, env_config)
    else:
        config = env_config

    config = _resolve_env_vars(config)
    _config = config
    return _config


def get_config() -> dict[str, Any]:
    if _config is None:
        return load_config()
    return _config


def reload_config(env: str | None = None) -> dict[str, Any]:
    global _config
    _config = None
    return load_config(env)

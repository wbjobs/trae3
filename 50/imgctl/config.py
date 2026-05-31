import json
import os

DEFAULT_CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".imgctl", "config.json")

DEFAULT_CONFIG = {
    "registry": {
        "url": "",
        "username": "",
        "password": "",
        "verify_ssl": True
    },
    "db": {
        "path": os.path.join(os.path.expanduser("~"), ".imgctl", "imgctl.db")
    },
    "retry": {
        "max_retries": 3,
        "timeout": 30,
        "backoff_factor": 1.0,
        "retry_on_status": [408, 429, 500, 502, 503, 504]
    },
    "batch": {
        "max_workers": 5,
        "chunk_size": 10,
        "show_progress": True,
        "stop_on_error": False
    },
    "cleaner": {
        "default_strategy": "untagged",
        "keep_latest_n": 5,
        "dry_run": True
    }
}


class Config:
    def __init__(self, config_path=None):
        self.config_path = config_path or DEFAULT_CONFIG_PATH
        self._data = None

    def _ensure_dir(self):
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)

    def load(self):
        if not os.path.exists(self.config_path):
            self._data = dict(DEFAULT_CONFIG)
            self.save()
            return self._data
        with open(self.config_path, "r", encoding="utf-8") as f:
            self._data = json.load(f)
        return self._data

    def save(self):
        self._ensure_dir()
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=2, ensure_ascii=False)

    @property
    def data(self):
        if self._data is None:
            self.load()
        return self._data

    def get(self, *keys, default=None):
        obj = self.data
        for key in keys:
            if isinstance(obj, dict) and key in obj:
                obj = obj[key]
            else:
                return default
        return obj

    def set(self, *keys_and_value):
        if len(keys_and_value) < 2:
            raise ValueError("Need at least one key and a value")
        keys = keys_and_value[:-1]
        value = keys_and_value[-1]
        obj = self.data
        for key in keys[:-1]:
            if key not in obj or not isinstance(obj[key], dict):
                obj[key] = {}
            obj = obj[key]
        obj[keys[-1]] = value
        self.save()

    def show(self):
        masked = self._mask_sensitive(self.data)
        return json.dumps(masked, indent=2, ensure_ascii=False)

    def _mask_sensitive(self, data):
        if isinstance(data, dict):
            result = {}
            for k, v in data.items():
                if k in ("password", "token", "secret") and isinstance(v, str) and v:
                    result[k] = "****"
                else:
                    result[k] = self._mask_sensitive(v)
            return result
        elif isinstance(data, list):
            return [self._mask_sensitive(item) for item in data]
        return data

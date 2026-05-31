import re
import yaml
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional
from fnmatch import fnmatch
from configtool.utils import get_logger, ConfigError

logger = get_logger("whitelist")


class ConfigWhitelist:
    def __init__(
        self,
        include_patterns: Optional[List[str]] = None,
        exclude_patterns: Optional[List[str]] = None,
        regex_include: Optional[List[str]] = None,
        regex_exclude: Optional[List[str]] = None,
    ):
        self.include_patterns = include_patterns or []
        self.exclude_patterns = exclude_patterns or []
        self.regex_include = regex_include or []
        self.regex_exclude = regex_exclude or []
        self._compiled_regex_include = [re.compile(p) for p in self.regex_include]
        self._compiled_regex_exclude = [re.compile(p) for p in self.regex_exclude]

    @classmethod
    def load_from_file(cls, file_path: str) -> "ConfigWhitelist":
        path = Path(file_path)
        if not path.exists():
            raise ConfigError(f"白名单文件不存在: {file_path}")
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
        except yaml.YAMLError as e:
            raise ConfigError(f"白名单YAML解析失败: {file_path}, 错误: {e}")

        return cls(
            include_patterns=data.get("include_patterns", []),
            exclude_patterns=data.get("exclude_patterns", []),
            regex_include=data.get("regex_include", []),
            regex_exclude=data.get("regex_exclude", []),
        )

    def matches(self, key_path: str) -> bool:
        for pattern in self._compiled_regex_exclude:
            if pattern.search(key_path):
                return False

        for pattern in self.exclude_patterns:
            if fnmatch(key_path, pattern):
                return False

        if not self.include_patterns and not self.regex_include:
            return True

        for pattern in self.include_patterns:
            if fnmatch(key_path, pattern):
                return True

        for pattern in self._compiled_regex_include:
            if pattern.search(key_path):
                return True

        return False

    def filter_dict(self, data: Dict[str, Any], parent_path: str = "") -> Dict[str, Any]:
        result = {}
        for key, value in data.items():
            current_path = f"{parent_path}.{key}" if parent_path else key
            if isinstance(value, dict):
                filtered = self.filter_dict(value, current_path)
                if filtered:
                    result[key] = filtered
            elif self.matches(current_path):
                result[key] = value
        return result

    def filter_diffs(self, diffs: List[Tuple]) -> List[Tuple]:
        return [diff for diff in diffs if self.matches(diff[0])]

    def add_include(self, pattern: str, is_regex: bool = False) -> None:
        if is_regex:
            self.regex_include.append(pattern)
            self._compiled_regex_include.append(re.compile(pattern))
        else:
            self.include_patterns.append(pattern)

    def add_exclude(self, pattern: str, is_regex: bool = False) -> None:
        if is_regex:
            self.regex_exclude.append(pattern)
            self._compiled_regex_exclude.append(re.compile(pattern))
        else:
            self.exclude_patterns.append(pattern)

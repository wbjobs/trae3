import os
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import yaml


class ConfigParseError(Exception):
    pass


class ConfigParser:
    SUPPORTED_FORMATS = ('.yaml', '.yml', '.json', '.properties')

    def __init__(self):
        self._config_cache: Dict[str, Dict[str, Any]] = {}

    def parse_file(self, file_path: str) -> Dict[str, Any]:
        path = Path(file_path)
        if not path.exists():
            raise ConfigParseError(f"配置文件不存在: {file_path}")
        
        suffix = path.suffix.lower()
        if suffix not in self.SUPPORTED_FORMATS:
            raise ConfigParseError(f"不支持的配置格式: {suffix}")
        
        cache_key = str(path.absolute())
        if cache_key in self._config_cache:
            return self._config_cache[cache_key]
        
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if suffix in ('.yaml', '.yml'):
                config = self._parse_yaml(content)
            elif suffix == '.json':
                config = self._parse_json(content)
            elif suffix == '.properties':
                config = self._parse_properties(content)
            
            self._config_cache[cache_key] = config
            return config
        except Exception as e:
            raise ConfigParseError(f"解析配置文件失败 {file_path}: {str(e)}")

    def _parse_yaml(self, content: str) -> Dict[str, Any]:
        try:
            return yaml.safe_load(content) or {}
        except yaml.YAMLError as e:
            raise ConfigParseError(f"YAML解析错误: {str(e)}")

    def _parse_json(self, content: str) -> Dict[str, Any]:
        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            raise ConfigParseError(f"JSON解析错误: {str(e)}")

    def _parse_properties(self, content: str) -> Dict[str, Any]:
        result: Dict[str, Any] = {}
        for line_num, line in enumerate(content.split('\n'), 1):
            line = line.strip()
            if not line or line.startswith('#') or line.startswith('!'):
                continue
            
            if '=' in line:
                key, value = line.split('=', 1)
            elif ':' in line:
                key, value = line.split(':', 1)
            else:
                continue
            
            key = key.strip()
            value = value.strip()
            
            value = self._parse_property_value(value)
            self._set_nested_value(result, key, value)
        
        return result

    def _parse_property_value(self, value: str) -> Any:
        value = value.strip()
        
        if value.lower() in ('true', 'yes'):
            return True
        if value.lower() in ('false', 'no'):
            return False
        if value.lower() in ('null', 'none'):
            return None
        
        if value.startswith('[') and value.endswith(']'):
            items = value[1:-1].split(',')
            return [self._parse_property_value(item.strip()) for item in items]
        
        try:
            if '.' in value:
                return float(value)
            return int(value)
        except ValueError:
            pass
        
        if (value.startswith('"') and value.endswith('"')) or \
           (value.startswith("'") and value.endswith("'")):
            return value[1:-1]
        
        return value

    def _set_nested_value(self, config: Dict[str, Any], key: str, value: Any) -> None:
        keys = key.split('.')
        current = config
        for k in keys[:-1]:
            if k not in current or not isinstance(current[k], dict):
                current[k] = {}
            current = current[k]
        current[keys[-1]] = value

    def parse_directory(self, dir_path: str, pattern: str = None) -> Dict[str, Dict[str, Any]]:
        path = Path(dir_path)
        if not path.is_dir():
            raise ConfigParseError(f"目录不存在: {dir_path}")
        
        results = {}
        for file_path in path.rglob('*'):
            if file_path.suffix.lower() not in self.SUPPORTED_FORMATS:
                continue
            if pattern and not re.match(pattern, file_path.name):
                continue
            
            try:
                config = self.parse_file(str(file_path))
                results[str(file_path)] = config
            except ConfigParseError:
                continue
        
        return results

    def get_value(self, config: Dict[str, Any], key: str, default: Any = None) -> Any:
        keys = key.split('.')
        current = config
        for k in keys:
            if isinstance(current, dict) and k in current:
                current = current[k]
            else:
                return default
        return current

    def to_format(self, config: Dict[str, Any], output_format: str) -> str:
        output_format = output_format.lower()
        if output_format in ('yaml', 'yml'):
            return yaml.dump(config, default_flow_style=False, allow_unicode=True)
        elif output_format == 'json':
            return json.dumps(config, indent=2, ensure_ascii=False)
        elif output_format == 'properties':
            return self._to_properties(config)
        else:
            raise ConfigParseError(f"不支持的输出格式: {output_format}")

    def _to_properties(self, config: Dict[str, Any], prefix: str = '') -> str:
        lines = []
        for key, value in config.items():
            full_key = f"{prefix}.{key}" if prefix else key
            if isinstance(value, dict):
                lines.append(self._to_properties(value, full_key))
            elif isinstance(value, list):
                lines.append(f"{full_key}=[{','.join(map(str, value))}]")
            else:
                lines.append(f"{full_key}={value}")
        return '\n'.join(lines)

    def merge_configs(self, base_config: Dict[str, Any], override_config: Dict[str, Any]) -> Dict[str, Any]:
        result = base_config.copy()
        for key, value in override_config.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self.merge_configs(result[key], value)
            else:
                result[key] = value
        return result

    def resolve_environment_variables(self, config: Dict[str, Any]) -> Dict[str, Any]:
        def resolve_value(value: Any) -> Any:
            if isinstance(value, str):
                pattern = r'\$\{([^}]+)\}'
                matches = re.findall(pattern, value)
                for var_name in matches:
                    env_value = os.environ.get(var_name, '')
                    value = value.replace(f'${{{var_name}}}', env_value)
                return value
            elif isinstance(value, dict):
                return {k: resolve_value(v) for k, v in value.items()}
            elif isinstance(value, list):
                return [resolve_value(item) for item in value]
            return value
        
        return resolve_value(config)

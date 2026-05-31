import re
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import jsonschema

from .parser import ConfigParser, ConfigParseError


class ValidationLevel(Enum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


@dataclass
class ValidationResult:
    file_path: str
    is_valid: bool = True
    errors: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[Dict[str, Any]] = field(default_factory=list)
    info: List[Dict[str, Any]] = field(default_factory=list)

    def add_error(self, message: str, field: str = None, rule: str = None):
        self.is_valid = False
        self.errors.append({"message": message, "field": field, "rule": rule})

    def add_warning(self, message: str, field: str = None, rule: str = None):
        self.warnings.append({"message": message, "field": field, "rule": rule})

    def add_info(self, message: str, field: str = None):
        self.info.append({"message": message, "field": field})

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file_path": self.file_path,
            "is_valid": self.is_valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "info": self.info,
            "summary": {
                "error_count": len(self.errors),
                "warning_count": len(self.warnings),
                "info_count": len(self.info)
            }
        }


@dataclass
class BatchValidationResult:
    total_files: int = 0
    valid_files: int = 0
    invalid_files: int = 0
    results: List[ValidationResult] = field(default_factory=list)

    def add_result(self, result: ValidationResult):
        self.total_files += 1
        if result.is_valid:
            self.valid_files += 1
        else:
            self.invalid_files += 1
        self.results.append(result)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_files": self.total_files,
            "valid_files": self.valid_files,
            "invalid_files": self.invalid_files,
            "success_rate": f"{(self.valid_files / self.total_files * 100):.1f}%" if self.total_files > 0 else "0%",
            "results": [r.to_dict() for r in self.results]
        }


class ConfigValidator:
    def __init__(self, rules_path: str = None):
        self.parser = ConfigParser()
        self.rules: Dict[str, Any] = self._load_rules(rules_path)

    def _load_rules(self, rules_path: str = None) -> Dict[str, Any]:
        default_path = Path(__file__).parent.parent / "config" / "rules" / "validation_rules.json"
        path = rules_path or str(default_path)
        
        if Path(path).exists():
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        return self._get_default_rules()

    def _get_default_rules(self) -> Dict[str, Any]:
        return {
            "common_rules": {
                "required_fields": ["service.name", "service.version", "service.profile"],
                "port_range": {"min": 1024, "max": 65535}
            },
            "custom_validators": {
                "network_address": "^(localhost|([a-zA-Z0-9-]+\\.)*[a-zA-Z0-9-]+|\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})$",
                "service_name": "^[a-z][a-z0-9-]*$",
                "version_pattern": "^\\d+\\.\\d+\\.\\d+([-.][a-zA-Z0-9]+)*$"
            }
        }

    def validate_file(self, file_path: str, profile: str = None) -> ValidationResult:
        result = ValidationResult(file_path=file_path)
        
        try:
            config = self.parser.parse_file(file_path)
            self._validate_syntax(config, result)
            self._validate_common_rules(config, result)
            self._validate_service_type(config, result)
            self._validate_profile_rules(config, profile, result)
            self._validate_custom_patterns(config, result)
            
        except ConfigParseError as e:
            result.add_error(f"配置解析失败: {str(e)}")
        
        return result

    def _validate_syntax(self, config: Dict[str, Any], result: ValidationResult):
        if not isinstance(config, dict):
            result.add_error("配置必须是字典格式")
            return
        
        if not config:
            result.add_warning("配置文件为空")

    def _validate_common_rules(self, config: Dict[str, Any], result: ValidationResult):
        common_rules = self.rules.get("common_rules", {})
        
        for field in common_rules.get("required_fields", []):
            value = self.parser.get_value(config, field)
            if value is None:
                result.add_error(f"缺少必填字段: {field}", field=field, rule="required_fields")

        service_name = self.parser.get_value(config, "service.name")
        if service_name:
            pattern = self.rules.get("custom_validators", {}).get("service_name")
            if pattern and not re.match(pattern, service_name):
                result.add_error(
                    f"服务名称格式不合法，应遵循: {pattern}",
                    field="service.name",
                    rule="service_name_pattern"
                )

        version = self.parser.get_value(config, "service.version")
        if version:
            pattern = self.rules.get("custom_validators", {}).get("version_pattern")
            if pattern and not re.match(pattern, version):
                result.add_error(
                    f"版本号格式不合法，应遵循: {pattern}",
                    field="service.version",
                    rule="version_pattern"
                )

        port = self.parser.get_value(config, "server.port")
        if port is not None:
            port_range = common_rules.get("port_range", {"min": 1024, "max": 65535})
            if not isinstance(port, int) or isinstance(port, bool) or port < port_range["min"] or port > port_range["max"]:
                result.add_error(
                    f"端口号必须在 {port_range['min']}-{port_range['max']} 之间",
                    field="server.port",
                    rule="port_range"
                )

    def _validate_service_type(self, config: Dict[str, Any], result: ValidationResult):
        service_type = self.parser.get_value(config, "service.type")
        if not service_type:
            return

        type_rules = self.rules.get("service_types", {}).get(service_type)
        if not type_rules:
            result.add_warning(f"未知的服务类型: {service_type}", field="service.type")
            return

        for required_field in type_rules.get("required", []):
            value = self.parser.get_value(config, required_field)
            if value is None:
                result.add_error(
                    f"服务类型 '{service_type}' 缺少必填字段: {required_field}",
                    field=required_field,
                    rule=f"{service_type}_required"
                )

        properties = type_rules.get("properties", {})
        for field, rules in properties.items():
            value = self.parser.get_value(config, field)
            if value is None:
                continue
            self._validate_property(value, field, rules, result)

    def _validate_property(self, value: Any, field: str, rules: Dict[str, Any], result: ValidationResult):
        expected_type = rules.get("type")
        if expected_type == "integer":
            if not isinstance(value, int) or isinstance(value, bool):
                result.add_error(f"字段 '{field}' 必须是整数类型", field=field)
        elif expected_type == "string":
            if not isinstance(value, str):
                result.add_error(f"字段 '{field}' 必须是字符串类型", field=field)
        elif expected_type == "boolean":
            if not isinstance(value, bool):
                result.add_error(f"字段 '{field}' 必须是布尔类型", field=field)
        elif expected_type == "array":
            if not isinstance(value, list):
                result.add_error(f"字段 '{field}' 必须是数组类型", field=field)

        if "range" in rules and isinstance(value, (int, float)) and not isinstance(value, bool):
            min_val, max_val = rules["range"]
            if value < min_val or value > max_val:
                result.add_error(
                    f"字段 '{field}' 的值必须在 {min_val}-{max_val} 之间",
                    field=field
                )

        if "min" in rules and isinstance(value, (int, float)) and not isinstance(value, bool) and value < rules["min"]:
            result.add_error(f"字段 '{field}' 的值不能小于 {rules['min']}", field=field)

        if "max" in rules and isinstance(value, (int, float)) and not isinstance(value, bool) and value > rules["max"]:
            result.add_error(f"字段 '{field}' 的值不能大于 {rules['max']}", field=field)

        if "pattern" in rules and isinstance(value, str):
            if not re.match(rules["pattern"], value):
                result.add_error(
                    f"字段 '{field}' 的格式不匹配: {rules['pattern']}",
                    field=field
                )

        if "minItems" in rules and isinstance(value, list):
            if len(value) < rules["minItems"]:
                result.add_error(
                    f"字段 '{field}' 至少需要 {rules['minItems']} 个元素",
                    field=field
                )

    def _validate_profile_rules(self, config: Dict[str, Any], profile: str, result: ValidationResult):
        if not profile:
            profile = self.parser.get_value(config, "service.profile", "dev")

        profile_rules = self.rules.get("environment_overrides", {}).get(profile)
        if not profile_rules:
            return

        if not profile_rules.get("allowed_insecure", False):
            self._check_for_secrets(config, result)

        allowed_log_levels = profile_rules.get("log_level")
        if allowed_log_levels:
            log_level = self.parser.get_value(config, "logging.level.root")
            if log_level and log_level not in allowed_log_levels:
                result.add_warning(
                    f"环境 '{profile}' 建议的日志级别为: {allowed_log_levels}",
                    field="logging.level.root"
                )

    def _check_for_secrets(self, config: Dict[str, Any], result: ValidationResult):
        forbidden_patterns = self.rules.get("environment_overrides", {}).get("prod", {}).get("forbidden_patterns", [])
        
        def scan_dict(d: Dict[str, Any], prefix: str = ""):
            for key, value in d.items():
                full_key = f"{prefix}.{key}" if prefix else key
                for pattern in forbidden_patterns:
                    if pattern.lower() in key.lower():
                        result.add_warning(
                            f"检测到敏感字段 '{full_key}'，生产环境建议使用密钥管理服务",
                            field=full_key
                        )
                        break
                if isinstance(value, dict):
                    scan_dict(value, full_key)

        scan_dict(config)

    def _validate_custom_patterns(self, config: Dict[str, Any], result: ValidationResult):
        custom_validators = self.rules.get("custom_validators", {})
        
        for validator_name, pattern in custom_validators.items():
            if validator_name in ["service_name", "version_pattern"]:
                continue
            
            field_mapping = {
                "network_address": ["server.host", "redis.host", "database.host"]
            }
            
            fields = field_mapping.get(validator_name, [])
            for field in fields:
                value = self.parser.get_value(config, field)
                if value and isinstance(value, str) and not re.match(pattern, value):
                    result.add_error(
                        f"字段 '{field}' 格式不合法",
                        field=field,
                        rule=validator_name
                    )

    def validate_directory(
        self,
        dir_path: str,
        pattern: str = None,
        profile: str = None,
        fail_fast: bool = False
    ) -> BatchValidationResult:
        batch_result = BatchValidationResult()
        
        path = Path(dir_path)
        if not path.is_dir():
            raise ValueError(f"目录不存在: {dir_path}")

        config_files = []
        for ext in ['.yaml', '.yml', '.json', '.properties']:
            config_files.extend(path.rglob(f'*{ext}'))

        if pattern:
            config_files = [f for f in config_files if re.match(pattern, f.name)]

        for file_path in sorted(config_files):
            result = self.validate_file(str(file_path), profile)
            batch_result.add_result(result)

            if fail_fast and not result.is_valid:
                break

        return batch_result

    def validate_with_schema(self, config: Dict[str, Any], schema_path: str) -> Tuple[bool, List[str]]:
        try:
            with open(schema_path, 'r', encoding='utf-8') as f:
                schema = json.load(f)
            
            jsonschema.validate(instance=config, schema=schema)
            return True, []
        except jsonschema.ValidationError as e:
            return False, [f"{'.'.join(str(p) for p in e.path)}: {e.message}"]
        except Exception as e:
            return False, [f"Schema校验失败: {str(e)}"]

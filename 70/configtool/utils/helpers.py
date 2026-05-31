from __future__ import annotations
import yaml
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional, TYPE_CHECKING
from .exceptions import ConfigError, ValidationError

if TYPE_CHECKING:
    from configtool.whitelist import ConfigWhitelist

def load_yaml(file_path: str) -> Dict[str, Any]:
    path = Path(file_path)
    if not path.exists():
        raise ConfigError(f"配置文件不存在: {file_path}")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except yaml.YAMLError as e:
        raise ConfigError(f"YAML解析失败: {file_path}, 错误: {e}")

def save_yaml(data: Dict[str, Any], file_path: str) -> None:
    path = Path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
    except yaml.YAMLError as e:
        raise ConfigError(f"YAML保存失败: {file_path}, 错误: {e}")

def _values_equal(v1: Any, v2: Any) -> bool:
    if type(v1) is type(v2):
        return v1 == v2
    if isinstance(v1, (int, float)) and isinstance(v2, (int, float)):
        return v1 == v2
    if isinstance(v1, str) and isinstance(v2, (int, float)):
        try:
            return float(v1) == float(v2)
        except (ValueError, TypeError):
            return False
    if isinstance(v2, str) and isinstance(v1, (int, float)):
        try:
            return float(v1) == float(v2)
        except (ValueError, TypeError):
            return False
    return False

def _diff_lists(
    list1: List[Any],
    list2: List[Any],
    path: str,
    ignore_keys: List[str] = None,
    whitelist: Optional[ConfigWhitelist] = None,
) -> List[Tuple[str, str, Any, Any]]:
    diffs = []
    max_len = max(len(list1), len(list2))

    for i in range(max_len):
        current_path = f"{path}[{i}]"

        if i >= len(list1):
            diffs.append((current_path, "added", None, list2[i]))
        elif i >= len(list2):
            diffs.append((current_path, "removed", list1[i], None))
        else:
            v1 = list1[i]
            v2 = list2[i]

            if isinstance(v1, dict) and isinstance(v2, dict):
                diffs.extend(deep_diff(v1, v2, current_path, ignore_keys, whitelist))
            elif isinstance(v1, list) and isinstance(v2, list):
                diffs.extend(_diff_lists(v1, v2, current_path, ignore_keys, whitelist))
            elif not _values_equal(v1, v2):
                diffs.append((current_path, "modified", v1, v2))

    if len(list1) != len(list2):
        summary_path = f"{path}._length"
        diffs.append((summary_path, "modified", len(list1), len(list2)))

    return diffs

def deep_diff(
    d1: Dict[str, Any],
    d2: Dict[str, Any],
    path: str = "",
    ignore_keys: List[str] = None,
    whitelist: Optional[ConfigWhitelist] = None,
) -> List[Tuple[str, str, Any, Any]]:
    ignore_keys = ignore_keys or []
    diffs = []

    keys = set(d1.keys()) | set(d2.keys())

    for key in keys:
        if key in ignore_keys:
            continue

        current_path = f"{path}.{key}" if path else key

        if key not in d1:
            diffs.append((current_path, "added", None, d2[key]))
        elif key not in d2:
            diffs.append((current_path, "removed", d1[key], None))
        elif isinstance(d1[key], dict) and isinstance(d2[key], dict):
            diffs.extend(deep_diff(d1[key], d2[key], current_path, ignore_keys, whitelist))
        elif isinstance(d1[key], list) and isinstance(d2[key], list):
            list_diffs = _diff_lists(d1[key], d2[key], current_path, ignore_keys, whitelist)
            length_diff_only = (
                len(list_diffs) == 1
                and list_diffs[0][0].endswith("._length")
            )
            if list_diffs and not length_diff_only:
                diffs.extend(list_diffs)
            elif list_diffs and length_diff_only:
                diffs.append((current_path, "modified", d1[key], d2[key]))
            elif d1[key] != d2[key]:
                diffs.append((current_path, "modified", d1[key], d2[key]))
        elif isinstance(d1[key], dict) and not isinstance(d2[key], dict):
            diffs.append((current_path, "type_changed", d1[key], d2[key]))
        elif not isinstance(d1[key], dict) and isinstance(d2[key], dict):
            diffs.append((current_path, "type_changed", d1[key], d2[key]))
        elif isinstance(d1[key], list) and not isinstance(d2[key], list):
            diffs.append((current_path, "type_changed", d1[key], d2[key]))
        elif not isinstance(d1[key], list) and isinstance(d2[key], list):
            diffs.append((current_path, "type_changed", d1[key], d2[key]))
        elif not _values_equal(d1[key], d2[key]):
            diffs.append((current_path, "modified", d1[key], d2[key]))

    if whitelist:
        diffs = whitelist.filter_diffs(diffs)

    return diffs

def format_diff_output(diffs: List[Tuple[str, str, Any, Any]]) -> str:
    if not diffs:
        return "配置完全一致，无差异。"

    output = []
    output.append(f"发现 {len(diffs)} 处配置差异:\n")

    for path, change_type, old_val, new_val in diffs:
        if change_type == "added":
            output.append(f"  [+] {path}: {_format_value(new_val)}")
        elif change_type == "removed":
            output.append(f"  [-] {path}: {_format_value(old_val)}")
        elif change_type == "modified":
            output.append(f"  [~] {path}:")
            output.append(f"      旧值: {_format_value(old_val)}")
            output.append(f"      新值: {_format_value(new_val)}")
        elif change_type == "type_changed":
            output.append(f"  [T] {path}:")
            output.append(f"      旧值({type(old_val).__name__}): {_format_value(old_val)}")
            output.append(f"      新值({type(new_val).__name__}): {_format_value(new_val)}")

    return "\n".join(output)

def _format_value(value: Any, max_len: int = 80) -> str:
    if value is None:
        return "<null>"
    if isinstance(value, (dict, list)):
        import json
        s = json.dumps(value, ensure_ascii=False)
        if len(s) > max_len:
            s = s[:max_len] + "..."
        return s
    s = str(value)
    if len(s) > max_len:
        s = s[:max_len] + "..."
    return s

def validate_required_fields(data: Dict[str, Any], required: List[str]) -> None:
    missing = [f for f in required if f not in data or data[f] is None]
    if missing:
        raise ValidationError(f"缺少必填字段: {', '.join(missing)}")

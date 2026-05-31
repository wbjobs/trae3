import json
from typing import Any, Dict, List, Optional, Union
from pathlib import Path
from configtool.utils import get_logger, deep_diff, load_yaml
from configtool.whitelist import ConfigWhitelist
from .models import DiffResult, ConfigDiff, ChangeType

logger = get_logger("config_diff")

class ConfigComparator:
    def __init__(self, ignore_keys: Optional[List[str]] = None):
        self.ignore_keys = ignore_keys or ["update_time", "version", "last_modified"]

    def compare_files(
        self,
        source_file: str,
        target_file: str,
        output_format: str = "text",
        whitelist: Optional[ConfigWhitelist] = None,
    ) -> DiffResult:
        logger.info(f"开始比对配置文件: {source_file} <-> {target_file}")

        source_data = self._load_config(source_file)
        target_data = self._load_config(target_file)

        return self._compare(
            source_data,
            target_data,
            source=source_file,
            target=target_file,
            whitelist=whitelist,
        )

    def compare_configs(
        self,
        source_config: Dict[str, Any],
        target_config: Dict[str, Any],
        source_name: str = "source",
        target_name: str = "target",
        whitelist: Optional[ConfigWhitelist] = None,
    ) -> DiffResult:
        logger.info(f"开始比对配置数据: {source_name} <-> {target_name}")
        return self._compare(
            source_config,
            target_config,
            source=source_name,
            target=target_name,
            whitelist=whitelist,
        )

    def compare_env(
        self,
        env1_name: str,
        env2_name: str,
        namespace: str = "application",
        config_center_type: str = "apollo",
        whitelist: Optional[ConfigWhitelist] = None,
    ) -> DiffResult:
        logger.info(f"开始比对环境配置: {env1_name} <-> {env2_name}, namespace={namespace}")

        from configtool.config_center import get_config_center

        center1 = get_config_center(config_center_type, env1_name)
        center2 = get_config_center(config_center_type, env2_name)

        config1 = center1.get_config(namespace)
        config2 = center2.get_config(namespace)

        result = self._compare(
            config1,
            config2,
            source=f"{config_center_type}:{env1_name}/{namespace}",
            target=f"{config_center_type}:{env2_name}/{namespace}",
            whitelist=whitelist,
        )
        result.metadata["env1"] = env1_name
        result.metadata["env2"] = env2_name
        result.metadata["namespace"] = namespace
        result.metadata["config_center"] = config_center_type

        return result

    def compare_with_version(
        self,
        current_config: Dict[str, Any],
        version: int,
        app_id: str,
        namespace: str = "application",
        whitelist: Optional[ConfigWhitelist] = None,
    ) -> DiffResult:
        logger.info(f"开始比对当前配置与历史版本: version={version}, app={app_id}")

        from configtool.version_db import VersionDB

        db = VersionDB()
        historical_config = db.get_config_version(app_id, namespace, version)

        if not historical_config:
            raise ValueError(f"未找到历史版本: app={app_id}, namespace={namespace}, version={version}")

        return self._compare(
            historical_config["config_data"],
            current_config,
            source=f"version:{version}",
            target="current",
            whitelist=whitelist,
        )

    def _compare(
        self,
        source_data: Dict[str, Any],
        target_data: Dict[str, Any],
        source: str,
        target: str,
        whitelist: Optional[ConfigWhitelist] = None,
    ) -> DiffResult:
        raw_diffs = deep_diff(source_data, target_data, ignore_keys=self.ignore_keys, whitelist=whitelist)

        config_diffs = []
        for key_path, change_type_str, old_val, new_val in raw_diffs:
            change_type = ChangeType(change_type_str)
            config_diffs.append(
                ConfigDiff(
                    key_path=key_path,
                    change_type=change_type,
                    old_value=old_val,
                    new_value=new_val,
                )
            )

        result = DiffResult(
            source=source,
            target=target,
            diffs=config_diffs,
        )

        logger.info(
            f"比对完成: 总计 {result.total_diffs} 处差异 "
            f"(新增: {result.added_count}, 删除: {result.removed_count}, "
            f"修改: {result.modified_count}, 类型变更: {result.type_changed_count})"
        )

        return result

    def _load_config(self, file_path: str) -> Dict[str, Any]:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"配置文件不存在: {file_path}")

        suffix = path.suffix.lower()

        if suffix in [".yaml", ".yml"]:
            return load_yaml(file_path)
        elif suffix == ".json":
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        elif suffix == ".properties":
            return self._load_properties(file_path)
        else:
            raise ValueError(f"不支持的配置文件格式: {suffix}")

    def _load_properties(self, file_path: str) -> Dict[str, Any]:
        result = {}
        with open(file_path, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line or line.startswith("#") or line.startswith("!"):
                    continue
                if "=" not in line:
                    logger.warning(f"第 {line_num} 行格式不正确，已跳过: {line}")
                    continue
                key, value = line.split("=", 1)
                result[key.strip()] = value.strip()
        return result

    def format_result(self, result: DiffResult, output_format: str = "text") -> str:
        if output_format == "text":
            return self._format_text(result)
        elif output_format == "json":
            return json.dumps(result.to_dict(), ensure_ascii=False, indent=2)
        elif output_format == "table":
            return self._format_table(result)
        else:
            raise ValueError(f"不支持的输出格式: {output_format}")

    def _format_text(self, result: DiffResult) -> str:
        lines = []
        lines.append(f"配置比对结果: {result.source}  vs  {result.target}")
        lines.append("=" * 60)
        lines.append(f"总计差异: {result.total_diffs} 处")
        lines.append(f"  新增: {result.added_count} 处")
        lines.append(f"  删除: {result.removed_count} 处")
        lines.append(f"  修改: {result.modified_count} 处")
        if result.type_changed_count > 0:
            lines.append(f"  类型变更: {result.type_changed_count} 处")
        lines.append("")

        if not result.has_changes():
            lines.append("配置完全一致，无差异。")
            return "\n".join(lines)

        lines.append("详细差异:")
        lines.append("-" * 60)

        for diff in result.diffs:
            if diff.change_type == ChangeType.ADDED:
                lines.append(f"[+] {diff.key_path}")
                lines.append(f"    值: {self._format_value(diff.new_value)}")
            elif diff.change_type == ChangeType.REMOVED:
                lines.append(f"[-] {diff.key_path}")
                lines.append(f"    值: {self._format_value(diff.old_value)}")
            elif diff.change_type == ChangeType.MODIFIED:
                lines.append(f"[~] {diff.key_path}")
                lines.append(f"    旧值: {self._format_value(diff.old_value)}")
                lines.append(f"    新值: {self._format_value(diff.new_value)}")
            elif diff.change_type == ChangeType.TYPE_CHANGED:
                lines.append(f"[T] {diff.key_path}")
                lines.append(f"    旧值({type(diff.old_value).__name__}): {self._format_value(diff.old_value)}")
                lines.append(f"    新值({type(diff.new_value).__name__}): {self._format_value(diff.new_value)}")
            lines.append("")

        return "\n".join(lines)

    def _format_table(self, result: DiffResult) -> str:
        from tabulate import tabulate

        table_data = []
        headers = ["类型", "配置项路径", "旧值", "新值"]

        type_map = {
            ChangeType.ADDED: "新增",
            ChangeType.REMOVED: "删除",
            ChangeType.MODIFIED: "修改",
            ChangeType.TYPE_CHANGED: "类型变更",
        }

        for diff in result.diffs:
            table_data.append([
                type_map[diff.change_type],
                diff.key_path,
                self._format_value(diff.old_value, 30),
                self._format_value(diff.new_value, 30),
            ])

        return tabulate(table_data, headers=headers, tablefmt="grid")

    def _format_value(self, value: Any, max_len: int = 50) -> str:
        if value is None:
            return "-"
        if isinstance(value, (dict, list)):
            s = json.dumps(value, ensure_ascii=False)
        else:
            s = str(value)
        if len(s) > max_len:
            s = s[:max_len] + "..."
        return s

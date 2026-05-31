import json
import logging
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from deepdiff import DeepDiff

from .parser import ConfigParser
from .remote import (
    ConfigCenterClient, ConfigCenterFactory,
    ConfigCenterError, ConfigNotFoundError,
    ConfigCenterTimeoutError, ConfigCenterConnectionError
)

logger = logging.getLogger(__name__)


class DiffType(Enum):
    ADDED = "added"
    REMOVED = "removed"
    MODIFIED = "modified"
    UNCHANGED = "unchanged"


@dataclass
class ConfigDiff:
    data_id: str
    group: str
    diff_type: DiffType
    source_content: Optional[str] = None
    target_content: Optional[str] = None
    source_config: Optional[Dict[str, Any]] = None
    target_config: Optional[Dict[str, Any]] = None
    detailed_diff: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "data_id": self.data_id,
            "group": self.group,
            "diff_type": self.diff_type.value,
            "has_detailed_diff": self.detailed_diff is not None
        }


@dataclass
class MigrationResult:
    success: bool
    total_items: int = 0
    migrated_items: int = 0
    failed_items: List[str] = field(default_factory=list)
    skipped_items: List[str] = field(default_factory=list)
    diffs: List[ConfigDiff] = field(default_factory=list)
    message: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "total_items": self.total_items,
            "migrated_items": self.migrated_items,
            "failed_items": self.failed_items,
            "skipped_items": self.skipped_items,
            "diffs_count": len(self.diffs),
            "message": self.message
        }


class ConfigDiffComparer:
    def __init__(self):
        self.parser = ConfigParser()

    def compare_configs(
        self,
        source_client: ConfigCenterClient,
        target_client: ConfigCenterClient,
        group: str = None,
        namespace: str = None,
        include_detailed: bool = True
    ) -> List[ConfigDiff]:
        diffs: List[ConfigDiff] = []
        
        source_configs = self._get_configs_map(source_client, group, namespace)
        target_configs = self._get_configs_map(target_client, group, namespace)
        
        all_keys = set(source_configs.keys()) | set(target_configs.keys())
        
        for key in sorted(all_keys):
            data_id, config_group = key
            source_content = source_configs.get(key)
            target_content = target_configs.get(key)
            
            diff = self._compare_single_config(
                data_id, config_group,
                source_content, target_content,
                include_detailed
            )
            diffs.append(diff)
        
        return diffs

    def _get_configs_map(
        self,
        client: ConfigCenterClient,
        group: str = None,
        namespace: str = None
    ) -> Dict[Tuple[str, str], str]:
        config_map = {}
        failed_keys = []
        
        try:
            configs = client.list_all_configs(group, namespace)
        except (ConfigCenterTimeoutError, ConfigCenterConnectionError) as e:
            logger.error(f"获取配置列表失败，无法完成差异比对: {str(e)}")
            return config_map
        except ConfigCenterError as e:
            logger.error(f"获取配置列表失败: {str(e)}")
            return config_map
        
        for config in configs:
            data_id = config.get("dataId")
            config_group = config.get("group", "DEFAULT_GROUP")
            key = (data_id, config_group)
            
            try:
                content = client.get_config(data_id, config_group, namespace)
                if content is not None:
                    config_map[key] = content
                else:
                    logger.warning(f"配置 {config_group}/{data_id} 列表中存在但获取返回空，可能已被删除")
            except (ConfigCenterTimeoutError, ConfigCenterConnectionError) as e:
                failed_keys.append(f"{config_group}/{data_id}")
                logger.warning(f"获取配置 {config_group}/{data_id} 超时/连接失败: {str(e)}")
            except ConfigCenterError as e:
                failed_keys.append(f"{config_group}/{data_id}")
                logger.warning(f"获取配置 {config_group}/{data_id} 失败: {str(e)}")
        
        if failed_keys:
            logger.warning(f"共 {len(failed_keys)} 个配置获取失败，差异比对结果可能不完整: {', '.join(failed_keys[:5])}")
        
        return config_map

    def _compare_single_config(
        self,
        data_id: str,
        group: str,
        source_content: Optional[str],
        target_content: Optional[str],
        include_detailed: bool
    ) -> ConfigDiff:
        if source_content is None:
            return ConfigDiff(
                data_id=data_id,
                group=group,
                diff_type=DiffType.REMOVED,
                target_content=target_content
            )
        
        if target_content is None:
            return ConfigDiff(
                data_id=data_id,
                group=group,
                diff_type=DiffType.ADDED,
                source_content=source_content
            )
        
        if source_content == target_content:
            return ConfigDiff(
                data_id=data_id,
                group=group,
                diff_type=DiffType.UNCHANGED
            )
        
        detailed_diff = None
        if include_detailed:
            try:
                source_config = self._parse_content(source_content)
                target_config = self._parse_content(target_content)
                
                if source_config and target_config:
                    detailed_diff = DeepDiff(
                        source_config, target_config,
                        ignore_order=True,
                        report_repetition=True
                    ).to_dict()
            except Exception:
                pass
        
        return ConfigDiff(
            data_id=data_id,
            group=group,
            diff_type=DiffType.MODIFIED,
            source_content=source_content,
            target_content=target_content,
            detailed_diff=detailed_diff
        )

    def _parse_content(self, content: str) -> Optional[Dict[str, Any]]:
        try:
            import yaml
            return yaml.safe_load(content)
        except Exception:
            pass
        
        try:
            return json.loads(content)
        except Exception:
            pass
        
        return None

    def export_diff_report(
        self,
        diffs: List[ConfigDiff],
        output_path: str,
        format: str = "json"
    ):
        report = {
            "summary": {
                "total": len(diffs),
                "added": len([d for d in diffs if d.diff_type == DiffType.ADDED]),
                "removed": len([d for d in diffs if d.diff_type == DiffType.REMOVED]),
                "modified": len([d for d in diffs if d.diff_type == DiffType.MODIFIED]),
                "unchanged": len([d for d in diffs if d.diff_type == DiffType.UNCHANGED])
            },
            "diffs": [d.to_dict() for d in diffs]
        }
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        if format == "json":
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(report, f, indent=2, ensure_ascii=False)
        elif format == "html":
            self._export_html_report(diffs, output_path)
        else:
            raise ValueError(f"不支持的导出格式: {format}")

    def _export_html_report(self, diffs: List[ConfigDiff], output_path: Path):
        html_content = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>配置差异报告</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .diff-item { border: 1px solid #ddd; margin: 10px 0; padding: 10px; border-radius: 5px; }
        .added { background: #e8f5e8; border-color: #4caf50; }
        .removed { background: #ffebee; border-color: #f44336; }
        .modified { background: #fff3e0; border-color: #ff9800; }
        .unchanged { background: #f5f5f5; border-color: #9e9e9e; }
        .label { display: inline-block; padding: 3px 8px; border-radius: 3px; color: white; font-size: 12px; }
        .label-added { background: #4caf50; }
        .label-removed { background: #f44336; }
        .label-modified { background: #ff9800; }
        .label-unchanged { background: #9e9e9e; }
    </style>
</head>
<body>
    <h1>配置差异报告</h1>
"""
        
        summary = {
            "total": len(diffs),
            "added": len([d for d in diffs if d.diff_type == DiffType.ADDED]),
            "removed": len([d for d in diffs if d.diff_type == DiffType.REMOVED]),
            "modified": len([d for d in diffs if d.diff_type == DiffType.MODIFIED]),
            "unchanged": len([d for d in diffs if d.diff_type == DiffType.UNCHANGED])
        }
        
        html_content += f"""
    <div class="summary">
        <h3>概要</h3>
        <p>总计: {summary['total']}</p>
        <p>
            <span class="label label-added">新增: {summary['added']}</span>
            <span class="label label-removed">删除: {summary['removed']}</span>
            <span class="label label-modified">修改: {summary['modified']}</span>
            <span class="label label-unchanged">未变: {summary['unchanged']}</span>
        </p>
    </div>
"""
        
        for diff in diffs:
            html_content += f"""
    <div class="diff-item {diff.diff_type.value}">
        <span class="label label-{diff.diff_type.value}">{diff.diff_type.value.upper()}</span>
        <strong>{diff.group}/{diff.data_id}</strong>
    </div>
"""
        
        html_content += """
</body>
</html>
"""
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)


class ConfigMigrator:
    def __init__(
        self,
        source_client: ConfigCenterClient,
        target_client: ConfigCenterClient
    ):
        self.source_client = source_client
        self.target_client = target_client
        self.comparer = ConfigDiffComparer()

    def migrate(
        self,
        group: str = None,
        namespace: str = None,
        target_namespace: str = None,
        data_ids: List[str] = None,
        dry_run: bool = False,
        overwrite: bool = True,
        backup_first: bool = False
    ) -> MigrationResult:
        result = MigrationResult(success=True)
        
        if target_namespace is None:
            target_namespace = namespace
        
        try:
            source_configs = self.source_client.list_all_configs(group, namespace)
            result.total_items = len(source_configs)
            
            if data_ids:
                source_configs = [c for c in source_configs if c.get("dataId") in data_ids]
            
            for config in source_configs:
                data_id = config.get("dataId")
                config_group = config.get("group", "DEFAULT_GROUP")
                config_type = config.get("type", "yaml")
                
                item_key = f"{config_group}/{data_id}"
                
                try:
                    content = self.source_client.get_config(data_id, config_group, namespace)
                    
                    if content is None:
                        result.skipped_items.append(f"{item_key}: 源配置不存在或已被删除")
                        continue
                    
                    try:
                        existing_content = self.target_client.get_config(
                            data_id, config_group, target_namespace
                        )
                    except ConfigNotFoundError:
                        existing_content = None
                    
                    if existing_content is not None:
                        if not overwrite:
                            result.skipped_items.append(f"{item_key}: 目标已存在，跳过")
                            continue
                        if existing_content == content:
                            result.skipped_items.append(f"{item_key}: 内容相同，跳过")
                            continue
                    
                    if not dry_run:
                        success = self.target_client.publish_config(
                            data_id=data_id,
                            group=config_group,
                            content=content,
                            config_type=config_type,
                            namespace=target_namespace,
                            description=f"Migrated from source cluster"
                        )
                        
                        if success:
                            result.migrated_items += 1
                            result.message += f"已迁移: {item_key}\n"
                        else:
                            result.failed_items.append(f"{item_key}: 发布失败")
                    else:
                        result.migrated_items += 1
                        result.message += f"[预览] 将迁移: {item_key}\n"
                        
                except ConfigNotFoundError as e:
                    result.failed_items.append(f"{item_key}: 源配置不存在 - {str(e)}")
                except (ConfigCenterTimeoutError, ConfigCenterConnectionError) as e:
                    result.failed_items.append(f"{item_key}: 网络超时/连接失败 - {str(e)}")
                except ConfigCenterError as e:
                    result.failed_items.append(f"{item_key}: {str(e)}")
            
            result.success = len(result.failed_items) == 0
            result.message += f"\n迁移完成: {result.migrated_items}/{result.total_items} 项成功"
            
        except (ConfigCenterTimeoutError, ConfigCenterConnectionError) as e:
            result.success = False
            result.message = f"迁移失败 - 无法连接配置中心: {str(e)}"
        except ConfigCenterError as e:
            result.success = False
            result.message = f"迁移失败: {str(e)}"
        except Exception as e:
            result.success = False
            result.message = f"迁移异常: {str(e)}"
        
        return result

    def migrate_with_rollback(
        self,
        group: str = None,
        namespace: str = None,
        target_namespace: str = None,
        backup_path: str = "./rollback_backup"
    ) -> MigrationResult:
        from .backup import ConfigBackupManager
        
        backup_manager = ConfigBackupManager(
            self.target_client,
            backup_root=backup_path,
            cluster_name="rollback"
        )
        
        print("执行迁移前备份...")
        backup_result = backup_manager.backup_full(group, target_namespace, compress=False)
        if not backup_result.success:
            return MigrationResult(
                success=False,
                message=f"迁移前备份失败: {backup_result.message}"
            )
        
        print(f"备份完成: {backup_result.backup_path}")
        
        try:
            result = self.migrate(group, namespace, target_namespace)
            
            if not result.success:
                print(f"迁移出现问题，执行回滚...")
                rollback_result = backup_manager.restore_backup(
                    backup_result.backup_path, group, target_namespace
                )
                if rollback_result.success:
                    result.message += "\n已自动回滚"
                else:
                    result.message += f"\n回滚失败: {rollback_result.message}"
            
            return result
            
        except Exception as e:
            print(f"迁移异常，执行回滚...")
            backup_manager.restore_backup(backup_result.backup_path, group, target_namespace)
            return MigrationResult(success=False, message=f"迁移异常并已回滚: {str(e)}")


class MigrationFactory:
    @staticmethod
    def create_from_cluster_configs(
        source_cluster: str,
        target_cluster: str,
        config_path: str = None
    ) -> ConfigMigrator:
        parser = ConfigParser()
        default_path = Path(__file__).parent.parent / "config" / "clusters" / "clusters.yaml"
        path = config_path or str(default_path)
        
        clusters_config = parser.parse_file(path)
        clusters_config = parser.resolve_environment_variables(clusters_config)
        
        clusters = clusters_config.get("clusters", {})
        
        if source_cluster not in clusters:
            raise ValueError(f"源集群配置不存在: {source_cluster}")
        if target_cluster not in clusters:
            raise ValueError(f"目标集群配置不存在: {target_cluster}")
        
        source_config = clusters[source_cluster]
        target_config = clusters[target_cluster]
        
        if target_config.get("read_only", False):
            raise ValueError(f"目标集群 '{target_cluster}' 是只读模式，无法迁移")
        
        source_client = ConfigCenterFactory.create_from_cluster_config(source_config)
        target_client = ConfigCenterFactory.create_from_cluster_config(target_config)
        
        return ConfigMigrator(source_client, target_client)

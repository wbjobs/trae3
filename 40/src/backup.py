import os
import json
import shutil
import hashlib
import time
import zipfile
import tempfile
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
import schedule

from .parser import ConfigParser
from .remote import (
    ConfigCenterClient, ConfigCenterFactory,
    ConfigCenterError, ConfigNotFoundError,
    ConfigCenterTimeoutError, ConfigCenterConnectionError
)

logger = logging.getLogger(__name__)


class BackupCorruptedError(Exception):
    pass


@dataclass
class BackupResult:
    success: bool
    backup_path: str = ""
    total_items: int = 0
    failed_items: List[str] = field(default_factory=list)
    message: str = ""
    backup_time: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "backup_path": self.backup_path,
            "total_items": self.total_items,
            "failed_items": self.failed_items,
            "message": self.message,
            "backup_time": self.backup_time
        }


@dataclass
class BackupInfo:
    path: str
    timestamp: str
    items_count: int
    size_bytes: int
    integrity_ok: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "path": self.path,
            "timestamp": self.timestamp,
            "items_count": self.items_count,
            "size_bytes": self.size_bytes,
            "size_mb": round(self.size_bytes / (1024 * 1024), 2),
            "integrity_ok": self.integrity_ok
        }


class ConfigBackupManager:
    def __init__(
        self,
        client: ConfigCenterClient,
        backup_root: str = "./backups",
        cluster_name: str = "default"
    ):
        self.client = client
        self.backup_root = Path(backup_root)
        self.cluster_name = cluster_name
        self.cluster_backup_dir = self.backup_root / cluster_name
        self.cluster_backup_dir.mkdir(parents=True, exist_ok=True)
        
        self.manifest_path = self.cluster_backup_dir / "backup_manifest.json"
        self.last_backup_hash = self._load_last_backup_hash()

    def _load_last_backup_hash(self) -> Dict[str, str]:
        if self.manifest_path.exists():
            try:
                with open(self.manifest_path, 'r', encoding='utf-8') as f:
                    manifest = json.load(f)
                    return manifest.get("content_hashes", {})
            except Exception as e:
                logger.warning(f"加载manifest失败: {str(e)}")
        return {}

    def _save_manifest(self, content_hashes: Dict[str, str], backup_dir: str):
        manifest = {
            "last_backup": datetime.now().isoformat(),
            "backup_dir": backup_dir,
            "content_hashes": content_hashes
        }
        
        temp_path = self.manifest_path.with_suffix('.tmp')
        try:
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(manifest, f, indent=2, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            
            os.replace(temp_path, self.manifest_path)
            logger.info("Manifest已原子更新")
        except Exception as e:
            if temp_path.exists():
                temp_path.unlink()
            raise RuntimeError(f"写入manifest失败: {str(e)}")

    def _calculate_content_hash(self, content: str) -> str:
        return hashlib.sha256(content.encode('utf-8')).hexdigest()

    def _verify_zip_integrity(self, zip_path: Path) -> Tuple[bool, int, str]:
        if not zip_path.exists():
            return False, 0, "ZIP文件不存在"
        
        try:
            with zipfile.ZipFile(zip_path, 'r') as zipf:
                bad_file = zipf.testzip()
                if bad_file:
                    return False, 0, f"ZIP文件损坏: {bad_file}"
                
                file_count = len([name for name in zipf.namelist() if not name.endswith('/')])
                
                for name in zipf.namelist():
                    with zipf.open(name) as f:
                        f.read()
                
                return True, file_count, "OK"
        except zipfile.BadZipFile as e:
            return False, 0, f"ZIP格式错误: {str(e)}"
        except Exception as e:
            return False, 0, f"校验ZIP失败: {str(e)}"

    def backup_full(
        self,
        group: str = None,
        namespace: str = None,
        compress: bool = True
    ) -> BackupResult:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = self.cluster_backup_dir / f"full_{timestamp}"
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        result = BackupResult(success=True, backup_path=str(backup_dir))
        content_hashes = {}
        
        try:
            configs = self.client.list_all_configs(group, namespace)
            result.total_items = len(configs)
            
            if result.total_items == 0:
                result.message = "没有找到需要备份的配置项"
                backup_dir.rmdir()
                result.backup_path = ""
                return result
            
            manifest_entries: List[Dict[str, Any]] = []
            
            for config in configs:
                data_id = config.get("dataId")
                config_group = config.get("group", "DEFAULT_GROUP")
                config_type = config.get("type", "yaml")
                
                try:
                    content = self.client.get_config(data_id, config_group, namespace)
                    if content is not None:
                        safe_data_id = data_id.replace('/', '_').replace('\\', '_')
                        file_ext = config_type.lower() if config_type else 'yaml'
                        filename = f"{safe_data_id}.{file_ext}"
                        
                        file_path = backup_dir / config_group / filename
                        file_path.parent.mkdir(parents=True, exist_ok=True)
                        
                        with open(file_path, 'w', encoding='utf-8') as f:
                            f.write(content)
                            f.flush()
                            os.fsync(f.fileno())
                        
                        content_hash = self._calculate_content_hash(content)
                        content_hashes[f"{config_group}:{data_id}"] = content_hash
                        
                        manifest_entries.append({
                            "data_id": data_id,
                            "group": config_group,
                            "type": config_type,
                            "filename": filename,
                            "hash": content_hash,
                            "size": len(content)
                        })
                        
                        result.message += f"已备份: {config_group}/{data_id}\n"
                except ConfigCenterError as e:
                    result.failed_items.append(f"{config_group}/{data_id}: {str(e)}")
            
            with open(backup_dir / "_backup_manifest.json", 'w', encoding='utf-8') as f:
                json.dump({
                    "cluster": self.cluster_name,
                    "timestamp": timestamp,
                    "backup_type": "full",
                    "group": group,
                    "namespace": namespace,
                    "items": manifest_entries
                }, f, indent=2, ensure_ascii=False)
            
            self._save_manifest(content_hashes, str(backup_dir))
            self.last_backup_hash = content_hashes
            
            if compress:
                try:
                    zip_path = self._compress_backup(backup_dir)
                    result.backup_path = zip_path
                except BackupCorruptedError as e:
                    result.success = False
                    result.message = f"压缩失败: {str(e)}"
                    return result
            
            result.success = len(result.failed_items) == 0
            if not result.success:
                result.message = f"备份完成，{len(result.failed_items)} 项失败"
            
        except (ConfigCenterTimeoutError, ConfigCenterConnectionError) as e:
            result.success = False
            result.message = f"连接配置中心失败: {str(e)}"
            if backup_dir.exists():
                shutil.rmtree(backup_dir)
        except Exception as e:
            result.success = False
            result.message = f"备份异常: {str(e)}"
            if backup_dir.exists():
                shutil.rmtree(backup_dir)
        
        return result

    def backup_incremental(
        self,
        group: str = None,
        namespace: str = None
    ) -> BackupResult:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = self.cluster_backup_dir / f"incr_{timestamp}"
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        result = BackupResult(success=True, backup_path=str(backup_dir))
        content_hashes = self.last_backup_hash.copy()
        changed_count = 0
        
        try:
            configs = self.client.list_all_configs(group, namespace)
            
            for config in configs:
                data_id = config.get("dataId")
                config_group = config.get("group", "DEFAULT_GROUP")
                config_type = config.get("type", "yaml")
                config_key = f"{config_group}:{data_id}"
                
                try:
                    content = self.client.get_config(data_id, config_group, namespace)
                    if content is not None:
                        current_hash = self._calculate_content_hash(content)
                        last_hash = self.last_backup_hash.get(config_key)
                        
                        if current_hash != last_hash:
                            safe_data_id = data_id.replace('/', '_').replace('\\', '_')
                            file_ext = config_type.lower() if config_type else 'yaml'
                            filename = f"{safe_data_id}.{file_ext}"
                            
                            file_path = backup_dir / config_group / filename
                            file_path.parent.mkdir(parents=True, exist_ok=True)
                            
                            with open(file_path, 'w', encoding='utf-8') as f:
                                f.write(content)
                                f.flush()
                                os.fsync(f.fileno())
                            
                            content_hashes[config_key] = current_hash
                            changed_count += 1
                            result.message += f"已更新: {config_group}/{data_id}\n"
                            
                except ConfigCenterError as e:
                    result.failed_items.append(f"{config_group}/{data_id}: {str(e)}")
            
            if changed_count > 0:
                self._save_manifest(content_hashes, str(backup_dir))
                self.last_backup_hash = content_hashes
                result.total_items = changed_count
                
                try:
                    zip_path = self._compress_backup(backup_dir)
                    result.backup_path = zip_path
                except BackupCorruptedError as e:
                    result.success = False
                    result.message = f"压缩失败: {str(e)}"
            else:
                shutil.rmtree(backup_dir)
                result.backup_path = ""
                result.message = "没有检测到配置变更"
            
            result.success = len(result.failed_items) == 0
            
        except Exception as e:
            result.success = False
            result.message = f"增量备份失败: {str(e)}"
            if backup_dir.exists():
                shutil.rmtree(backup_dir)
        
        return result

    def _compress_backup(self, backup_dir: Path) -> str:
        zip_path = backup_dir.with_suffix('.zip')
        
        try:
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, _, files in os.walk(backup_dir):
                    for file in files:
                        file_path = Path(root) / file
                        arcname = file_path.relative_to(backup_dir.parent)
                        zipf.write(file_path, arcname)
            
            integrity_ok, file_count, integrity_msg = self._verify_zip_integrity(zip_path)
            if not integrity_ok:
                if zip_path.exists():
                    zip_path.unlink()
                raise BackupCorruptedError(integrity_msg)
            
            logger.info(f"ZIP完整性校验通过，包含 {file_count} 个文件")
            
            shutil.rmtree(backup_dir)
            return str(zip_path)
            
        except BackupCorruptedError:
            raise
        except Exception as e:
            if zip_path.exists():
                zip_path.unlink()
            raise BackupCorruptedError(f"创建ZIP失败: {str(e)}")

    def restore_backup(
        self,
        backup_path: str,
        group: str = None,
        namespace: str = None,
        dry_run: bool = False
    ) -> BackupResult:
        result = BackupResult(success=True)
        backup_path = Path(backup_path)
        
        if not backup_path.exists():
            result.success = False
            result.message = f"备份不存在: {backup_path}"
            return result
        
        if backup_path.suffix == '.zip':
            integrity_ok, _, integrity_msg = self._verify_zip_integrity(backup_path)
            if not integrity_ok:
                result.success = False
                result.message = f"备份文件损坏: {integrity_msg}"
                return result
        
        temp_dir = self.cluster_backup_dir / f"_temp_restore_{int(time.time())}"
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
        
        backup_manifest = None
        
        try:
            extract_dir = backup_path
            if backup_path.suffix == '.zip':
                with zipfile.ZipFile(backup_path, 'r') as zipf:
                    zipf.extractall(temp_dir)
                extract_dir = temp_dir / backup_path.stem
                if not extract_dir.exists():
                    extract_dir = temp_dir
                
                manifest_path = extract_dir / "_backup_manifest.json"
                if manifest_path.exists():
                    with open(manifest_path, 'r', encoding='utf-8') as f:
                        backup_manifest = json.load(f)
            
            data_id_map = {}
            if backup_manifest and "items" in backup_manifest:
                for item in backup_manifest["items"]:
                    filename = item["filename"]
                    data_id_map[filename] = item["data_id"]
            
            for item in extract_dir.rglob('*'):
                if not item.is_file():
                    continue
                if item.name == "_backup_manifest.json":
                    continue
                
                rel_path = item.relative_to(extract_dir)
                if len(rel_path.parts) < 2:
                    continue
                
                config_group = rel_path.parts[0]
                filename = rel_path.name
                
                if group and config_group != group:
                    continue
                
                if filename in data_id_map:
                    data_id = data_id_map[filename]
                else:
                    data_id = Path(filename).stem
                
                config_type = Path(filename).suffix.lstrip('.')
                
                with open(item, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                if backup_manifest and "items" in backup_manifest:
                    for item_info in backup_manifest["items"]:
                        if item_info["filename"] == filename:
                            expected_hash = item_info.get("hash")
                            if expected_hash:
                                actual_hash = self._calculate_content_hash(content)
                                if expected_hash != actual_hash:
                                    result.failed_items.append(
                                        f"{config_group}/{data_id}: 内容哈希校验失败，可能已被篡改"
                                    )
                                    continue
                
                result.total_items += 1
                
                if not dry_run:
                    try:
                        success = self.client.publish_config(
                            data_id=data_id,
                            group=config_group,
                            content=content,
                            config_type=config_type,
                            namespace=namespace
                        )
                        if success:
                            result.message += f"已恢复: {config_group}/{data_id}\n"
                        else:
                            result.failed_items.append(f"{config_group}/{data_id}: 发布失败")
                    except ConfigCenterError as e:
                        result.failed_items.append(f"{config_group}/{data_id}: {str(e)}")
                else:
                    result.message += f"[预览] 将恢复: {config_group}/{data_id}\n"
            
            result.success = len(result.failed_items) == 0
            
        finally:
            if temp_dir.exists():
                shutil.rmtree(temp_dir)
        
        return result

    def list_backups(self) -> List[BackupInfo]:
        backups = []
        
        for item in self.cluster_backup_dir.iterdir():
            if item.name.startswith(('full_', 'incr_')):
                try:
                    integrity_ok = True
                    if item.is_dir():
                        count = len([f for f in item.rglob('*') if f.is_file()])
                        size = sum(f.stat().st_size for f in item.rglob('*') if f.is_file())
                        timestamp = item.name.split('_', 1)[1]
                    elif item.suffix == '.zip':
                        integrity_ok, count, _ = self._verify_zip_integrity(item)
                        size = item.stat().st_size
                        timestamp = item.stem.split('_', 1)[1]
                    else:
                        continue
                    
                    backups.append(BackupInfo(
                        path=str(item),
                        timestamp=timestamp,
                        items_count=count,
                        size_bytes=size,
                        integrity_ok=integrity_ok
                    ))
                except Exception as e:
                    logger.warning(f"读取备份信息失败 {item}: {str(e)}")
                    continue
        
        backups.sort(key=lambda x: x.timestamp, reverse=True)
        return backups

    def cleanup_old_backups(self, retention_days: int = 30) -> int:
        cutoff_date = datetime.now() - timedelta(days=retention_days)
        deleted_count = 0
        
        for backup in self.list_backups():
            try:
                backup_time = datetime.strptime(backup.timestamp, "%Y%m%d_%H%M%S")
                if backup_time < cutoff_date:
                    path = Path(backup.path)
                    if path.is_dir():
                        shutil.rmtree(path)
                    else:
                        path.unlink()
                    deleted_count += 1
                    logger.info(f"已删除过期备份: {backup.path}")
            except Exception as e:
                logger.warning(f"删除备份失败 {backup.path}: {str(e)}")
                continue
        
        return deleted_count


class ScheduledBackupService:
    def __init__(self, cluster_config_path: str = None):
        self.parser = ConfigParser()
        self.cluster_config = self._load_cluster_config(cluster_config_path)
        self.backup_managers: Dict[str, ConfigBackupManager] = {}
        self.is_running = False

    def _load_cluster_config(self, config_path: str = None) -> Dict[str, Any]:
        default_path = Path(__file__).parent.parent / "config" / "clusters" / "clusters.yaml"
        path = config_path or str(default_path)
        
        if Path(path).exists():
            config = self.parser.parse_file(path)
            return self.parser.resolve_environment_variables(config)
        
        return {"clusters": {}}

    def setup_backup_tasks(self):
        clusters = self.cluster_config.get("clusters", {})
        
        for cluster_name, cluster_info in clusters.items():
            backup_path = cluster_info.get("backup_path", f"./backups/{cluster_name}")
            
            try:
                client = ConfigCenterFactory.create_from_cluster_config(cluster_info)
                manager = ConfigBackupManager(client, backup_path, cluster_name)
                self.backup_managers[cluster_name] = manager
                
                schedule_time = os.environ.get("BACKUP_SCHEDULE", "02:00")
                schedule.every().day.at(schedule_time).do(
                    self._run_backup_task,
                    cluster_name=cluster_name,
                    manager=manager
                )
                
                print(f"已为集群 '{cluster_name}' 设置定时备份任务，每天 {schedule_time} 执行")
                
            except Exception as e:
                print(f"集群 '{cluster_name}' 备份任务设置失败: {str(e)}")

    def _run_backup_task(self, cluster_name: str, manager: ConfigBackupManager):
        print(f"[{datetime.now()}] 开始执行集群 '{cluster_name}' 备份任务...")
        
        try:
            result = manager.backup_full()
            
            if result.success:
                retention_days = int(os.environ.get("BACKUP_RETENTION_DAYS", "30"))
                deleted = manager.cleanup_old_backups(retention_days)
                print(f"[{datetime.now()}] 集群 '{cluster_name}' 备份完成: {result.backup_path}，清理旧备份 {deleted} 个")
            else:
                print(f"[{datetime.now()}] 集群 '{cluster_name}' 备份失败: {result.message}")
        except Exception as e:
            print(f"[{datetime.now()}] 集群 '{cluster_name}' 备份异常: {str(e)}")

    def start(self):
        self.setup_backup_tasks()
        self.is_running = True
        
        print("定时备份服务已启动，按 Ctrl+C 停止...")
        
        while self.is_running:
            try:
                schedule.run_pending()
                time.sleep(60)
            except Exception as e:
                print(f"定时任务循环异常: {str(e)}")
                time.sleep(60)

    def stop(self):
        self.is_running = False
        print("定时备份服务已停止")

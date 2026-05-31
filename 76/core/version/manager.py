import json
import os
import shutil
import threading
import uuid
from datetime import datetime
from typing import Any

from core.version.differ import VersionDiffer
from core.version.schema import ChangeRecord, ChangeType, VersionInfo, VersionSnapshot
from utils.config import ConfigManager
from utils.crypto import compute_file_hash
from utils.logger import setup_logger
from utils.platform import normalize_path, safe_makedirs
from exceptions import VersionConflictError, VersionNotFoundError


class VersionManager:
    def __init__(self) -> None:
        config = ConfigManager.get()
        self._logger = setup_logger("version.manager", config.logging.level, config.logging.file)
        self._storage_path = config.version_mgmt.storage_path
        self._max_versions = config.version_mgmt.max_versions
        self._snapshots: dict[str, VersionSnapshot] = {}
        self._lock = threading.RLock()
        safe_makedirs(self._storage_path)
        self._load_snapshots()

    def create_version(
        self,
        program_id: str,
        directory: str,
        description: str = "",
        author: str = "",
        parent_version: str | None = None,
        tags: list[str] | None = None,
        force: bool = False,
    ) -> VersionSnapshot:
        if not os.path.isdir(directory):
            raise VersionNotFoundError(f"目录不存在: {directory}")

        with self._lock:
            version_id = str(uuid.uuid4())
            version_number = self._next_version_number(program_id)
            now = datetime.now()

            version_info = VersionInfo(
                version_id=version_id,
                program_id=program_id,
                version_number=version_number,
                description=description,
                author=author,
                parent_version=parent_version,
                tags=tags or [],
                created_at=now,
            )

            file_hashes = VersionDiffer.scan_directory(directory)
            old_snapshot = self._get_latest_snapshot(program_id)

            if old_snapshot and not force:
                if file_hashes == old_snapshot.file_hashes:
                    raise VersionConflictError(
                        f"与上一版本 {old_snapshot.version_info.version_number} 内容无变化"
                    )

            new_snapshot = VersionSnapshot(
                version_info=version_info,
                file_hashes=file_hashes,
            )

            changes = VersionDiffer.compute_snapshot_diff(old_snapshot, new_snapshot)
            new_snapshot.changes = changes

            total_size = 0
            try:
                for root, _dirs, files in os.walk(directory):
                    for fname in files:
                        try:
                            total_size += os.path.getsize(os.path.join(root, fname))
                        except (OSError, PermissionError):
                            continue
            except (OSError, PermissionError):
                pass
            new_snapshot.size_bytes = total_size

            self._save_version_data(new_snapshot, directory)
            self._snapshots[version_id] = new_snapshot

            self._logger.info(
                "版本已创建: %s v%s (%d 个文件变更, %d 字节)",
                program_id, version_number, len(changes), total_size,
            )

            if len(self._get_program_versions(program_id)) > self._max_versions:
                self._prune_old_versions(program_id)

            return new_snapshot

    def get_version(self, version_id: str) -> VersionSnapshot:
        with self._lock:
            snapshot = self._snapshots.get(version_id)
            if snapshot is None:
                raise VersionNotFoundError(f"版本不存在: {version_id}")
            return snapshot

    def list_versions(self, program_id: str) -> list[VersionSnapshot]:
        with self._lock:
            return self._get_program_versions(program_id)

    def restore_version(self, version_id: str, target_directory: str) -> None:
        with self._lock:
            snapshot = self.get_version(version_id)
            version_dir = os.path.join(self._storage_path, version_id, "files")

            if not os.path.isdir(version_dir):
                raise VersionNotFoundError(f"版本数据不存在: {version_id}")

            safe_makedirs(target_directory)

            for item in os.listdir(version_dir):
                src = os.path.join(version_dir, item)
                dst = os.path.join(target_directory, item)
                try:
                    if os.path.isdir(src):
                        shutil.copytree(src, dst, dirs_exist_ok=True)
                    else:
                        shutil.copy2(src, dst)
                except (OSError, shutil.Error) as e:
                    self._logger.warning("恢复文件失败: %s - %s", item, e)

            self._logger.info("版本已恢复: %s -> %s", version_id, target_directory)

    def delete_version(self, version_id: str) -> bool:
        with self._lock:
            if version_id not in self._snapshots:
                raise VersionNotFoundError(f"版本不存在: {version_id}")

            version_dir = os.path.join(self._storage_path, version_id)
            deleted = False
            if os.path.isdir(version_dir):
                try:
                    shutil.rmtree(version_dir)
                    deleted = True
                except OSError as e:
                    self._logger.warning("删除版本目录失败: %s", e)

            if deleted:
                self._snapshots.pop(version_id, None)
                self._logger.info("版本已删除: %s", version_id)
            return deleted

    def compare_versions(
        self, old_version_id: str, new_version_id: str
    ) -> list[dict[str, Any]]:
        with self._lock:
            old_snap = self.get_version(old_version_id)
            new_snap = self.get_version(new_version_id)
            changes = VersionDiffer.compute_snapshot_diff(old_snap, new_snap)
            return [c.to_dict() for c in changes]

    def verify_version(self, version_id: str) -> tuple[bool, list[str]]:
        with self._lock:
            snapshot = self.get_version(version_id)
            version_dir = os.path.join(self._storage_path, version_id, "files")
            errors: list[str] = []

            if not os.path.isdir(version_dir):
                return False, ["版本目录不存在"]

            for rel_path, expected_hash in snapshot.file_hashes.items():
                file_path = os.path.join(version_dir, rel_path)
                if not os.path.isfile(file_path):
                    errors.append(f"文件缺失: {rel_path}")
                    continue
                try:
                    actual_hash = compute_file_hash(file_path)
                    if actual_hash != expected_hash:
                        errors.append(f"哈希不匹配: {rel_path}")
                except OSError as e:
                    errors.append(f"无法读取: {rel_path}: {e}")

            return len(errors) == 0, errors

    def _next_version_number(self, program_id: str) -> str:
        versions = self._get_program_versions(program_id)
        if not versions:
            return "1.0.0"
        latest = versions[-1]
        parts = latest.version_info.version_number.split(".")
        try:
            if len(parts) >= 3:
                patch = int(parts[-1]) + 1
                return ".".join(parts[:-1] + [str(patch)])
            else:
                return "1.0.0"
        except (ValueError, IndexError):
            return "1.0.0"

    def _get_latest_snapshot(self, program_id: str) -> VersionSnapshot | None:
        versions = self._get_program_versions(program_id)
        return versions[-1] if versions else None

    def _get_program_versions(self, program_id: str) -> list[VersionSnapshot]:
        versions = [
            s for s in self._snapshots.values()
            if s.version_info.program_id == program_id
        ]
        versions.sort(key=lambda s: s.version_info.created_at)
        return versions

    def _save_version_data(self, snapshot: VersionSnapshot, source_dir: str) -> None:
        version_dir = os.path.join(self._storage_path, snapshot.version_info.version_id)
        safe_makedirs(version_dir)

        meta_file = os.path.join(version_dir, "meta.json")
        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(snapshot.to_dict(), f, ensure_ascii=False, indent=2)

        files_dir = os.path.join(version_dir, "files")
        if os.path.isdir(source_dir):
            try:
                shutil.copytree(source_dir, files_dir, dirs_exist_ok=True)
            except (OSError, shutil.Error) as e:
                self._logger.warning("复制版本文件失败: %s", e)

    def _prune_old_versions(self, program_id: str) -> None:
        versions = self._get_program_versions(program_id)
        while len(versions) > self._max_versions:
            oldest = versions.pop(0)
            try:
                self.delete_version(oldest.version_info.version_id)
            except VersionNotFoundError:
                pass

    def _load_snapshots(self) -> None:
        if not os.path.isdir(self._storage_path):
            return
        for entry in os.listdir(self._storage_path):
            meta_file = os.path.join(self._storage_path, entry, "meta.json")
            if os.path.isfile(meta_file):
                try:
                    with open(meta_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    vi_data = data["version_info"]
                    version_info = VersionInfo.from_dict(vi_data)
                    changes = []
                    for c in data.get("changes", []):
                        c["change_type"] = ChangeType(c["change_type"])
                        c["timestamp"] = datetime.fromisoformat(c["timestamp"])
                        changes.append(ChangeRecord(**c))
                    snapshot = VersionSnapshot(
                        version_info=version_info,
                        file_hashes=data.get("file_hashes", {}),
                        changes=changes,
                        size_bytes=data.get("size_bytes", 0),
                    )
                    self._snapshots[version_info.version_id] = snapshot
                except (json.JSONDecodeError, KeyError, OSError, ValueError) as e:
                    self._logger.warning("加载版本元数据失败: %s - %s", entry, e)

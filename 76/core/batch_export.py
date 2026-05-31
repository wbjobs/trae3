import json
import os
import shutil
import tempfile
import threading
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable

from utils.config import ConfigManager
from utils.logger import setup_logger
from utils.platform import safe_makedirs
from exceptions import VersionNotFoundError


class ExportFormat(Enum):
    JSON = "json"
    ZIP = "zip"
    TAR_GZ = "tar.gz"
    CSV = "csv"


@dataclass
class ExportProgress:
    current: int = 0
    total: int = 0
    message: str = ""
    percentage: float = 0.0


@dataclass
class ExportOptions:
    format: ExportFormat = ExportFormat.JSON
    include_files: bool = True
    include_metadata: bool = True
    include_changes: bool = True
    compression_level: int = 6
    output_dir: str = "./exports"
    file_pattern: str = "*"


@dataclass
class ExportResult:
    success: bool
    output_path: str = ""
    total_files: int = 0
    total_size: int = 0
    error_message: str = ""
    created_at: datetime = field(default_factory=datetime.now)


class BatchExporter:
    def __init__(self) -> None:
        config = ConfigManager.get()
        self._logger = setup_logger(
            "exporter.batch", config.logging.level, config.logging.file
        )
        self._version_storage = config.version_mgmt.storage_path
        self._lock = threading.RLock()
        self._current_export: threading.Thread | None = None
        self._progress: ExportProgress | None = None
        self._callbacks: list[Callable[[ExportProgress], None]] = []

    def on_progress(self, callback: Callable[[ExportProgress], None]) -> None:
        self._callbacks.append(callback)

    def get_progress(self) -> ExportProgress | None:
        return self._progress

    def is_exporting(self) -> bool:
        return self._current_export is not None and self._current_export.is_alive()

    def export_versions(
        self,
        program_id: str,
        version_ids: list[str],
        options: ExportOptions | None = None,
        background: bool = True,
    ) -> ExportResult | None:
        opts = options or ExportOptions()
        safe_makedirs(opts.output_dir)

        if background:
            thread = threading.Thread(
                target=self._do_export,
                args=(program_id, version_ids, opts),
                daemon=True,
            )
            self._current_export = thread
            thread.start()
            return None
        else:
            return self._do_export(program_id, version_ids, opts)

    def export_all(
        self,
        program_id: str,
        options: ExportOptions | None = None,
        background: bool = True,
    ) -> ExportResult | None:
        version_ids = self._get_all_version_ids(program_id)
        return self.export_versions(program_id, version_ids, options, background)

    def _get_all_version_ids(self, program_id: str) -> list[str]:
        version_ids: list[str] = []
        if not os.path.isdir(self._version_storage):
            return version_ids
        for entry in os.listdir(self._version_storage):
            meta_file = os.path.join(self._version_storage, entry, "meta.json")
            if os.path.isfile(meta_file):
                try:
                    with open(meta_file, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                    if meta.get("version_info", {}).get("program_id") == program_id:
                        version_ids.append(entry)
                except (json.JSONDecodeError, OSError):
                    pass
        return version_ids

    def _do_export(
        self, program_id: str, version_ids: list[str], opts: ExportOptions
    ) -> ExportResult:
        result = ExportResult(success=False)
        self._progress = ExportProgress(total=len(version_ids))

        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            base_name = f"{program_id}_{timestamp}"

            if opts.format == ExportFormat.JSON:
                result = self._export_json(program_id, version_ids, opts, base_name)
            elif opts.format == ExportFormat.ZIP:
                result = self._export_zip(program_id, version_ids, opts, base_name)
            elif opts.format == ExportFormat.CSV:
                result = self._export_csv(program_id, version_ids, opts, base_name)
            else:
                result.error_message = f"不支持的导出格式: {opts.format}"
                return result

        except Exception as e:
            result.error_message = str(e)
            self._logger.error("导出失败: %s", e)

        return result

    def _export_json(
        self, program_id: str, version_ids: list[str], opts: ExportOptions, base_name: str
    ) -> ExportResult:
        result = ExportResult(success=False)
        export_data: list[dict[str, Any]] = []

        for i, vid in enumerate(version_ids):
            self._update_progress(i + 1, len(version_ids), f"处理版本 {vid[:8]}...")

            try:
                version_data = self._load_version_data(vid, opts)
                export_data.append(version_data)
            except Exception as e:
                self._logger.warning("跳过版本 %s: %s", vid, e)

        output_path = os.path.join(opts.output_dir, f"{base_name}.json")
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)

        result.success = True
        result.output_path = output_path
        result.total_files = len(export_data)
        result.total_size = os.path.getsize(output_path)

        self._update_progress(len(version_ids), len(version_ids), "导出完成")
        self._logger.info("JSON 导出完成: %s", output_path)
        return result

    def _export_zip(
        self, program_id: str, version_ids: list[str], opts: ExportOptions, base_name: str
    ) -> ExportResult:
        result = ExportResult(success=False)
        output_path = os.path.join(opts.output_dir, f"{base_name}.zip")
        total_files = 0
        total_size = 0

        with zipfile.ZipFile(
            output_path, "w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=opts.compression_level,
        ) as zf:
            for i, vid in enumerate(version_ids):
                self._update_progress(i + 1, len(version_ids), f"打包版本 {vid[:8]}...")

                try:
                    files_added = self._add_version_to_zip(zf, vid, opts)
                    total_files += files_added
                except Exception as e:
                    self._logger.warning("跳过版本 %s: %s", vid, e)

            index_data = self._create_index(version_ids)
            zf.writestr("index.json", json.dumps(index_data, ensure_ascii=False, indent=2))

        result.success = True
        result.output_path = output_path
        result.total_files = total_files
        result.total_size = os.path.getsize(output_path)

        self._update_progress(len(version_ids), len(version_ids), "导出完成")
        self._logger.info("ZIP 导出完成: %s", output_path)
        return result

    def _export_csv(
        self, program_id: str, version_ids: list[str], opts: ExportOptions, base_name: str
    ) -> ExportResult:
        result = ExportResult(success=False)
        import csv

        output_path = os.path.join(opts.output_dir, f"{base_name}.csv")
        rows: list[list[str]] = []

        headers = [
            "version_id", "program_id", "version_number",
            "description", "author", "created_at", "file_count",
        ]
        rows.append(headers)

        for i, vid in enumerate(version_ids):
            self._update_progress(i + 1, len(version_ids), f"处理版本 {vid[:8]}...")

            try:
                meta_file = os.path.join(self._version_storage, vid, "meta.json")
                with open(meta_file, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                vi = meta.get("version_info", {})
                rows.append([
                    vi.get("version_id", ""),
                    vi.get("program_id", ""),
                    vi.get("version_number", ""),
                    vi.get("description", ""),
                    vi.get("author", ""),
                    vi.get("created_at", ""),
                    str(len(meta.get("file_hashes", {}))),
                ])
            except Exception as e:
                self._logger.warning("跳过版本 %s: %s", vid, e)

        with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerows(rows)

        result.success = True
        result.output_path = output_path
        result.total_files = len(rows) - 1
        result.total_size = os.path.getsize(output_path)

        self._update_progress(len(version_ids), len(version_ids), "导出完成")
        self._logger.info("CSV 导出完成: %s", output_path)
        return result

    def _load_version_data(self, version_id: str, opts: ExportOptions) -> dict[str, Any]:
        meta_file = os.path.join(self._version_storage, version_id, "meta.json")
        if not os.path.isfile(meta_file):
            raise VersionNotFoundError(f"版本不存在: {version_id}")

        with open(meta_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not opts.include_changes:
            data.pop("changes", None)
        if not opts.include_files:
            data.pop("file_hashes", None)

        return data

    def _add_version_to_zip(
        self, zf: zipfile.ZipFile, version_id: str, opts: ExportOptions
    ) -> int:
        version_dir = os.path.join(self._version_storage, version_id)
        if not os.path.isdir(version_dir):
            raise VersionNotFoundError(f"版本目录不存在: {version_id}")

        files_added = 0

        meta_file = os.path.join(version_dir, "meta.json")
        if opts.include_metadata and os.path.isfile(meta_file):
            arcname = f"{version_id}/meta.json"
            zf.write(meta_file, arcname)
            files_added += 1

        files_dir = os.path.join(version_dir, "files")
        if opts.include_files and os.path.isdir(files_dir):
            for root, _, files in os.walk(files_dir):
                for fname in files:
                    full_path = os.path.join(root, fname)
                    rel_path = os.path.relpath(full_path, files_dir)
                    arcname = f"{version_id}/files/{rel_path}"
                    zf.write(full_path, arcname)
                    files_added += 1

        return files_added

    def _create_index(self, version_ids: list[str]) -> dict[str, Any]:
        return {
            "exported_at": datetime.now().isoformat(),
            "total_versions": len(version_ids),
            "versions": version_ids,
        }

    def _update_progress(self, current: int, total: int, message: str) -> None:
        self._progress = ExportProgress(
            current=current,
            total=total,
            message=message,
            percentage=round(current / max(total, 1) * 100, 1),
        )
        for cb in self._callbacks:
            try:
                cb(self._progress)
            except Exception as e:
                self._logger.error("进度回调错误: %s", e)

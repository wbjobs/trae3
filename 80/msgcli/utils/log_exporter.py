import json
import csv
import gzip
import zipfile
import tarfile
import re
import os
from enum import Enum
from typing import List, Dict, Any, Optional, Iterator, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from io import StringIO, BytesIO

from ..common import get_logger


class ExportFormat(Enum):
    JSON = "json"
    JSONL = "jsonl"
    CSV = "csv"
    TSV = "tsv"
    TEXT = "text"
    XML = "xml"


class CompressionType(Enum):
    NONE = "none"
    GZIP = "gzip"
    ZIP = "zip"
    TAR_GZ = "tar.gz"


@dataclass
class LogFilter:
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    log_level: Optional[str] = None
    keywords: List[str] = field(default_factory=list)
    exclude_keywords: List[str] = field(default_factory=list)
    pattern: Optional[str] = None
    max_entries: int = 0
    sources: List[str] = field(default_factory=list)

    def matches(self, log_entry: Dict[str, Any]) -> bool:
        if self.start_time and "timestamp" in log_entry:
            try:
                ts = self._parse_timestamp(log_entry["timestamp"])
                if ts < self.start_time:
                    return False
            except:
                pass
        
        if self.end_time and "timestamp" in log_entry:
            try:
                ts = self._parse_timestamp(log_entry["timestamp"])
                if ts > self.end_time:
                    return False
            except:
                pass
        
        if self.log_level and "level" in log_entry:
            if log_entry["level"].upper() != self.log_level.upper():
                return False
        
        log_text = json.dumps(log_entry)
        
        for keyword in self.keywords:
            if keyword not in log_text:
                return False
        
        for keyword in self.exclude_keywords:
            if keyword in log_text:
                return False
        
        if self.pattern:
            if not re.search(self.pattern, log_text):
                return False
        
        if self.sources and "source" in log_entry:
            if log_entry["source"] not in self.sources:
                return False
        
        return True

    def _parse_timestamp(self, ts_str: str) -> datetime:
        for fmt in [
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S.%f",
            "%Y-%m-%d %H:%M:%S",
        ]:
            try:
                return datetime.strptime(ts_str, fmt)
            except ValueError:
                continue
        return datetime.fromisoformat(ts_str)


class LogExporter:
    def __init__(self, log_dir: str = "./logs"):
        self.logger = get_logger("LogExporter")
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self._timestamp_patterns = [
            re.compile(r'^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.,]?\d*)'),
        ]

    def list_log_files(self) -> List[Dict[str, Any]]:
        files = []
        for log_file in self.log_dir.glob("*.log*"):
            stat = log_file.stat()
            files.append({
                "name": log_file.name,
                "path": str(log_file),
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            })
        return sorted(files, key=lambda x: x["modified"], reverse=True)

    def read_log_file(self, file_path: str, 
                      filter_config: Optional[LogFilter] = None) -> Iterator[Dict[str, Any]]:
        self.logger.info(f"Reading log file: {file_path}")
        
        path = Path(file_path)
        if not path.is_absolute():
            path = self.log_dir / file_path
        
        count = 0
        matched_count = 0
        
        with self._open_file(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                
                count += 1
                log_entry = self._parse_log_line(line)
                
                if filter_config and not filter_config.matches(log_entry):
                    continue
                
                matched_count += 1
                yield log_entry
                
                if filter_config and filter_config.max_entries > 0:
                    if matched_count >= filter_config.max_entries:
                        break
        
        self.logger.info(f"Read {count} lines, matched {matched_count}")

    def _open_file(self, path: Path):
        if path.suffix == '.gz':
            return gzip.open(path, 'rt', encoding='utf-8', errors='replace')
        return open(path, 'r', encoding='utf-8', errors='replace')

    def _parse_log_line(self, line: str) -> Dict[str, Any]:
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            pass
        
        entry = {"raw": line}
        
        for pattern in self._timestamp_patterns:
            match = pattern.match(line)
            if match:
                entry["timestamp"] = match.group(1)
                line = line[len(match.group(0)):].strip()
                break
        
        level_match = re.search(r'\b(DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL|FATAL)\b', line, re.IGNORECASE)
        if level_match:
            entry["level"] = level_match.group(1).upper()
        
        return entry

    def export(self, input_files: List[str], output_file: str,
               format: ExportFormat = ExportFormat.JSON,
               compression: CompressionType = CompressionType.NONE,
               filter_config: Optional[LogFilter] = None) -> Dict[str, Any]:
        self.logger.info(f"Exporting logs to {output_file} (format={format.value})")
        
        all_logs: List[Dict[str, Any]] = []
        for input_file in input_files:
            all_logs.extend(list(self.read_log_file(input_file, filter_config)))
        
        output_path = Path(output_file)
        if not output_path.is_absolute():
            output_path = self.log_dir / output_file
        
        content = self._format_content(all_logs, format)
        final_output = self._apply_compression(content, output_path, compression, format)
        
        stats = {
            "output_file": str(final_output),
            "format": format.value,
            "compression": compression.value,
            "total_entries": len(all_logs),
            "file_size": final_output.stat().st_size,
        }
        
        self.logger.info(f"Export complete: {len(all_logs)} entries, {stats['file_size']} bytes")
        return stats

    def _format_content(self, logs: List[Dict[str, Any]], format: ExportFormat) -> str:
        if format == ExportFormat.JSON:
            return json.dumps(logs, indent=2, ensure_ascii=False)
        
        elif format == ExportFormat.JSONL:
            lines = [json.dumps(entry, ensure_ascii=False) for entry in logs]
            return "\n".join(lines)
        
        elif format == ExportFormat.CSV:
            output = StringIO()
            if logs:
                fieldnames = set()
                for entry in logs:
                    fieldnames.update(entry.keys())
                fieldnames = sorted(fieldnames)
                
                writer = csv.DictWriter(output, fieldnames=fieldnames)
                writer.writeheader()
                for entry in logs:
                    writer.writerow({k: str(v) for k, v in entry.items()})
            return output.getvalue()
        
        elif format == ExportFormat.TSV:
            output = StringIO()
            if logs:
                fieldnames = set()
                for entry in logs:
                    fieldnames.update(entry.keys())
                fieldnames = sorted(fieldnames)
                
                writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter='\t')
                writer.writeheader()
                for entry in logs:
                    writer.writerow({k: str(v) for k, v in entry.items()})
            return output.getvalue()
        
        elif format == ExportFormat.XML:
            lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<logs>']
            for entry in logs:
                lines.append('  <log_entry>')
                for key, value in entry.items():
                    safe_key = re.sub(r'[^a-zA-Z0-9_-]', '_', key)
                    safe_value = str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    lines.append(f'    <{safe_key}>{safe_value}</{safe_key}>')
                lines.append('  </log_entry>')
            lines.append('</logs>')
            return "\n".join(lines)
        
        else:
            lines = []
            for entry in logs:
                if "raw" in entry:
                    lines.append(entry["raw"])
                else:
                    parts = []
                    if "timestamp" in entry:
                        parts.append(entry["timestamp"])
                    if "level" in entry:
                        parts.append(f"[{entry['level']}]")
                    if "message" in entry:
                        parts.append(str(entry["message"]))
                    elif "raw" not in entry:
                        parts.append(json.dumps(entry, ensure_ascii=False))
                    lines.append(" ".join(parts))
            return "\n".join(lines)

    def _apply_compression(self, content: str, output_path: Path, 
                          compression: CompressionType, format: ExportFormat) -> Path:
        content_bytes = content.encode('utf-8')
        
        if compression == CompressionType.NONE:
            if not output_path.suffix:
                output_path = output_path.with_suffix(f".{format.value}")
            with open(output_path, 'wb') as f:
                f.write(content_bytes)
            return output_path
        
        elif compression == CompressionType.GZIP:
            gz_path = output_path.with_suffix(f".{format.value}.gz")
            with gzip.open(gz_path, 'wb') as f:
                f.write(content_bytes)
            return gz_path
        
        elif compression == CompressionType.ZIP:
            zip_path = output_path.with_suffix(f".{format.value}.zip")
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                zf.writestr(f"logs.{format.value}", content_bytes)
            return zip_path
        
        elif compression == CompressionType.TAR_GZ:
            tar_path = output_path.with_suffix(f".{format.value}.tar.gz")
            with tarfile.open(tar_path, 'w:gz') as tf:
                tarinfo = tarfile.TarInfo(f"logs.{format.value}")
                tarinfo.size = len(content_bytes)
                tf.addfile(tarinfo, BytesIO(content_bytes))
            return tar_path
        
        return output_path

    def export_by_date_range(self, start_date: datetime, end_date: datetime,
                            output_file: str, **kwargs) -> Dict[str, Any]:
        input_files = []
        for log_file in self.log_dir.glob("*.log*"):
            mtime = datetime.fromtimestamp(log_file.stat().st_mtime)
            if start_date <= mtime <= end_date:
                input_files.append(str(log_file))
        
        filter_config = kwargs.get("filter_config") or LogFilter()
        filter_config.start_time = start_date
        filter_config.end_time = end_date
        kwargs["filter_config"] = filter_config
        
        return self.export(input_files, output_file, **kwargs)

    def tail(self, file_path: str, lines: int = 100, 
             filter_config: Optional[LogFilter] = None) -> List[Dict[str, Any]]:
        all_lines = []
        
        for entry in self.read_log_file(file_path, filter_config):
            all_lines.append(entry)
            if len(all_lines) > lines * 2:
                all_lines = all_lines[-lines:]
        
        return all_lines[-lines:]

    def search(self, keyword: str, files: Optional[List[str]] = None,
               case_sensitive: bool = False, limit: int = 100) -> List[Dict[str, Any]]:
        results = []
        
        if files is None:
            files = [f["name"] for f in self.list_log_files()[:10]]
        
        for file_path in files:
            for entry in self.read_log_file(file_path):
                text = json.dumps(entry)
                if case_sensitive:
                    if keyword in text:
                        results.append(entry)
                else:
                    if keyword.lower() in text.lower():
                        results.append(entry)
                
                if len(results) >= limit:
                    break
            
            if len(results) >= limit:
                break
        
        return results

    def get_log_stats(self, file_path: str) -> Dict[str, Any]:
        stats = {
            "total_lines": 0,
            "by_level": {"DEBUG": 0, "INFO": 0, "WARNING": 0, "ERROR": 0, "CRITICAL": 0, "UNKNOWN": 0},
            "time_range": {"first": None, "last": None},
        }
        
        for entry in self.read_log_file(file_path):
            stats["total_lines"] += 1
            
            level = entry.get("level", "UNKNOWN")
            if level in stats["by_level"]:
                stats["by_level"][level] += 1
            else:
                stats["by_level"]["UNKNOWN"] += 1
            
            if "timestamp" in entry:
                try:
                    ts = datetime.fromisoformat(entry["timestamp"].replace('Z', '+00:00'))
                    if stats["time_range"]["first"] is None:
                        stats["time_range"]["first"] = ts
                    stats["time_range"]["last"] = ts
                except:
                    pass
        
        return stats

    def cleanup_old_logs(self, days: int = 30, dry_run: bool = False) -> Dict[str, Any]:
        cutoff = datetime.now() - timedelta(days=days)
        deleted = []
        total_size = 0
        
        for log_file in self.log_dir.glob("*.log*"):
            mtime = datetime.fromtimestamp(log_file.stat().st_mtime)
            if mtime < cutoff:
                size = log_file.stat().st_size
                total_size += size
                deleted.append({
                    "file": str(log_file),
                    "size": size,
                    "modified": mtime.isoformat(),
                })
                
                if not dry_run:
                    log_file.unlink()
        
        return {
            "deleted_count": len(deleted),
            "total_size_freed": total_size,
            "files": deleted,
            "dry_run": dry_run,
        }

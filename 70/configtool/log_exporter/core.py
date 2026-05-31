import re
import json
import csv
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional
from enum import Enum
from datetime import datetime
from pathlib import Path


class LogLevel(Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

    @classmethod
    def _order_map(cls) -> Dict["LogLevel", int]:
        return {
            cls.DEBUG: 0,
            cls.INFO: 1,
            cls.WARNING: 2,
            cls.ERROR: 3,
            cls.CRITICAL: 4,
        }

    def __ge__(self, other: "LogLevel") -> bool:
        return self._order_map()[self] >= self._order_map()[other]

    def __le__(self, other: "LogLevel") -> bool:
        return self._order_map()[self] <= self._order_map()[other]


@dataclass
class LogEntry:
    timestamp: datetime
    level: str
    module: str
    line_no: int
    message: str
    raw_line: str


LOG_PATTERN = re.compile(
    r"\[(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\]\s+\[(\w+)\]\s+\[([^:]+):(\d+)\]\s+(.*)"
)


def parse_log_line(line: str) -> Optional[LogEntry]:
    line = line.rstrip("\n")
    match = LOG_PATTERN.match(line)
    if not match:
        return None
    try:
        timestamp = datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S")
        return LogEntry(
            timestamp=timestamp,
            level=match.group(2),
            module=match.group(3),
            line_no=int(match.group(4)),
            message=match.group(5),
            raw_line=line,
        )
    except (ValueError, TypeError):
        return None


def format_log_entry(entry: LogEntry, fmt: str = "text") -> str:
    if fmt == "json":
        data = asdict(entry)
        data["timestamp"] = entry.timestamp.strftime("%Y-%m-%d %H:%M:%S")
        return json.dumps(data, ensure_ascii=False)
    elif fmt == "csv":
        return ",".join([
            entry.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
            entry.level,
            entry.module,
            str(entry.line_no),
            f'"{entry.message}"',
        ])
    else:
        return entry.raw_line


class LogExporter:
    def __init__(self):
        self._entries: List[LogEntry] = []

    @property
    def entries(self) -> List[LogEntry]:
        return self._entries.copy()

    def load_log_file(self, file_path: str) -> List[LogEntry]:
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"日志文件不存在: {file_path}")
        entries = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                entry = parse_log_line(line)
                if entry:
                    entries.append(entry)
        self._entries = entries
        return entries.copy()

    def filter_by_time(
        self, start_time: datetime, end_time: datetime
    ) -> "LogExporter":
        self._entries = [
            e for e in self._entries
            if start_time <= e.timestamp <= end_time
        ]
        return self

    def filter_by_level(
        self, min_level: str, max_level: Optional[str] = None
    ) -> "LogExporter":
        min_lvl = LogLevel(min_level.upper())
        max_lvl = LogLevel(max_level.upper()) if max_level else LogLevel.CRITICAL
        self._entries = [
            e for e in self._entries
            if min_lvl <= LogLevel(e.level.upper()) <= max_lvl
        ]
        return self

    def filter_by_module(self, module_patterns: List[str]) -> "LogExporter":
        self._entries = [
            e for e in self._entries
            if any(p in e.module for p in module_patterns)
        ]
        return self

    def filter_by_message(self, keywords: List[str]) -> "LogExporter":
        self._entries = [
            e for e in self._entries
            if any(k.lower() in e.message.lower() for k in keywords)
        ]
        return self

    def get_statistics(self) -> Dict:
        level_stats = {}
        module_stats = {}
        for entry in self._entries:
            level_stats[entry.level] = level_stats.get(entry.level, 0) + 1
            module_stats[entry.module] = module_stats.get(entry.module, 0) + 1
        return {
            "total_count": len(self._entries),
            "level_stats": level_stats,
            "module_stats": module_stats,
        }

    def export_text(self, output_path: str) -> int:
        with open(output_path, "w", encoding="utf-8") as f:
            for entry in self._entries:
                f.write(format_log_entry(entry, "text") + "\n")
        return len(self._entries)

    def export_json(self, output_path: str) -> int:
        data = []
        for entry in self._entries:
            entry_dict = asdict(entry)
            entry_dict["timestamp"] = entry.timestamp.strftime("%Y-%m-%d %H:%M:%S")
            data.append(entry_dict)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return len(self._entries)

    def export_csv(self, output_path: str) -> int:
        with open(output_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["timestamp", "level", "module", "line_no", "message"])
            for entry in self._entries:
                writer.writerow([
                    entry.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    entry.level,
                    entry.module,
                    entry.line_no,
                    entry.message,
                ])
        return len(self._entries)

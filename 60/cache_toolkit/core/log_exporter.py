import csv
import json
import re
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from cache_toolkit.utils.logger import get_logger

logger = get_logger()


class LogParser:
    def __init__(self, log_file: str):
        self._log_file = Path(log_file)

    def parse_line(self, line: str) -> Optional[dict]:
        pattern = (
            r"\[(?P<timestamp>[^\]]+)\]\s+"
            r"(?P<level>\w+)\s+"
            r"(?P<name>[^\s]+)\s+-\s+"
            r"(?P<message>.*)"
        )
        match = re.match(pattern, line.strip())
        if match:
            return match.groupdict()
        return None

    def tail(self, lines: int = 100) -> List[dict]:
        if not self._log_file.exists():
            return []

        with open(self._log_file, "r", encoding="utf-8", errors="ignore") as f:
            all_lines = f.readlines()
            return [
                self.parse_line(l) for l in all_lines[-lines:] if self.parse_line(l)
            ]

    def filter(
        self,
        level: Optional[str] = None,
        keyword: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: int = 1000,
    ) -> List[dict]:
        if not self._log_file.exists():
            return []

        results = []
        with open(self._log_file, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                entry = self.parse_line(line)
                if not entry:
                    continue

                if level and entry["level"] != level.upper():
                    continue
                if keyword and keyword.lower() not in entry["message"].lower():
                    continue
                if start_time and entry["timestamp"] < start_time:
                    continue
                if end_time and entry["timestamp"] > end_time:
                    continue

                results.append(entry)
                if len(results) >= limit:
                    break

        return results


class LogExporter:
    def __init__(self, log_file: Optional[str] = None):
        self._log_file = log_file
        self._parser = LogParser(log_file) if log_file else None

    def export_json(
        self,
        output_file: str,
        entries: List[dict],
        indent: int = 2,
    ) -> int:
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(entries, f, indent=indent, ensure_ascii=False)
        logger.info(f"Exported {len(entries)} log entries to {output_file}")
        return len(entries)

    def export_csv(
        self,
        output_file: str,
        entries: List[dict],
    ) -> int:
        if not entries:
            return 0

        Path(output_file).parent.mkdir(parents=True, exist_ok=True)
        fieldnames = list(entries[0].keys())
        with open(output_file, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(entries)
        logger.info(f"Exported {len(entries)} log entries to {output_file}")
        return len(entries)

    def export_text(
        self,
        output_file: str,
        entries: List[dict],
    ) -> int:
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w", encoding="utf-8") as f:
            for entry in entries:
                line = f"[{entry.get('timestamp', '')}] {entry.get('level', ''):7} {entry.get('name', '')} - {entry.get('message', '')}\n"
                f.write(line)
        logger.info(f"Exported {len(entries)} log entries to {output_file}")
        return len(entries)

    def export(
        self,
        output_file: str,
        format: str = "json",
        level: Optional[str] = None,
        keyword: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: int = 10000,
    ) -> int:
        if not self._parser:
            raise ValueError("No log file specified")

        entries = self._parser.filter(
            level=level,
            keyword=keyword,
            start_time=start_time,
            end_time=end_time,
            limit=limit,
        )

        if format == "json":
            return self.export_json(output_file, entries)
        elif format == "csv":
            return self.export_csv(output_file, entries)
        elif format == "text":
            return self.export_text(output_file, entries)
        else:
            raise ValueError(f"Unsupported format: {format}")


class AuditLog:
    def __init__(self, audit_file: str):
        self._audit_file = Path(audit_file)
        self._audit_file.parent.mkdir(parents=True, exist_ok=True)

    def log(self, operation: str, user: str = "system", **kwargs) -> str:
        entry = {
            "timestamp": datetime.now().isoformat(),
            "operation": operation,
            "user": user,
            **kwargs,
        }
        line = json.dumps(entry, ensure_ascii=False)
        with open(self._audit_file, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        logger.debug(f"Audit log: {operation} by {user}")
        return entry["timestamp"]

    def read(
        self,
        operation: Optional[str] = None,
        user: Optional[str] = None,
        limit: int = 100,
    ) -> List[dict]:
        if not self._audit_file.exists():
            return []

        entries = []
        with open(self._audit_file, "r", encoding="utf-8") as f:
            for line in reversed(f.readlines()):
                try:
                    entry = json.loads(line.strip())
                    if operation and entry.get("operation") != operation:
                        continue
                    if user and entry.get("user") != user:
                        continue
                    entries.append(entry)
                    if len(entries) >= limit:
                        break
                except Exception:
                    pass
        return entries

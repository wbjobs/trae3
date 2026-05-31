import difflib
import os
from typing import Any

from core.version.schema import ChangeRecord, ChangeType, VersionSnapshot
from utils.crypto import compute_data_hash, compute_file_hash


class VersionDiffer:
    @staticmethod
    def compute_snapshot_diff(
        old_snapshot: VersionSnapshot | None,
        new_snapshot: VersionSnapshot,
    ) -> list[ChangeRecord]:
        changes: list[ChangeRecord] = []

        if old_snapshot is None:
            for file_path in new_snapshot.file_hashes:
                changes.append(
                    ChangeRecord(
                        file_path=file_path,
                        change_type=ChangeType.CREATED,
                        new_hash=new_snapshot.file_hashes[file_path],
                    )
                )
            return changes

        old_hashes = old_snapshot.file_hashes
        new_hashes = new_snapshot.file_hashes

        all_paths = set(old_hashes.keys()) | set(new_hashes.keys())

        for path in sorted(all_paths):
            old_hash = old_hashes.get(path)
            new_hash = new_hashes.get(path)

            if old_hash is None and new_hash is not None:
                changes.append(
                    ChangeRecord(
                        file_path=path,
                        change_type=ChangeType.CREATED,
                        new_hash=new_hash,
                    )
                )
            elif old_hash is not None and new_hash is None:
                changes.append(
                    ChangeRecord(
                        file_path=path,
                        change_type=ChangeType.DELETED,
                        old_hash=old_hash,
                    )
                )
            elif old_hash != new_hash:
                changes.append(
                    ChangeRecord(
                        file_path=path,
                        change_type=ChangeType.MODIFIED,
                        old_hash=old_hash,
                        new_hash=new_hash,
                    )
                )

        return changes

    @staticmethod
    def compute_text_diff(
        old_text: str, new_text: str, file_path: str = ""
    ) -> list[str]:
        old_lines = old_text.splitlines(keepends=True)
        new_lines = new_text.splitlines(keepends=True)
        diff = difflib.unified_diff(
            old_lines, new_lines, fromfile=f"a/{file_path}", tofile=f"b/{file_path}"
        )
        return list(diff)

    @staticmethod
    def compute_file_diff(
        old_file: str, new_file: str, file_path: str = ""
    ) -> list[str]:
        with open(old_file, "r", encoding="utf-8", errors="replace") as f:
            old_text = f.read()
        with open(new_file, "r", encoding="utf-8", errors="replace") as f:
            new_text = f.read()
        return VersionDiffer.compute_text_diff(old_text, new_text, file_path)

    @staticmethod
    def scan_directory(directory: str) -> dict[str, str]:
        file_hashes: dict[str, str] = {}
        if not os.path.isdir(directory):
            return file_hashes
        for root, _dirs, files in os.walk(directory):
            for fname in files:
                full_path = os.path.join(root, fname)
                rel_path = os.path.relpath(full_path, directory).replace("\\", "/")
                try:
                    file_hashes[rel_path] = compute_file_hash(full_path)
                except OSError:
                    continue
        return file_hashes

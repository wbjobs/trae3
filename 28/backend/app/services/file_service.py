import os
import uuid
from typing import Tuple
from pathlib import Path
from fastapi import UploadFile, HTTPException, status

from app.core.config import settings


class FileService:
    @staticmethod
    def _get_extension(filename: str) -> str:
        return Path(filename).suffix.lower()

    @staticmethod
    def _generate_filename(original_filename: str) -> str:
        ext = FileService._get_extension(original_filename)
        return f"{uuid.uuid4().hex}{ext}"

    @staticmethod
    def _get_relative_path(file_path: str) -> str:
        return os.path.relpath(file_path, settings.UPLOAD_DIR)

    @staticmethod
    def validate_file(file: UploadFile) -> Tuple[bool, str]:
        if not file.filename:
            return False, "文件名为空"

        ext = FileService._get_extension(file.filename)
        if ext not in settings.ALLOWED_EXTENSIONS:
            return False, f"不支持的文件类型: {ext}"

        return True, ""

    async def save_upload_file(self, file: UploadFile, sub_dir: str = "") -> Tuple[str, str, int]:
        is_valid, error_msg = self.validate_file(file)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg,
            )

        save_dir = os.path.join(settings.UPLOAD_DIR, sub_dir)
        Path(save_dir).mkdir(parents=True, exist_ok=True)

        filename = self._generate_filename(file.filename)
        file_path = os.path.join(save_dir, filename)

        file_size = 0
        with open(file_path, "wb") as buffer:
            while chunk := await file.read(settings.MAX_FILE_SIZE):
                if file_size + len(chunk) > settings.MAX_FILE_SIZE:
                    buffer.close()
                    os.remove(file_path)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"文件大小超过限制: {settings.MAX_FILE_SIZE // 1024 // 1024}MB",
                    )
                file_size += len(chunk)
                buffer.write(chunk)

        relative_path = self._get_relative_path(file_path)
        return file_path, relative_path, file_size

    @staticmethod
    def delete_file(file_path: str) -> bool:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
            return False
        except Exception:
            return False

    @staticmethod
    def get_file_info(file_path: str) -> dict:
        if not os.path.exists(file_path):
            return {}

        stat = os.stat(file_path)
        return {
            "path": file_path,
            "size": stat.st_size,
            "created_at": stat.st_ctime,
            "modified_at": stat.st_mtime,
            "extension": FileService._get_extension(file_path),
        }


file_service = FileService()

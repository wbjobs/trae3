import os
import uuid
import aiofiles
from typing import Tuple
from fastapi import UploadFile, HTTPException
from ..core.config import settings


def validate_file(file: UploadFile) -> Tuple[bool, str]:
    if file.size and file.size > settings.MAX_FILE_SIZE:
        return False, f"文件大小超过限制，最大允许 {settings.MAX_FILE_SIZE // 1024 // 1024}MB"

    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in settings.allowed_extensions_list:
        return False, f"不支持的文件格式，支持格式: {', '.join(settings.allowed_extensions_list)}"

    return True, "文件验证通过"


def generate_unique_filename(original_filename: str) -> Tuple[str, str]:
    ext = os.path.splitext(original_filename)[1].lower()
    unique_id = str(uuid.uuid4())
    new_filename = f"{unique_id}{ext}"
    return unique_id, new_filename


async def save_upload_file(file: UploadFile, file_id: str, new_filename: str) -> str:
    os.makedirs(settings.upload_dir_absolute, exist_ok=True)

    file_path = os.path.join(settings.upload_dir_absolute, new_filename)

    async with aiofiles.open(file_path, 'wb') as out_file:
        while content := await file.read(1024 * 1024):
            await out_file.write(content)

    return file_path


def get_file_url(filename: str) -> str:
    return f"/uploads/{filename}"

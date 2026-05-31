import os
from typing import Optional

from app.core.config import settings


def path_to_static_url(file_path: str) -> Optional[str]:
    if not file_path:
        return None

    abs_static = os.path.abspath(settings.STATIC_FILES_DIR)
    abs_file = os.path.abspath(file_path)

    try:
        rel_path = os.path.relpath(abs_file, abs_static)
        rel_path = rel_path.replace("\\", "/")
        return f"{settings.STATIC_URL_PREFIX}/{rel_path}"
    except ValueError:
        return None


def chart_image_url(paper_id: int, chart_id: int) -> str:
    return f"{settings.API_V1_PREFIX}/charts/{chart_id}/image"


def paper_file_url(paper_id: int) -> str:
    return f"{settings.API_V1_PREFIX}/papers/{paper_id}"

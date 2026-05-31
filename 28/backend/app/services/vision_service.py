from typing import Optional, Dict, Any
import os
import httpx
from fastapi import UploadFile, HTTPException

from app.core.config import settings
from app.core.retry import retry_async
from app.schemas.chart_vision import ChartVisionRequest, ChartVisionResponse
from app.modules.chart_vision import ChartVisionService


class VisionService:
    _instance: Optional["VisionService"] = None
    _chart_vision_service: Optional[ChartVisionService] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._chart_vision_service = ChartVisionService()
        return cls._instance

    @property
    def chart_vision(self) -> ChartVisionService:
        return self._chart_vision_service

    async def analyze_chart_image(
        self,
        file: UploadFile,
        chart_type: Optional[str] = None,
        language: str = "eng+chi_sim",
        return_image: bool = False
    ) -> ChartVisionResponse:
        if not self._is_valid_image_file(file.filename):
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件格式。支持的格式: {', '.join(settings.ALLOWED_EXTENSIONS)}"
            )

        contents = await file.read()
        if len(contents) > settings.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"文件过大。最大支持: {settings.MAX_FILE_SIZE // 1024 // 1024}MB"
            )

        request = ChartVisionRequest(
            chart_type=chart_type,
            language=language,
            return_image=return_image
        )

        return self.chart_vision.analyze_chart(request, image_bytes=contents)

    async def analyze_chart_from_path(
        self,
        image_path: str,
        chart_type: Optional[str] = None,
        language: str = "eng+chi_sim",
        return_image: bool = False
    ) -> ChartVisionResponse:
        if not os.path.exists(image_path):
            raise HTTPException(status_code=404, detail=f"图像文件不存在: {image_path}")

        if not self._is_valid_image_file(image_path):
            raise HTTPException(status_code=400, detail="不支持的文件格式")

        request = ChartVisionRequest(
            image_path=image_path,
            chart_type=chart_type,
            language=language,
            return_image=return_image
        )

        return self.chart_vision.analyze_chart(request)

    @retry_async(max_retries=3, retry_delay=1.0, backoff_factor=2.0)
    async def _download_image(self, image_url: str) -> bytes:
        timeout = httpx.Timeout(
            connect=settings.HTTP_CLIENT_TIMEOUT,
            read=settings.HTTP_CLIENT_TIMEOUT,
            write=settings.HTTP_CLIENT_TIMEOUT,
            pool=settings.HTTP_CLIENT_TIMEOUT,
        )
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(image_url)
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if not content_type.startswith("image/"):
                raise HTTPException(status_code=400, detail="URL 不是有效的图像")
            return response.content

    async def analyze_chart_from_url(
        self,
        image_url: str,
        chart_type: Optional[str] = None,
        language: str = "eng+chi_sim",
        return_image: bool = False
    ) -> ChartVisionResponse:
        try:
            contents = await self._download_image(image_url)
        except httpx.HTTPError as e:
            raise HTTPException(status_code=400, detail=f"下载图像失败: {str(e)}")

        request = ChartVisionRequest(
            image_url=image_url,
            chart_type=chart_type,
            language=language,
            return_image=return_image
        )

        return self.chart_vision.analyze_chart(request, image_bytes=contents)

    async def extract_text(
        self,
        file: UploadFile,
        language: str = "eng+chi_sim"
    ) -> Dict[str, Any]:
        if not self._is_valid_image_file(file.filename):
            raise HTTPException(status_code=400, detail="不支持的文件格式")

        contents = await file.read()
        text = self.chart_vision.extract_raw_text(contents, language=language)

        return {
            "text": text,
            "language": language,
            "char_count": len(text)
        }

    async def detect_chart_type(
        self,
        file: UploadFile
    ) -> Dict[str, Any]:
        if not self._is_valid_image_file(file.filename):
            raise HTTPException(status_code=400, detail="不支持的文件格式")

        contents = await file.read()
        chart_type = self.chart_vision.get_chart_type(contents)

        return {
            "chart_type": chart_type,
            "chart_type_name": chart_type.value if chart_type else "unknown"
        }

    def _is_valid_image_file(self, filename: Optional[str]) -> bool:
        if not filename:
            return False

        ext = os.path.splitext(filename)[1].lower()
        allowed_image_exts = [".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"]
        return ext in allowed_image_exts


vision_service = VisionService()

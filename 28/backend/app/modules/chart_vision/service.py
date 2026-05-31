from typing import Optional, Dict, Any
import time
import numpy as np

from app.schemas.chart_vision import (
    ChartVisionRequest,
    ChartVisionResponse,
    ChartType,
)
from app.modules.chart_vision.opencv_analyzer import OpenCVAnalyzer
from app.modules.chart_vision.ocr_reader import OCRReader
from app.modules.chart_vision.data_extractor import DataExtractor


class ChartVisionService:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.opencv_analyzer = OpenCVAnalyzer(self.config)
        self.ocr_reader = OCRReader(self.config)
        self.data_extractor = DataExtractor(self.config)

    def analyze_chart(self, request: ChartVisionRequest, image_bytes: Optional[bytes] = None) -> ChartVisionResponse:
        start_time = time.time()

        try:
            self._load_image(request, image_bytes)

            cv_results = self.opencv_analyzer.analyze()
            chart_type = request.chart_type or cv_results.get("chart_type", ChartType.UNKNOWN)

            ocr_results = self.ocr_reader.analyze(language=request.language)

            if chart_type == ChartType.TABLE:
                ocr_results["table_cells"] = self.ocr_reader.extract_table_cells(
                    self.opencv_analyzer.horizontal_lines,
                    self.opencv_analyzer.vertical_lines
                )

            extract_result = self.data_extractor.extract(
                chart_type=chart_type,
                data_points=cv_results.get("data_points", []),
                axes=cv_results.get("axes", []),
                chart_region=self.opencv_analyzer.chart_region,
                ocr_results=ocr_results,
                legends=cv_results.get("legends", [])
            )

            title = self._extract_title(ocr_results)
            confidence = self._calculate_overall_confidence(cv_results, ocr_results, extract_result)

            annotated_image = None
            if request.return_image:
                self.opencv_analyzer.draw_annotations()
                self.ocr_reader.load_image_from_array(self.opencv_analyzer.image)
                self.ocr_reader.draw_ocr_annotations(ocr_results.get("text_regions", []))
                annotated_image = self.opencv_analyzer.to_base64()

            processing_time = (time.time() - start_time) * 1000

            return ChartVisionResponse(
                chart_type=chart_type,
                title=title,
                axes=cv_results.get("axes", []),
                legends=cv_results.get("legends", []),
                data_points=extract_result.get("data_points", []),
                series=extract_result.get("series", {}),
                table=extract_result.get("table"),
                raw_text=ocr_results.get("raw_text", ""),
                confidence=confidence,
                processing_time_ms=processing_time,
                annotated_image=annotated_image,
                metadata={
                    "cv_confidence": cv_results.get("confidence", 0.0),
                    "ocr_text_count": len(ocr_results.get("text_regions", [])),
                    "detected_lines": len(self.opencv_analyzer.detected_lines),
                    "detected_contours": len(self.opencv_analyzer.detected_contours),
                }
            )

        except Exception as e:
            processing_time = (time.time() - start_time) * 1000
            return ChartVisionResponse(
                chart_type=ChartType.UNKNOWN,
                confidence=0.0,
                processing_time_ms=processing_time,
                metadata={"error": str(e)}
            )

    def _load_image(self, request: ChartVisionRequest, image_bytes: Optional[bytes] = None) -> None:
        if image_bytes:
            self.opencv_analyzer.load_image_from_bytes(image_bytes)
            self.ocr_reader.load_image_from_bytes(image_bytes)
        elif request.image_path:
            self.opencv_analyzer.load_image(request.image_path)
            self.ocr_reader.load_image(request.image_path)
        else:
            raise ValueError("必须提供图像路径或图像字节数据")

    def _extract_title(self, ocr_results: Dict[str, Any]) -> Optional[str]:
        titles = ocr_results.get("titles", [])
        if titles:
            return titles[0].get("text")
        return None

    def _calculate_overall_confidence(self,
                                       cv_results: Dict[str, Any],
                                       ocr_results: Dict[str, Any],
                                       extract_result: Dict[str, Any]) -> float:
        weights = {
            "cv": 0.4,
            "ocr": 0.3,
            "data": 0.3
        }

        cv_confidence = cv_results.get("confidence", 0.5)

        text_regions = ocr_results.get("text_regions", [])
        if text_regions:
            ocr_confidence = np.mean([r.get("confidence", 0) for r in text_regions])
        else:
            ocr_confidence = 0.3

        data_points = extract_result.get("data_points", [])
        if data_points:
            data_confidence = np.mean([p.confidence for p in data_points])
        else:
            data_confidence = 0.2

        overall = (
            weights["cv"] * cv_confidence +
            weights["ocr"] * ocr_confidence +
            weights["data"] * data_confidence
        )

        return float(round(overall, 4))

    def batch_analyze(self, requests: list[tuple[ChartVisionRequest, Optional[bytes]]]) -> list[ChartVisionResponse]:
        results = []
        for request, image_bytes in requests:
            result = self.analyze_chart(request, image_bytes)
            results.append(result)
        return results

    def get_chart_type(self, image_bytes: bytes) -> ChartType:
        self.opencv_analyzer.load_image_from_bytes(image_bytes)
        results = self.opencv_analyzer.analyze()
        return results.get("chart_type", ChartType.UNKNOWN)

    def extract_raw_text(self, image_bytes: bytes, language: str = "eng+chi_sim") -> str:
        self.ocr_reader.load_image_from_bytes(image_bytes)
        results = self.ocr_reader.analyze(language=language)
        return results.get("raw_text", "")

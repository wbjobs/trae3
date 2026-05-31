import os
import io
import re
import uuid
import tempfile
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path
from dataclasses import dataclass

import numpy as np
from PIL import Image

from app.core.config import settings
from app.models.chart import ChartType
from app.schemas.chart import ChartExtractResult


@dataclass
class TextBlock:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    page_num: int
    font_size: float


@dataclass
class ChartRegion:
    x0: float
    y0: float
    x1: float
    y1: float
    page_num: int
    confidence: float
    chart_type: ChartType = ChartType.UNKNOWN


class PDFChartExtractor:
    def __init__(self, dpi: int = 300, config: Optional[Dict[str, Any]] = None, vision_analyzer=None):
        self.dpi = dpi
        self.config = config or {}
        self.chart_output_dir = os.path.join(settings.OUTPUT_DIR, "charts")
        Path(self.chart_output_dir).mkdir(parents=True, exist_ok=True)
        self._vision_analyzer = vision_analyzer

    @property
    def vision_analyzer(self):
        if self._vision_analyzer is None:
            from app.modules.chart_vision.opencv_analyzer import OpenCVAnalyzer
            self._vision_analyzer = OpenCVAnalyzer()
        return self._vision_analyzer

    def extract_charts(
        self,
        pdf_path: str,
        paper_id: int,
        start_page: Optional[int] = None,
        end_page: Optional[int] = None,
    ) -> List[ChartExtractResult]:
        import fitz

        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF文件不存在: {pdf_path}")

        doc = fitz.open(pdf_path)
        total_pages = len(doc)

        actual_start = max(0, (start_page or 1) - 1)
        actual_end = min(total_pages, end_page or total_pages)

        results = []

        try:
            for page_num in range(actual_start, actual_end):
                page_results = self._process_page(doc, page_num, paper_id)
                results.extend(page_results)
        finally:
            doc.close()

        return results

    def _process_page(
        self, doc: "fitz.Document", page_num: int, paper_id: int
    ) -> List[ChartExtractResult]:
        page = doc[page_num]
        results = []

        text_blocks = self._extract_text_blocks(page, page_num)

        page_image = self._render_page(page)
        chart_regions = self._detect_chart_regions(page_image, page_num)

        for region in chart_regions:
            chart_result = self._process_chart_region(
                page, page_image, region, text_blocks, paper_id, page_num
            )
            if chart_result:
                results.append(chart_result)

        return results

    def _extract_text_blocks(self, page: "fitz.Page", page_num: int) -> List[TextBlock]:
        blocks = []
        text_dict = page.get_text("dict")

        for block in text_dict.get("blocks", []):
            if block.get("type") == 0:
                for line in block.get("lines", []):
                    line_text = ""
                    max_font_size = 0
                    for span in line.get("spans", []):
                        line_text += span.get("text", "")
                        max_font_size = max(max_font_size, span.get("size", 0))

                    if line_text.strip():
                        bbox = line.get("bbox", [0, 0, 0, 0])
                        blocks.append(
                            TextBlock(
                                text=line_text.strip(),
                                x0=bbox[0],
                                y0=bbox[1],
                                x1=bbox[2],
                                y1=bbox[3],
                                page_num=page_num,
                                font_size=max_font_size,
                            )
                        )

        return blocks

    def _render_page(self, page: "fitz.Page") -> np.ndarray:
        import fitz

        zoom = self.dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)

        img_data = pix.tobytes("png")
        image = Image.open(io.BytesIO(img_data))
        return np.array(image)

    def _detect_chart_regions(
        self, page_image: np.ndarray, page_num: int
    ) -> List[ChartRegion]:
        import cv2

        regions = []
        height, width = page_image.shape[:2]

        gray = cv2.cvtColor(page_image, cv2.COLOR_RGB2GRAY)

        regions.extend(self._detect_regions_by_edges(gray, page_num, width, height))
        regions.extend(self._detect_regions_by_background(page_image, page_num, width, height))

        merged_regions = self._merge_overlapping_regions(regions)
        filtered_regions = self._filter_regions(merged_regions, width, height)

        return filtered_regions

    def _detect_regions_by_edges(
        self, gray: np.ndarray, page_num: int, width: int, height: int
    ) -> List[ChartRegion]:
        import cv2

        regions = []

        edges = cv2.Canny(gray, 50, 150)

        kernel = np.ones((5, 5), np.uint8)
        dilated = cv2.dilate(edges, kernel, iterations=2)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            min_area = (width * height) * 0.02
            max_area = (width * height) * 0.8

            if min_area < area < max_area and w > width * 0.1 and h > height * 0.1:
                aspect_ratio = w / h if h > 0 else 0
                if 0.2 < aspect_ratio < 5.0:
                    regions.append(
                        ChartRegion(
                            x0=x,
                            y0=y,
                            x1=x + w,
                            y1=y + h,
                            page_num=page_num,
                            confidence=0.7,
                        )
                    )

        return regions

    def _detect_regions_by_background(
        self, image: np.ndarray, page_num: int, width: int, height: int
    ) -> List[ChartRegion]:
        import cv2

        regions = []

        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)

        _, thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)

        kernel = np.ones((10, 10), np.uint8)
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            min_area = (width * height) * 0.03
            max_area = (width * height) * 0.7

            if min_area < area < max_area:
                mask = np.zeros(gray.shape, np.uint8)
                cv2.drawContours(mask, [contour], 0, 255, -1)

                mean_val = cv2.mean(gray, mask=mask)[0]
                if mean_val < 230:
                    regions.append(
                        ChartRegion(
                            x0=x,
                            y0=y,
                            x1=x + w,
                            y1=y + h,
                            page_num=page_num,
                            confidence=0.6,
                        )
                    )

        return regions

    def _merge_overlapping_regions(self, regions: List[ChartRegion]) -> List[ChartRegion]:
        if not regions:
            return []

        regions.sort(key=lambda r: r.x0)

        merged = []
        current = regions[0]

        for region in regions[1:]:
            if self._regions_overlap(current, region):
                current = ChartRegion(
                    x0=min(current.x0, region.x0),
                    y0=min(current.y0, region.y0),
                    x1=max(current.x1, region.x1),
                    y1=max(current.y1, region.y1),
                    page_num=current.page_num,
                    confidence=max(current.confidence, region.confidence),
                )
            else:
                merged.append(current)
                current = region

        merged.append(current)
        return merged

    def _regions_overlap(self, r1: ChartRegion, r2: ChartRegion) -> bool:
        if r1.page_num != r2.page_num:
            return False

        overlap_x = max(0, min(r1.x1, r2.x1) - max(r1.x0, r2.x0))
        overlap_y = max(0, min(r1.y1, r2.y1) - max(r1.y0, r2.y0))
        overlap_area = overlap_x * overlap_y

        area1 = (r1.x1 - r1.x0) * (r1.y1 - r1.y0)
        area2 = (r2.x1 - r2.x0) * (r2.y1 - r2.y0)
        min_area = min(area1, area2)

        return min_area > 0 and (overlap_area / min_area) > 0.3

    def _filter_regions(
        self, regions: List[ChartRegion], width: int, height: int
    ) -> List[ChartRegion]:
        filtered = []

        for region in regions:
            region_width = region.x1 - region.x0
            region_height = region.y1 - region.y0

            if region_width < width * 0.05 or region_height < height * 0.05:
                continue

            if region_width > width * 0.95 and region_height > height * 0.95:
                continue

            aspect_ratio = region_width / region_height if region_height > 0 else 0
            if aspect_ratio < 0.1 or aspect_ratio > 10:
                continue

            filtered.append(region)

        return filtered

    def _process_chart_region(
        self,
        page: "fitz.Page",
        page_image: np.ndarray,
        region: ChartRegion,
        text_blocks: List[TextBlock],
        paper_id: int,
        page_num: int,
    ) -> Optional[ChartExtractResult]:
        import cv2

        zoom = self.dpi / 72.0

        pdf_x0 = region.x0 / zoom
        pdf_y0 = region.y0 / zoom
        pdf_x1 = region.x1 / zoom
        pdf_y1 = region.y1 / zoom

        caption, figure_id = self._extract_caption(
            text_blocks, pdf_x0, pdf_y0, pdf_x1, pdf_y1, page.rect.height
        )

        chart_image = page_image[
            int(region.y0) : int(region.y1), int(region.x0) : int(region.x1)
        ]

        if chart_image.size == 0:
            return None

        chart_type, confidence = self._classify_chart_type(chart_image)
        region.chart_type = chart_type
        region.confidence = max(region.confidence, confidence * 0.5)

        extracted_data = self._extract_chart_data(chart_image, chart_type)

        image_path = self._save_chart_image(chart_image, paper_id, page_num, figure_id)

        return ChartExtractResult(
            figure_id=figure_id,
            caption=caption,
            page_number=page_num + 1,
            chart_type=chart_type,
            bounding_box=(pdf_x0, pdf_y0, pdf_x1, pdf_y1),
            confidence=region.confidence,
            image_path=image_path,
            extracted_data=extracted_data,
        )

    def _extract_caption(
        self,
        text_blocks: List[TextBlock],
        x0: float,
        y0: float,
        x1: float,
        y1: float,
        page_height: float,
    ) -> Tuple[Optional[str], Optional[str]]:
        caption_candidates = []
        figure_id = None

        search_above_y0 = max(0, y0 - 50)
        search_below_y1 = min(page_height, y1 + 50)

        for block in text_blocks:
            is_near_above = (search_above_y0 <= block.y1 <= y0) and (
                block.x1 > x0 and block.x0 < x1
            )
            is_near_below = (y1 <= block.y0 <= search_below_y1) and (
                block.x1 > x0 and block.x0 < x1
            )

            if is_near_above or is_near_below:
                text_lower = block.text.lower()

                fig_match = re.search(
                    r"(?:figure|fig\.?|图|图表)\s*(\d+[\.\d]*)", text_lower, re.IGNORECASE
                )
                if fig_match:
                    figure_id = fig_match.group(1)
                    caption_candidates.append((block.text, block.font_size, is_near_below))
                    continue

                if len(block.text) > 10 and len(block.text) < 300:
                    caption_candidates.append((block.text, block.font_size, is_near_below))

        if caption_candidates:
            caption_candidates.sort(key=lambda x: (x[2], -x[1]))
            caption = caption_candidates[0][0]
            return caption, figure_id

        return None, figure_id

    def _classify_chart_type(self, chart_image: np.ndarray) -> Tuple[ChartType, float]:
        try:
            import cv2

            if len(chart_image.shape) == 2:
                chart_image_bgr = cv2.cvtColor(chart_image, cv2.COLOR_GRAY2BGR)
            else:
                chart_image_bgr = cv2.cvtColor(chart_image, cv2.COLOR_RGB2BGR)

            self.vision_analyzer.load_image(chart_image_bgr)
            analysis_result = self.vision_analyzer.analyze()

            from app.schemas.chart_vision import ChartType as VisionChartType

            vision_type = analysis_result.get("chart_type", VisionChartType.UNKNOWN)
            confidence = analysis_result.get("confidence", 0.5)

            type_mapping = {
                VisionChartType.LINE: ChartType.LINE,
                VisionChartType.BAR: ChartType.BAR,
                VisionChartType.PIE: ChartType.PIE,
                VisionChartType.SCATTER: ChartType.SCATTER,
                VisionChartType.TABLE: ChartType.TABLE,
                VisionChartType.AREA: ChartType.AREA,
                VisionChartType.FLOWCHART: ChartType.FLOWCHART,
                VisionChartType.UNKNOWN: ChartType.UNKNOWN,
                VisionChartType.OTHER: ChartType.OTHER,
            }

            chart_type = type_mapping.get(vision_type, ChartType.UNKNOWN)

            if chart_type == ChartType.UNKNOWN:
                fallback_type = self._fallback_classification(chart_image_bgr)
                if fallback_type != ChartType.UNKNOWN:
                    chart_type = fallback_type
                    confidence = max(confidence, 0.5)

            return chart_type, confidence

        except Exception:
            fallback_type = self._fallback_classification(chart_image)
            return fallback_type, 0.5

    def _fallback_classification(self, image: np.ndarray) -> ChartType:
        import cv2

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        circles = cv2.HoughCircles(
            gray,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=20,
            param1=50,
            param2=30,
            minRadius=10,
            maxRadius=min(image.shape[:2]) // 3,
        )
        if circles is not None and len(circles[0]) >= 1:
            return ChartType.PIE

        edges = cv2.Canny(gray, 50, 150)
        lines = cv2.HoughLinesP(
            edges, 1, np.pi / 180, threshold=50, minLineLength=20, maxLineGap=5
        )

        if lines is not None:
            h_lines = 0
            v_lines = 0
            d_lines = 0

            for line in lines:
                x1, y1, x2, y2 = line[0]
                angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)

                if angle < 10 or angle > 170:
                    h_lines += 1
                elif abs(angle - 90) < 10:
                    v_lines += 1
                else:
                    d_lines += 1

            if h_lines >= 3 and v_lines >= 3:
                return ChartType.TABLE
            elif d_lines >= 3:
                return ChartType.LINE
            elif h_lines >= 2 and v_lines >= 1:
                return ChartType.BAR

        return ChartType.UNKNOWN

    def _extract_chart_data(
        self, chart_image: np.ndarray, chart_type: ChartType
    ) -> Optional[Dict[str, Any]]:
        try:
            import cv2

            if len(chart_image.shape) == 2:
                chart_image_bgr = cv2.cvtColor(chart_image, cv2.COLOR_GRAY2BGR)
            else:
                chart_image_bgr = cv2.cvtColor(chart_image, cv2.COLOR_RGB2BGR)

            self.vision_analyzer.load_image(chart_image_bgr)
            analysis_result = self.vision_analyzer.analyze()

            from app.schemas.chart_vision import ChartType as VisionChartType

            data_points = analysis_result.get("data_points", [])
            axes = analysis_result.get("axes", [])
            legends = analysis_result.get("legends", [])

            extracted_data = {
                "chart_type": chart_type.value,
                "data_points": [dp.model_dump() for dp in data_points],
                "axes": [axis.model_dump() for axis in axes],
                "legends": [legend.model_dump() for legend in legends],
                "confidence": analysis_result.get("confidence", 0.5),
            }

            return extracted_data

        except Exception as e:
            return {"error": str(e), "chart_type": chart_type.value}

    def _save_chart_image(
        self,
        chart_image: np.ndarray,
        paper_id: int,
        page_num: int,
        figure_id: Optional[str],
    ) -> str:
        import cv2

        filename_parts = [f"paper_{paper_id}", f"page_{page_num + 1}"]
        if figure_id:
            filename_parts.append(f"fig_{figure_id}")
        filename_parts.append(f"{uuid.uuid4().hex[:8]}.png")

        filename = "_".join(filename_parts)
        file_path = os.path.join(self.chart_output_dir, filename)

        if len(chart_image.shape) == 3 and chart_image.shape[2] == 3:
            save_image = cv2.cvtColor(chart_image, cv2.COLOR_RGB2BGR)
        else:
            save_image = chart_image

        cv2.imwrite(file_path, save_image)

        return file_path

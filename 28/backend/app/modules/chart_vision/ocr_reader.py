from typing import Optional, Dict, Any, List, Tuple
import numpy as np
import re

from app.modules.chart_vision.base_vision import BaseVisionAnalyzer


class OCRReader(BaseVisionAnalyzer):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(config)
        self.engine = None
        self.engine_type = self.config.get("ocr_engine", "pytesseract")
        self.language = self.config.get("language", "eng+chi_sim")
        self._init_engine()

    def _init_engine(self) -> None:
        try:
            if self.engine_type == "easyocr":
                import easyocr
                lang_list = self.language.split("+")
                self.engine = easyocr.Reader(lang_list, gpu=self.config.get("use_gpu", False))
            else:
                import pytesseract
                self.engine = pytesseract
        except ImportError as e:
            print(f"OCR 引擎导入失败: {e}")
            print("请安装 pytesseract 或 easyocr")
            self.engine = None

    def analyze(self, **kwargs) -> Dict[str, Any]:
        if self.image is None:
            raise ValueError("请先加载图像")

        language = kwargs.get("language", self.language)
        results = self._extract_text(language)

        return {
            "raw_text": results.get("raw_text", ""),
            "text_regions": results.get("text_regions", []),
            "numbers": self._extract_numbers(results.get("raw_text", "")),
            "titles": self._extract_titles(results.get("text_regions", [])),
            "labels": self._extract_axis_labels(results.get("text_regions", []))
        }

    def _extract_text(self, language: str) -> Dict[str, Any]:
        if self.engine is None:
            return {"raw_text": "", "text_regions": []}

        try:
            if self.engine_type == "easyocr":
                return self._extract_with_easyocr(language)
            else:
                return self._extract_with_tesseract(language)
        except Exception as e:
            print(f"OCR 识别失败: {e}")
            return {"raw_text": "", "text_regions": []}

    def _extract_with_tesseract(self, language: str) -> Dict[str, Any]:
        import cv2

        if self.image is None:
            return {"raw_text": "", "text_regions": []}

        preprocessed = self._preprocess_for_ocr()

        lang_map = {"eng+chi_sim": "eng+chi_sim", "eng": "eng", "chi_sim": "chi_sim"}
        tesseract_lang = lang_map.get(language, "eng")

        data = self.engine.image_to_data(
            preprocessed,
            lang=tesseract_lang,
            output_type=self.engine.Output.DICT
        )

        text_regions = []
        raw_text_parts = []

        n_boxes = len(data["text"])
        for i in range(n_boxes):
            text = data["text"][i].strip()
            if not text:
                continue

            confidence = int(data["conf"][i])
            if confidence < self.config.get("min_confidence", 30):
                continue

            x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]

            region = {
                "text": text,
                "bbox": (x, y, w, h),
                "confidence": confidence / 100.0,
                "position": (x + w // 2, y + h // 2)
            }
            text_regions.append(region)
            raw_text_parts.append(text)

        return {
            "raw_text": " ".join(raw_text_parts),
            "text_regions": text_regions
        }

    def _extract_with_easyocr(self, language: str) -> Dict[str, Any]:
        if self.image is None:
            return {"raw_text": "", "text_regions": []}

        lang_list = language.split("+")
        results = self.engine.readtext(self.image)

        text_regions = []
        raw_text_parts = []

        for bbox, text, confidence in results:
            text = text.strip()
            if not text:
                continue

            if confidence < self.config.get("min_confidence", 0.3):
                continue

            bbox = np.array(bbox).astype(int)
            x = int(min(bbox[:, 0]))
            y = int(min(bbox[:, 1]))
            w = int(max(bbox[:, 0]) - x)
            h = int(max(bbox[:, 1]) - y)

            region = {
                "text": text,
                "bbox": (x, y, w, h),
                "confidence": float(confidence),
                "position": (x + w // 2, y + h // 2)
            }
            text_regions.append(region)
            raw_text_parts.append(text)

        return {
            "raw_text": " ".join(raw_text_parts),
            "text_regions": text_regions
        }

    def _preprocess_for_ocr(self) -> np.ndarray:
        import cv2

        if self.gray_image is None:
            raise ValueError("请先加载图像")

        image = self.gray_image.copy()

        scale = self.config.get("ocr_scale", 2.0)
        if scale != 1.0:
            image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

        _, binary = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        kernel = np.ones((1, 1), np.uint8)
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

        return binary

    def _extract_numbers(self, text: str) -> List[Dict[str, Any]]:
        numbers = []

        patterns = [
            r"-?\d+\.?\d*%",
            r"-?\d+\.?\d*",
            r"\d{1,3}(?:,\d{3})*(?:\.\d+)?",
        ]

        for pattern in patterns:
            for match in re.finditer(pattern, text):
                num_str = match.group(0)
                try:
                    value = float(num_str.replace(",", "").replace("%", ""))
                    is_percentage = "%" in num_str
                    numbers.append({
                        "value": value,
                        "raw": num_str,
                        "is_percentage": is_percentage,
                        "start": match.start(),
                        "end": match.end()
                    })
                except ValueError:
                    continue

        numbers.sort(key=lambda x: x["start"])
        return numbers

    def _extract_titles(self, text_regions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not text_regions:
            return []

        regions_by_y = sorted(text_regions, key=lambda r: r["bbox"][1])

        top_regions = [r for r in regions_by_y if r["bbox"][1] < self.image_height * 0.2]
        top_regions.sort(key=lambda r: r["bbox"][2] * r["bbox"][3], reverse=True)

        titles = []
        for region in top_regions[:3]:
            if len(region["text"]) >= 3:
                titles.append({
                    "text": region["text"],
                    "confidence": region["confidence"],
                    "bbox": region["bbox"]
                })

        return titles

    def _extract_axis_labels(self, text_regions: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        if not text_regions or self.image_height == 0 or self.image_width == 0:
            return {"x_axis": [], "y_axis": []}

        x_axis_labels = []
        y_axis_labels = []

        for region in text_regions:
            x, y, w, h = region["bbox"]
            center_y = y + h // 2
            center_x = x + w // 2

            if center_y > self.image_height * 0.8:
                x_axis_labels.append(region)
            elif center_x < self.image_width * 0.15:
                y_axis_labels.append(region)

        x_axis_labels.sort(key=lambda r: r["bbox"][0])
        y_axis_labels.sort(key=lambda r: r["bbox"][1], reverse=True)

        return {
            "x_axis": x_axis_labels,
            "y_axis": y_axis_labels
        }

    def extract_table_cells(self, horizontal_lines: List[Tuple[float, float, float, float]],
                            vertical_lines: List[Tuple[float, float, float, float]]) -> List[List[Dict[str, Any]]]:
        if self.image is None:
            return []

        h_lines = sorted(horizontal_lines, key=lambda l: (l[1] + l[3]) / 2)
        v_lines = sorted(vertical_lines, key=lambda l: (l[0] + l[2]) / 2)

        if len(h_lines) < 2 or len(v_lines) < 2:
            return []

        rows = []
        for i in range(len(h_lines) - 1):
            row_cells = []
            y1 = int((h_lines[i][1] + h_lines[i][3]) / 2)
            y2 = int((h_lines[i + 1][1] + h_lines[i + 1][3]) / 2)

            for j in range(len(v_lines) - 1):
                x1 = int((v_lines[j][0] + v_lines[j][2]) / 2)
                x2 = int((v_lines[j + 1][0] + v_lines[j + 1][2]) / 2)

                cell_roi = self.image[y1:y2, x1:x2]
                text_result = self._extract_text_from_region(cell_roi)

                row_cells.append({
                    "text": text_result["text"],
                    "bbox": (x1, y1, x2 - x1, y2 - y1),
                    "confidence": text_result["confidence"]
                })

            rows.append(row_cells)

        return rows

    def _extract_text_from_region(self, roi: np.ndarray) -> Dict[str, Any]:
        if roi.size == 0:
            return {"text": "", "confidence": 0.0}

        try:
            if self.engine_type == "easyocr" and self.engine:
                results = self.engine.readtext(roi)
                if results:
                    text = " ".join([r[1] for r in results])
                    confidence = np.mean([r[2] for r in results]) if results else 0.0
                    return {"text": text.strip(), "confidence": float(confidence)}
            elif self.engine:
                text = self.engine.image_to_string(roi)
                return {"text": text.strip(), "confidence": 0.8}
        except Exception:
            pass

        return {"text": "", "confidence": 0.0}

    def draw_ocr_annotations(self, text_regions: List[Dict[str, Any]]) -> None:
        import cv2

        if self.image is None:
            return

        for region in text_regions:
            x, y, w, h = region["bbox"]
            cv2.rectangle(self.image, (x, y), (x + w, y + h), (0, 255, 255), 1)
            cv2.putText(
                self.image,
                region["text"][:10],
                (x, y - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 255, 255),
                1
            )

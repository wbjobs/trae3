from typing import Optional, Dict, Any, List, Tuple
import numpy as np
from collections import Counter

from app.modules.chart_vision.base_vision import BaseVisionAnalyzer
from app.schemas.chart_vision import ChartType, ChartAxis, ChartLegendItem, ChartDataPoint


class OpenCVAnalyzer(BaseVisionAnalyzer):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(config)
        self.detected_lines: List[Tuple[float, float, float, float]] = []
        self.detected_contours: List[np.ndarray] = []
        self.color_clusters: List[Dict[str, Any]] = []
        self.chart_region: Optional[Tuple[int, int, int, int]] = None

    def analyze(self, **kwargs) -> Dict[str, Any]:
        if self.image is None:
            raise ValueError("请先加载图像")

        results = {}
        edges = self.detect_edges()
        self.detect_axes(edges)
        self.detect_contours()
        self.detect_colors()

        chart_type = self.classify_chart_type()
        results["chart_type"] = chart_type
        results["axes"] = self.extract_axes_info()
        results["data_points"] = self.detect_data_points(chart_type)
        results["legends"] = self.detect_legends()
        results["confidence"] = self.calculate_confidence(chart_type)

        return results

    def detect_axes(self, edges: Optional[np.ndarray] = None) -> List[Tuple[float, float, float, float]]:
        import cv2

        if edges is None:
            edges = self.detect_edges()

        if self.gray_image is None:
            raise ValueError("请先加载图像")

        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=self.config.get("hough_threshold", 80),
            minLineLength=self.config.get("min_line_length", 30),
            maxLineGap=self.config.get("max_line_gap", 8)
        )

        self.detected_lines = []
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                self.detected_lines.append((float(x1), float(y1), float(x2), float(y2)))

        self._classify_axes_lines()
        return self.detected_lines

    def _classify_axes_lines(self) -> None:
        self.horizontal_lines = []
        self.vertical_lines = []
        self.diagonal_lines = []

        min_h_len = self.image_width * 0.15
        min_v_len = self.image_height * 0.15

        for x1, y1, x2, y2 in self.detected_lines:
            angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
            length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

            if (angle < 10 or angle > 170) and length > min_h_len:
                self.horizontal_lines.append((x1, y1, x2, y2))
            elif abs(angle - 90) < 10 and length > min_v_len:
                self.vertical_lines.append((x1, y1, x2, y2))
            else:
                self.diagonal_lines.append((x1, y1, x2, y2))

        self._find_chart_bounds()

    def _find_chart_bounds(self) -> None:
        if not self.horizontal_lines or not self.vertical_lines:
            self.chart_region = (0, 0, self.image_width, self.image_height)
            return

        h_lines_sorted = sorted(self.horizontal_lines, key=lambda l: (l[1] + l[3]) / 2)
        v_lines_sorted = sorted(self.vertical_lines, key=lambda l: (l[0] + l[2]) / 2)

        h_y_centers = [(l[1] + l[3]) / 2 for l in h_lines_sorted]
        v_x_centers = [(l[0] + l[2]) / 2 for l in v_lines_sorted]

        top_y = int(min(h_y_centers))
        bottom_y = int(max(h_y_centers))
        left_x = int(min(v_x_centers))
        right_x = int(max(v_x_centers))

        w = right_x - left_x
        h = bottom_y - top_y

        if w <= 0 or h <= 0:
            self.chart_region = (0, 0, self.image_width, self.image_height)
        else:
            self.chart_region = (left_x, top_y, w, h)

    def detect_contours(self) -> List[np.ndarray]:
        import cv2

        if self.gray_image is None:
            raise ValueError("请先加载图像")

        blurred = cv2.GaussianBlur(self.gray_image, (3, 3), 0)
        _, thresh = cv2.threshold(blurred, 200, 255, cv2.THRESH_BINARY_INV)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        self.detected_contours = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > self.config.get("min_contour_area", 10):
                self.detected_contours.append(contour)

        return self.detected_contours

    def detect_colors(self, k: int = 5) -> List[Dict[str, Any]]:
        import cv2

        if self.image is None:
            raise ValueError("请先加载图像")

        pixels = self.image.reshape((-1, 3))
        pixels = np.float32(pixels)

        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
        _, labels, centers = cv2.kmeans(
            pixels, k, None, criteria, 10, cv2.KMEANS_PP_CENTERS
        )

        centers = np.uint8(centers)
        label_counts = Counter(labels.flatten())

        self.color_clusters = []
        for i, center in enumerate(centers):
            count = label_counts[i]
            percentage = count / len(pixels) * 100
            b, g, r = int(center[0]), int(center[1]), int(center[2])
            self.color_clusters.append({
                "color": self.rgb_to_hex((r, g, b)),
                "rgb": (r, g, b),
                "bgr": (b, g, r),
                "count": count,
                "percentage": percentage,
                "label": i
            })

        self.color_clusters.sort(key=lambda x: x["percentage"], reverse=True)
        return self.color_clusters

    def _is_white_background(self, rgb: Tuple[int, int, int]) -> bool:
        r, g, b = rgb
        return r > 220 and g > 220 and b > 220

    def _is_black_foreground(self, rgb: Tuple[int, int, int]) -> bool:
        r, g, b = rgb
        return r < 50 and g < 50 and b < 50

    def classify_chart_type(self) -> ChartType:
        h_count = len(self.horizontal_lines)
        v_count = len(self.vertical_lines)
        d_count = len(self.diagonal_lines)
        contour_count = len(self.detected_contours)

        non_bg_colors = [
            c for c in self.color_clusters
            if not self._is_white_background(c["rgb"])
            and not self._is_black_foreground(c["rgb"])
            and 0.5 < c["percentage"] < 40
        ]

        if self._detect_table_structure():
            return ChartType.TABLE

        if self._detect_pie_chart():
            return ChartType.PIE

        if self._detect_scatter_chart():
            return ChartType.SCATTER

        has_grid = h_count >= 2 and v_count >= 2

        if has_grid and d_count > 2 and len(non_bg_colors) <= 4:
            return ChartType.LINE

        if has_grid and contour_count >= 4:
            return ChartType.BAR

        if d_count > 2 and len(non_bg_colors) >= 2:
            return ChartType.LINE

        if h_count >= 2 and v_count >= 2 and contour_count >= 3:
            return ChartType.BAR

        if self._detect_heatmap():
            return ChartType.HEATMAP

        return ChartType.UNKNOWN

    def _detect_table_structure(self) -> bool:
        import cv2

        h_count = len(self.horizontal_lines)
        v_count = len(self.vertical_lines)

        if h_count >= 3 and v_count >= 2:
            h_y_centers = sorted([(l[1] + l[3]) / 2 for l in self.horizontal_lines])
            h_spacing = []
            for i in range(1, len(h_y_centers)):
                h_spacing.append(abs(h_y_centers[i] - h_y_centers[i - 1]))

            if h_spacing:
                mean_spacing = np.mean(h_spacing)
                if mean_spacing > 0:
                    cv_spacing = np.std(h_spacing) / mean_spacing
                    if cv_spacing < 0.4:
                        v_x_centers = sorted([(l[0] + l[2]) / 2 for l in self.vertical_lines])
                        v_spacing = []
                        for i in range(1, len(v_x_centers)):
                            v_spacing.append(abs(v_x_centers[i] - v_x_centers[i - 1]))
                        if v_spacing:
                            v_cv = np.std(v_spacing) / max(np.mean(v_spacing), 1)
                            return v_cv < 0.5

        return False

    def _detect_pie_chart(self) -> bool:
        import cv2

        if self.gray_image is None:
            return False

        min_dim = min(self.image_width, self.image_height)

        circles = cv2.HoughCircles(
            self.gray_image,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=50,
            param1=50,
            param2=30,
            minRadius=max(10, min_dim // 8),
            maxRadius=min_dim // 2
        )

        if circles is not None and len(circles[0]) >= 1:
            circle = circles[0][0]
            cx, cy, r = int(circle[0]), int(circle[1]), int(circle[2])

            circle_area = np.pi * r * r
            image_area = self.image_width * self.image_height
            area_ratio = circle_area / image_area

            if area_ratio < 0.05:
                return False

            non_bg_colors = [
                c for c in self.color_clusters
                if not self._is_white_background(c["rgb"])
                and not self._is_black_foreground(c["rgb"])
                and c["percentage"] > 1
            ]
            if len(non_bg_colors) >= 3:
                return True

        return False

    def _detect_scatter_chart(self) -> bool:
        import cv2

        if self.image is None or self.chart_region is None:
            return False

        x, y, w, h = self.chart_region
        if w <= 0 or h <= 0:
            return False

        chart_roi = self.image[y:y+h, x:x+w]
        if chart_roi.size == 0:
            return False

        gray_roi = cv2.cvtColor(chart_roi, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray_roi, 200, 255, cv2.THRESH_BINARY_INV)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        small_dots = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if 5 < area < 200:
                bx, by, bw, bh = cv2.boundingRect(contour)
                aspect = bw / bh if bh > 0 else 0
                if 0.5 < aspect < 2.0:
                    small_dots.append(contour)

        if len(small_dots) >= 8:
            d_count = len(self.diagonal_lines)
            if d_count < 5:
                return True

        return False

    def _detect_heatmap(self) -> bool:
        non_bg_colors = [
            c for c in self.color_clusters
            if not self._is_white_background(c["rgb"])
            and not self._is_black_foreground(c["rgb"])
            and c["percentage"] > 2
        ]

        if len(non_bg_colors) >= 5:
            h_vals = [c["rgb"][0] for c in non_bg_colors]
            s_vals = [c["rgb"][1] for c in non_bg_colors]
            v_vals = [c["rgb"][2] for c in non_bg_colors]

            h_range = max(h_vals) - min(h_vals)
            s_range = max(s_vals) - min(s_vals)
            v_range = max(v_vals) - min(v_vals)

            if s_range < 50 and (h_range > 100 or v_range > 100):
                return True

        return False

    def extract_axes_info(self) -> List[ChartAxis]:
        axes = []

        if self.horizontal_lines:
            bottom_h = max(self.horizontal_lines, key=lambda l: (l[1] + l[3]) / 2)
            y_pos = int((bottom_h[1] + bottom_h[3]) / 2)
            x_axis = ChartAxis(
                axis_type="x",
                pixel_position=y_pos,
                tick_values=[],
                tick_labels=[]
            )
            if self.chart_region:
                x_axis.min_value = 0.0
                x_axis.max_value = float(self.chart_region[2])
            axes.append(x_axis)

        if self.vertical_lines:
            left_v = min(self.vertical_lines, key=lambda l: (l[0] + l[2]) / 2)
            x_pos = int((left_v[0] + left_v[2]) / 2)
            y_axis = ChartAxis(
                axis_type="y",
                pixel_position=x_pos,
                tick_values=[],
                tick_labels=[]
            )
            if self.chart_region:
                y_axis.min_value = 0.0
                y_axis.max_value = float(self.chart_region[3])
            axes.append(y_axis)

        return axes

    def detect_data_points(self, chart_type: ChartType) -> List[ChartDataPoint]:
        if chart_type == ChartType.LINE:
            return self._detect_line_chart_points()
        elif chart_type == ChartType.BAR:
            return self._detect_bar_chart_points()
        elif chart_type == ChartType.PIE:
            return self._detect_pie_chart_points()
        elif chart_type == ChartType.SCATTER:
            return self._detect_scatter_chart_points()
        elif chart_type == ChartType.TABLE:
            return self._detect_table_points()
        else:
            return self._detect_generic_points()

    def _detect_line_chart_points(self) -> List[ChartDataPoint]:
        import cv2

        points = []
        if self.image is None:
            return points

        chart_colors = [
            c for c in self.color_clusters
            if not self._is_white_background(c["rgb"])
            and not self._is_black_foreground(c["rgb"])
            and 1 < c["percentage"] < 30
        ]

        for color_idx, color_info in enumerate(chart_colors):
            lower = np.array([max(0, c - 30) for c in color_info["bgr"]])
            upper = np.array([min(255, c + 30) for c in color_info["bgr"]])
            mask = cv2.inRange(self.image, lower, upper)

            kernel = np.ones((3, 3), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for contour in contours:
                area = cv2.contourArea(contour)
                if area < 5:
                    continue

                M = cv2.moments(contour)
                if M["m00"] != 0:
                    cx = int(M["m10"] / M["m00"])
                    cy = int(M["m01"] / M["m00"])

                    point = ChartDataPoint(
                        pixel_x=cx,
                        pixel_y=cy,
                        color=color_info["color"],
                        label=f"series_{color_idx}",
                        confidence=0.85
                    )
                    points.append(point)

        points.sort(key=lambda p: p.pixel_x or 0)
        return points

    def _detect_bar_chart_points(self) -> List[ChartDataPoint]:
        import cv2

        points = []
        if self.image is None or self.chart_region is None:
            return points

        x, y, w, h = self.chart_region
        chart_roi = self.image[y:y+h, x:x+w]
        if chart_roi.size == 0:
            return points

        gray_roi = cv2.cvtColor(chart_roi, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray_roi, 200, 255, cv2.THRESH_BINARY_INV)

        kernel_v = np.ones((1, 5), np.uint8)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel_v)

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        bars = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 50:
                continue

            bx, by, bw, bh = cv2.boundingRect(contour)
            aspect_ratio = bw / bh if bh > 0 else 0

            if aspect_ratio < 3 and bh > h * 0.05:
                bars.append((bx, by, bw, bh))

        bars.sort(key=lambda b: b[0])

        for i, (bx, by, bw, bh) in enumerate(bars):
            center_x = x + bx + bw // 2
            center_y = y + by + bh // 2

            mask = np.zeros(chart_roi.shape[:2], np.uint8)
            cv2.rectangle(mask, (bx, by), (bx + bw, by + bh), 255, -1)
            mean_color = cv2.mean(chart_roi, mask=mask)[:3]

            point = ChartDataPoint(
                pixel_x=center_x,
                pixel_y=center_y,
                y=float(h - by),
                color=self.rgb_to_hex((int(mean_color[2]), int(mean_color[1]), int(mean_color[0]))),
                label=f"bar_{i}",
                confidence=0.9
            )
            points.append(point)

        return points

    def _detect_pie_chart_points(self) -> List[ChartDataPoint]:
        import cv2

        points = []
        if self.image is None:
            return points

        min_dim = min(self.image_width, self.image_height)
        circles = cv2.HoughCircles(
            self.gray_image,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=50,
            param1=50,
            param2=30,
            minRadius=max(10, min_dim // 8),
            maxRadius=min_dim // 2
        )

        if circles is None:
            return points

        circle = circles[0][0]
        cx, cy, r = int(circle[0]), int(circle[1]), int(circle[2])

        mask = np.zeros(self.image.shape[:2], np.uint8)
        cv2.circle(mask, (cx, cy), r, 255, -1)

        pie_colors = [
            c for c in self.color_clusters
            if not self._is_white_background(c["rgb"])
            and not self._is_black_foreground(c["rgb"])
            and 1 < c["percentage"] < 40
        ]
        total_pixels = np.sum(mask > 0)

        for color_info in pie_colors:
            lower = np.array([max(0, c - 40) for c in color_info["bgr"]])
            upper = np.array([min(255, c + 40) for c in color_info["bgr"]])
            color_mask = cv2.inRange(self.image, lower, upper)
            combined_mask = cv2.bitwise_and(mask, color_mask)

            color_pixels = np.sum(combined_mask > 0)
            if color_pixels < total_pixels * 0.01:
                continue

            percentage = (color_pixels / total_pixels) * 100

            coords = np.column_stack(np.where(combined_mask > 0))
            if len(coords) > 0:
                py, px = coords[len(coords) // 2]

                angle = np.arctan2(py - cy, px - cx)
                angle_deg = (angle * 180 / np.pi + 360) % 360

                point = ChartDataPoint(
                    pixel_x=int(px),
                    pixel_y=int(py),
                    value=percentage,
                    color=color_info["color"],
                    label=f"slice_{angle_deg:.0f}",
                    confidence=0.88
                )
                points.append(point)

        points.sort(key=lambda p: p.value or 0, reverse=True)
        return points

    def _detect_scatter_chart_points(self) -> List[ChartDataPoint]:
        import cv2

        points = []
        if self.image is None or self.chart_region is None:
            return points

        x, y, w, h = self.chart_region
        chart_roi = self.image[y:y+h, x:x+w]
        if chart_roi.size == 0:
            return points

        gray_roi = cv2.cvtColor(chart_roi, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray_roi, 200, 255, cv2.THRESH_BINARY_INV)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 5 or area > 500:
                continue

            M = cv2.moments(contour)
            if M["m00"] != 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])

                bx, by, bw, bh = cv2.boundingRect(contour)
                aspect = bw / bh if bh > 0 else 0

                if 0.4 < aspect < 2.5:
                    roi_mask = np.zeros(chart_roi.shape[:2], np.uint8)
                    cv2.drawContours(roi_mask, [contour], -1, 255, -1)
                    mean_color = cv2.mean(chart_roi, mask=roi_mask)[:3]

                    point = ChartDataPoint(
                        pixel_x=x + cx,
                        pixel_y=y + cy,
                        color=self.rgb_to_hex((int(mean_color[2]), int(mean_color[1]), int(mean_color[0]))),
                        confidence=0.8
                    )
                    points.append(point)

        return points

    def _detect_table_points(self) -> List[ChartDataPoint]:
        points = []

        for i, line in enumerate(self.horizontal_lines):
            x1, y1, x2, y2 = line
            mid_y = int((y1 + y2) / 2)
            point = ChartDataPoint(
                pixel_x=int((x1 + x2) / 2),
                pixel_y=mid_y,
                label=f"row_{i}",
                confidence=0.95
            )
            points.append(point)

        for i, line in enumerate(self.vertical_lines):
            x1, y1, x2, y2 = line
            mid_x = int((x1 + x2) / 2)
            point = ChartDataPoint(
                pixel_x=mid_x,
                pixel_y=int((y1 + y2) / 2),
                label=f"col_{i}",
                confidence=0.95
            )
            points.append(point)

        return points

    def _detect_generic_points(self) -> List[ChartDataPoint]:
        import cv2

        points = []
        if self.detected_contours is None:
            return points

        for contour in self.detected_contours:
            area = cv2.contourArea(contour)
            if area < 10 or area > 10000:
                continue

            M = cv2.moments(contour)
            if M["m00"] != 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])

                point = ChartDataPoint(
                    pixel_x=cx,
                    pixel_y=cy,
                    confidence=0.7
                )
                points.append(point)

        return points

    def detect_legends(self) -> List[ChartLegendItem]:
        legends = []
        chart_colors = [
            c for c in self.color_clusters
            if not self._is_white_background(c["rgb"])
            and not self._is_black_foreground(c["rgb"])
            and 1 < c["percentage"] < 30
        ]

        for i, color_info in enumerate(chart_colors):
            legend = ChartLegendItem(
                label=f"Series {i + 1}",
                color=color_info["color"],
                series_index=i
            )
            legends.append(legend)

        return legends

    def calculate_confidence(self, chart_type: ChartType) -> float:
        confidence = 0.5

        if chart_type != ChartType.UNKNOWN:
            confidence += 0.2

        if len(self.detected_lines) > 5:
            confidence += 0.1

        if len(self.detected_contours) > 3:
            confidence += 0.1

        if self.chart_region:
            x, y, w, h = self.chart_region
            if w > 0 and h > 0:
                confidence += 0.1

        return min(confidence, 1.0)

    def draw_annotations(self) -> None:
        import cv2

        if self.image is None:
            return

        for x1, y1, x2, y2 in self.horizontal_lines:
            cv2.line(self.image, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)

        for x1, y1, x2, y2 in self.vertical_lines:
            cv2.line(self.image, (int(x1), int(y1)), (int(x2), int(y2)), (0, 0, 255), 2)

        for x1, y1, x2, y2 in self.diagonal_lines:
            cv2.line(self.image, (int(x1), int(y1)), (int(x2), int(y2)), (255, 0, 0), 1)

        if self.chart_region:
            x, y, w, h = self.chart_region
            cv2.rectangle(self.image, (x, y), (x + w, y + h), (255, 255, 0), 2)

        for contour in self.detected_contours:
            cv2.drawContours(self.image, [contour], -1, (255, 0, 255), 1)

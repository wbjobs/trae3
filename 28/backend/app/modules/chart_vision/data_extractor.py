from typing import Optional, Dict, Any, List, Tuple
import numpy as np
from collections import defaultdict

from app.schemas.chart_vision import (
    ChartType,
    ChartAxis,
    ChartDataPoint,
    ChartTable,
    ChartLegendItem,
)


class DataExtractor:
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.chart_region: Optional[Tuple[int, int, int, int]] = None
        self.x_axis: Optional[ChartAxis] = None
        self.y_axis: Optional[ChartAxis] = None

    def extract(self,
                chart_type: ChartType,
                data_points: List[ChartDataPoint],
                axes: List[ChartAxis],
                chart_region: Optional[Tuple[int, int, int, int]] = None,
                ocr_results: Optional[Dict[str, Any]] = None,
                legends: Optional[List[ChartLegendItem]] = None) -> Dict[str, Any]:

        self.chart_region = chart_region
        self._extract_axes(axes)

        if ocr_results:
            self._update_axes_from_ocr(ocr_results)

        result = {
            "data_points": [],
            "series": {},
            "table": None,
        }

        if chart_type == ChartType.LINE:
            result.update(self._extract_line_chart_data(data_points, legends))
        elif chart_type == ChartType.BAR:
            result.update(self._extract_bar_chart_data(data_points, ocr_results))
        elif chart_type == ChartType.PIE:
            result.update(self._extract_pie_chart_data(data_points, ocr_results))
        elif chart_type == ChartType.TABLE:
            result.update(self._extract_table_data(data_points, ocr_results))

        result["data_points"] = self._convert_pixel_to_value(result.get("data_points", []))

        if "series" in result and result["series"]:
            for series_name, points in result["series"].items():
                result["series"][series_name] = self._convert_pixel_to_value(points)

        return result

    def _extract_axes(self, axes: List[ChartAxis]) -> None:
        for axis in axes:
            if axis.axis_type == "x":
                self.x_axis = axis
            elif axis.axis_type == "y":
                self.y_axis = axis

    def _update_axes_from_ocr(self, ocr_results: Dict[str, Any]) -> None:
        labels = ocr_results.get("labels", {})
        numbers = ocr_results.get("numbers", [])

        if self.x_axis and "x_axis" in labels:
            x_labels = labels["x_axis"]
            x_numbers = [n["value"] for n in numbers if n.get("is_percentage", False) is False]

            if x_numbers:
                self.x_axis.tick_values = sorted(set(x_numbers))
            self.x_axis.tick_labels = [l["text"] for l in x_labels]

            if self.x_axis.tick_values:
                self.x_axis.min_value = min(self.x_axis.tick_values)
                self.x_axis.max_value = max(self.x_axis.tick_values)

        if self.y_axis and "y_axis" in labels:
            y_labels = labels["y_axis"]
            y_numbers = [n["value"] for n in numbers if n.get("is_percentage", False) is False]

            if y_numbers:
                self.y_axis.tick_values = sorted(set(y_numbers), reverse=True)
            self.y_axis.tick_labels = [l["text"] for l in y_labels]

            if self.y_axis.tick_values:
                self.y_axis.min_value = min(self.y_axis.tick_values)
                self.y_axis.max_value = max(self.y_axis.tick_values)

    def _convert_pixel_to_value(self, points: List[ChartDataPoint]) -> List[ChartDataPoint]:
        if not self.chart_region or not self.x_axis or not self.y_axis:
            return points

        x, y, w, h = self.chart_region

        for point in points:
            if point.pixel_x is not None and self.x_axis is not None:
                rel_x = (point.pixel_x - x) / w if w > 0 else 0
                rel_x = max(0, min(1, rel_x))

                if self.x_axis.min_value is not None and self.x_axis.max_value is not None:
                    point.x = self.x_axis.min_value + rel_x * (self.x_axis.max_value - self.x_axis.min_value)
                else:
                    point.x = rel_x

                if self.x_axis.tick_labels and len(self.x_axis.tick_labels) > 0:
                    label_idx = int(rel_x * (len(self.x_axis.tick_labels) - 1))
                    label_idx = max(0, min(len(self.x_axis.tick_labels) - 1, label_idx))
                    point.label = self.x_axis.tick_labels[label_idx]

            if point.pixel_y is not None and self.y_axis is not None:
                rel_y = (h - (point.pixel_y - y)) / h if h > 0 else 0
                rel_y = max(0, min(1, rel_y))

                if self.y_axis.min_value is not None and self.y_axis.max_value is not None:
                    point.y = self.y_axis.min_value + rel_y * (self.y_axis.max_value - self.y_axis.min_value)
                else:
                    point.y = rel_y

        return points

    def _extract_line_chart_data(self,
                                  data_points: List[ChartDataPoint],
                                  legends: Optional[List[ChartLegendItem]]) -> Dict[str, Any]:
        series: Dict[str, List[ChartDataPoint]] = defaultdict(list)

        for point in data_points:
            series_name = point.label or "default"
            series[series_name].append(point)

        for series_name in series:
            series[series_name].sort(key=lambda p: p.pixel_x or 0)

        if legends:
            mapped_series: Dict[str, List[ChartDataPoint]] = {}
            for i, legend in enumerate(legends):
                series_key = f"series_{i}"
                if series_key in series:
                    mapped_series[legend.label] = series[series_key]
                else:
                    series_keys = list(series.keys())
                    if i < len(series_keys):
                        mapped_series[legend.label] = series[series_keys[i]]

            if mapped_series:
                series = mapped_series

        all_points = []
        for points in series.values():
            all_points.extend(points)

        return {
            "data_points": all_points,
            "series": dict(series),
        }

    def _extract_bar_chart_data(self,
                                 data_points: List[ChartDataPoint],
                                 ocr_results: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        series: Dict[str, List[ChartDataPoint]] = defaultdict(list)

        x_labels = []
        if ocr_results:
            labels = ocr_results.get("labels", {})
            x_labels = [l["text"] for l in labels.get("x_axis", [])]

        for i, point in enumerate(data_points):
            if i < len(x_labels):
                point.x = x_labels[i]
                point.label = x_labels[i]

            color = point.color or "default"
            series[color].append(point)

        all_points = []
        for points in series.values():
            all_points.extend(points)

        return {
            "data_points": all_points,
            "series": dict(series),
        }

    def _extract_pie_chart_data(self,
                                 data_points: List[ChartDataPoint],
                                 ocr_results: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        series: Dict[str, List[ChartDataPoint]] = {}

        labels = []
        if ocr_results:
            raw_text = ocr_results.get("raw_text", "")
            import re
            pattern = r'([^\d\s%,]+)\s*[:：]?\s*(\d+\.?\d*%)'
            matches = re.findall(pattern, raw_text)
            labels = [m[0] for m in matches]

        total_percentage = sum(p.value or 0 for p in data_points)
        if total_percentage > 0 and abs(total_percentage - 100) > 5:
            scale = 100.0 / total_percentage
            for point in data_points:
                if point.value:
                    point.value = round(point.value * scale, 2)

        for i, point in enumerate(data_points):
            if i < len(labels):
                point.label = labels[i]
            else:
                point.label = f"Category {i + 1}"

            series[point.label] = [point]

        all_points = sorted(data_points, key=lambda p: p.value or 0, reverse=True)

        return {
            "data_points": all_points,
            "series": dict(series),
        }

    def _extract_table_data(self,
                             data_points: List[ChartDataPoint],
                             ocr_results: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if ocr_results is None:
            return {"data_points": data_points, "series": {}, "table": None}

        table_cells = ocr_results.get("table_cells", [])
        if not table_cells:
            return {"data_points": data_points, "series": {}, "table": None}

        headers = []
        rows = []

        if len(table_cells) > 0:
            headers = [cell.get("text", "") for cell in table_cells[0]]

            for row in table_cells[1:]:
                row_data = []
                for cell in row:
                    text = cell.get("text", "")
                    try:
                        if text.replace(".", "").replace(",", "").replace("-", "").isdigit():
                            row_data.append(float(text.replace(",", "")))
                        else:
                            row_data.append(text)
                    except (ValueError, AttributeError):
                        row_data.append(text)
                rows.append(row_data)

        table = ChartTable(
            headers=headers,
            rows=rows,
            row_count=len(rows),
            col_count=len(headers)
        )

        return {
            "data_points": data_points,
            "series": {},
            "table": table,
        }

    def extract_axis_ticks(self,
                           axis_positions: List[int],
                           is_vertical: bool = False,
                           ocr_numbers: Optional[List[Dict[str, Any]]] = None) -> List[float]:
        if not ocr_numbers:
            return []

        tick_values = []
        axis_set = set(axis_positions)

        for num_info in ocr_numbers:
            value = num_info.get("value", 0)
            pos = num_info.get("position", (0, 0))

            coord = pos[1] if is_vertical else pos[0]
            distances = [abs(coord - axis_pos) for axis_pos in axis_set]

            if distances and min(distances) < self.config.get("tick_distance_threshold", 30):
                tick_values.append(value)

        tick_values = sorted(set(tick_values))
        if is_vertical:
            tick_values.reverse()

        return tick_values

    def calibrate_scale(self,
                        known_points: List[Tuple[int, float]],
                        is_vertical: bool = False) -> Dict[str, float]:
        if len(known_points) < 2:
            return {"scale": 1.0, "offset": 0.0}

        pixels = np.array([p[0] for p in known_points])
        values = np.array([p[1] for p in known_points])

        if is_vertical:
            pixels = self.chart_region[3] - pixels if self.chart_region else pixels

        A = np.vstack([pixels, np.ones(len(pixels))]).T
        scale, offset = np.linalg.lstsq(A, values, rcond=None)[0]

        return {
            "scale": float(scale),
            "offset": float(offset),
            "r_squared": self._calculate_r_squared(pixels, values, scale, offset)
        }

    def _calculate_r_squared(self,
                            pixels: np.ndarray,
                            values: np.ndarray,
                            scale: float,
                            offset: float) -> float:
        predictions = scale * pixels + offset
        ss_res = np.sum((values - predictions) ** 2)
        ss_tot = np.sum((values - np.mean(values)) ** 2)

        if ss_tot == 0:
            return 1.0

        return float(1 - ss_res / ss_tot)

    def interpolate_missing_values(self, points: List[ChartDataPoint]) -> List[ChartDataPoint]:
        if len(points) < 2:
            return points

        sorted_points = sorted(points, key=lambda p: p.pixel_x or 0)
        result = []

        for i, point in enumerate(sorted_points):
            if point.y is None and i > 0 and i < len(sorted_points) - 1:
                prev = sorted_points[i - 1]
                next_p = sorted_points[i + 1]

                if prev.y is not None and next_p.y is not None and prev.pixel_x and next_p.pixel_x and point.pixel_x:
                    ratio = (point.pixel_x - prev.pixel_x) / (next_p.pixel_x - prev.pixel_x)
                    point.y = prev.y + ratio * (next_p.y - prev.y)
                    point.confidence = 0.7

            result.append(point)

        return result

    def normalize_data(self, points: List[ChartDataPoint], method: str = "minmax") -> List[ChartDataPoint]:
        if not points:
            return points

        values = [p.y for p in points if p.y is not None]
        if not values:
            return points

        if method == "minmax":
            min_val, max_val = min(values), max(values)
            if max_val - min_val > 0:
                for p in points:
                    if p.y is not None:
                        p.y = (p.y - min_val) / (max_val - min_val)
        elif method == "zscore":
            mean_val, std_val = np.mean(values), np.std(values)
            if std_val > 0:
                for p in points:
                    if p.y is not None:
                        p.y = (p.y - mean_val) / std_val

        return points

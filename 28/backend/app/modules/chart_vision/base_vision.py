from abc import ABC, abstractmethod
from typing import Optional, Tuple, List, Dict, Any
import numpy as np
from PIL import Image


class BaseVisionAnalyzer(ABC):
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.image: Optional[np.ndarray] = None
        self.gray_image: Optional[np.ndarray] = None
        self.image_path: Optional[str] = None
        self.image_width: int = 0
        self.image_height: int = 0

    def load_image(self, image_path: str) -> np.ndarray:
        import cv2
        self.image_path = image_path
        self.image = cv2.imread(image_path)
        if self.image is None:
            raise ValueError(f"无法读取图像: {image_path}")
        self.image_height, self.image_width = self.image.shape[:2]
        self.gray_image = cv2.cvtColor(self.image, cv2.COLOR_BGR2GRAY)
        return self.image

    def load_image_from_bytes(self, image_bytes: bytes) -> np.ndarray:
        import cv2
        nparr = np.frombuffer(image_bytes, np.uint8)
        self.image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if self.image is None:
            raise ValueError("无法从字节数据解码图像")
        self.image_height, self.image_width = self.image.shape[:2]
        self.gray_image = cv2.cvtColor(self.image, cv2.COLOR_BGR2GRAY)
        return self.image

    def load_image_from_array(self, image_array: np.ndarray) -> np.ndarray:
        import cv2
        if len(image_array.shape) == 2:
            self.gray_image = image_array.copy()
            self.image = cv2.cvtColor(image_array, cv2.COLOR_GRAY2BGR)
        else:
            self.image = image_array.copy()
            self.gray_image = cv2.cvtColor(image_array, cv2.COLOR_BGR2GRAY)
        self.image_height, self.image_width = self.image.shape[:2]
        return self.image

    def preprocess(self) -> np.ndarray:
        import cv2
        if self.gray_image is None:
            raise ValueError("请先加载图像")

        blurred = cv2.GaussianBlur(self.gray_image, (5, 5), 0)
        _, threshold = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return threshold

    def detect_edges(self, low_threshold: int = 50, high_threshold: int = 150) -> np.ndarray:
        import cv2
        if self.gray_image is None:
            raise ValueError("请先加载图像")
        return cv2.Canny(self.gray_image, low_threshold, high_threshold)

    def get_image_size(self) -> Tuple[int, int]:
        return (self.image_width, self.image_height)

    def save_annotated_image(self, output_path: str) -> None:
        import cv2
        if self.image is None:
            raise ValueError("请先加载图像")
        cv2.imwrite(output_path, self.image)

    def to_base64(self) -> str:
        import cv2
        import base64
        if self.image is None:
            raise ValueError("请先加载图像")
        _, buffer = cv2.imencode(".png", self.image)
        return base64.b64encode(buffer).decode("utf-8")

    @abstractmethod
    def analyze(self, **kwargs) -> Dict[str, Any]:
        pass

    @staticmethod
    def rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
        return "#{:02x}{:02x}{:02x}".format(rgb[0], rgb[1], rgb[2])

    @staticmethod
    def hex_to_rgb(hex_str: str) -> Tuple[int, int, int]:
        hex_str = hex_str.lstrip("#")
        return (int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16))

    @staticmethod
    def calculate_iou(box1: Tuple[int, int, int, int], box2: Tuple[int, int, int, int]) -> float:
        x1, y1, w1, h1 = box1
        x2, y2, w2, h2 = box2

        xi1 = max(x1, x2)
        yi1 = max(y1, y2)
        xi2 = min(x1 + w1, x2 + w2)
        yi2 = min(y1 + h1, y2 + h2)

        inter_area = max(0, xi2 - xi1) * max(0, yi2 - yi1)
        box1_area = w1 * h1
        box2_area = w2 * h2
        union_area = box1_area + box2_area - inter_area

        return inter_area / union_area if union_area > 0 else 0.0

    @staticmethod
    def non_max_suppression(boxes: List[Tuple[int, int, int, int]], 
                          scores: List[float], 
                          iou_threshold: float = 0.5) -> List[int]:
        if not boxes:
            return []

        indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
        keep = []

        while indices:
            current = indices[0]
            keep.append(current)
            indices = indices[1:]
            indices = [i for i in indices 
                      if BaseVisionAnalyzer.calculate_iou(boxes[current], boxes[i]) < iou_threshold]

        return keep

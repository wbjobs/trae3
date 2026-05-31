import io
import base64
import logging
from typing import Tuple, Optional, Dict, Any
import time

logger = logging.getLogger(__name__)

try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    cv2 = None
    np = None
    CV2_AVAILABLE = False
    logger.warning("OpenCV/Numpy 未安装，将使用模拟模式")


class ImagePreprocessor:
    def __init__(self, mode: str = "balanced"):
        self._available = CV2_AVAILABLE
        self.mode = mode
        self._init_params(mode)
    
    def _init_params(self, mode: str):
        if mode == "fast":
            self.resize_max_size = 1600
            self.resize_min_size = 600
            self.enable_shadow_removal = False
            self.enable_stroke_enhance = False
            self.enable_denoise = False
        elif mode == "accurate":
            self.resize_max_size = 2400
            self.resize_min_size = 800
            self.enable_shadow_removal = True
            self.enable_stroke_enhance = True
            self.enable_denoise = True
        else:
            self.resize_max_size = 2000
            self.resize_min_size = 700
            self.enable_shadow_removal = True
            self.enable_stroke_enhance = True
            self.enable_denoise = True
        
        self.denoise_strength = 5
        self.clip_limit = 2.5
        self.threshold_block_size = 15
        self.threshold_C = 5
        self.sharpen_kernel = np.array([
            [-1, -1, -1],
            [-1,  9, -1],
            [-1, -1, -1]
        ]) if CV2_AVAILABLE else None
    
    def process(self, image_bytes: bytes, mode: Optional[str] = None) -> Tuple[bytes, 'np.ndarray', Dict[str, Any]]:
        stats = {"preprocess_time": 0.0, "steps": []}
        
        if not self._available:
            mock_img = self._create_mock_image()
            return image_bytes, mock_img, stats
        
        start_time = time.time()
        
        try:
            result_bytes, result_img, step_stats = self._optimized_process(image_bytes, mode)
            stats["preprocess_time"] = time.time() - start_time
            stats["steps"] = step_stats
            stats["image_shape"] = result_img.shape if hasattr(result_img, 'shape') else (500, 800, 3)
            return result_bytes, result_img, stats
        except Exception as e:
            logger.error(f"预处理失败: {e}", exc_info=True)
            mock_img = self._create_mock_image()
            stats["error"] = str(e)
            return image_bytes, mock_img, stats
    
    def _create_mock_image(self):
        class MockArray:
            shape = (500, 800, 3)
            dtype = 'uint8'
        return MockArray()
    
    def _optimized_process(self, image_bytes: bytes, mode: Optional[str] = None) -> Tuple[bytes, 'np.ndarray', list]:
        if mode and mode != self.mode:
            self._init_params(mode)
        
        img_array = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        if img is None:
            raise ValueError("无法解码图像文件")
        
        step_stats = []
        original_shape = img.shape
        
        steps = [
            (self._smart_resize, "resize", True),
            (self._fast_shadow_removal, "shadow_removal", self.enable_shadow_removal),
            (self._fast_denoise, "denoise", self.enable_denoise),
            (self._optimized_grayscale, "grayscale", True),
            (self._fast_stroke_enhance, "stroke_enhance", self.enable_stroke_enhance),
            (self._hybrid_threshold, "threshold", True),
            (self._optimized_deskew, "deskew", True),
        ]
        
        result = img
        for step_func, step_name, enabled in steps:
            if enabled:
                step_start = time.time()
                try:
                    result = step_func(result)
                    step_time = (time.time() - step_start) * 1000
                    step_stats.append({"name": step_name, "time_ms": round(step_time, 2), "success": True})
                except Exception as e:
                    step_time = (time.time() - step_start) * 1000
                    step_stats.append({"name": step_name, "time_ms": round(step_time, 2), "success": False, "error": str(e)})
                    logger.warning(f"预处理步骤 {step_name} 失败: {e}")
        
        success, encoded = cv2.imencode('.png', result, [cv2.IMWRITE_PNG_COMPRESSION, 3])
        if not success:
            raise ValueError("图像编码失败")
        
        logger.info(f"预处理完成 - 原始尺寸: {original_shape} -> 处理后: {result.shape}, 步骤数: {len([s for s in step_stats if s['success']])}")
        
        return encoded.tobytes(), result, step_stats
    
    def _smart_resize(self, img: 'np.ndarray') -> 'np.ndarray':
        h, w = img.shape[:2]
        max_dim = max(h, w)
        min_dim = min(h, w)
        
        if max_dim <= self.resize_max_size and min_dim >= self.resize_min_size:
            return img
        
        if max_dim > self.resize_max_size:
            scale = self.resize_max_size / max_dim
        else:
            scale = self.resize_min_size / min_dim
        
        if abs(scale - 1.0) < 0.05:
            return img
        
        new_h, new_w = int(h * scale), int(w * scale)
        interpolation = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA
        
        return cv2.resize(img, (new_w, new_h), interpolation=interpolation)
    
    def _fast_shadow_removal(self, img: 'np.ndarray') -> 'np.ndarray':
        if len(img.shape) != 3:
            return img
        
        if img.shape[0] > 1200 or img.shape[1] > 1200:
            scale = 1200 / max(img.shape[:2])
            small = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        else:
            small = img
        
        rgb_planes = cv2.split(small)
        result_planes = []
        
        for plane in rgb_planes:
            dilated = cv2.dilate(plane, np.ones((5, 5), np.uint8))
            bg = cv2.medianBlur(dilated, 11)
            diff = 255 - cv2.absdiff(plane, bg)
            norm = cv2.normalize(diff, None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8UC1)
            result_planes.append(norm)
        
        result_small = cv2.merge(result_planes)
        
        if result_small.shape != img.shape:
            return cv2.resize(result_small, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)
        return result_small
    
    def _fast_denoise(self, img: 'np.ndarray') -> 'np.ndarray':
        if len(img.shape) == 3:
            return cv2.fastNlMeansDenoisingColored(img, None, 5, 5, 3, 11)
        return cv2.fastNlMeansDenoising(img, None, 5, 3, 11)
    
    def _optimized_grayscale(self, img: 'np.ndarray') -> 'np.ndarray':
        if len(img.shape) != 3:
            return img
        
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=self.clip_limit, tileGridSize=(8, 8))
        l = clahe.apply(l)
        return l
    
    def _fast_stroke_enhance(self, img: 'np.ndarray') -> 'np.ndarray':
        if len(img.shape) != 2:
            return img
        
        sharpened = cv2.filter2D(img, -1, self.sharpen_kernel)
        kernel = np.ones((1, 1), np.uint8)
        dilated = cv2.dilate(sharpened, kernel, iterations=1)
        return cv2.addWeighted(img, 0.4, dilated, 0.6, 0)
    
    def _hybrid_threshold(self, img: 'np.ndarray') -> 'np.ndarray':
        if len(img.shape) != 2:
            return img
        
        blur = cv2.GaussianBlur(img, (5, 5), 0)
        
        _, th_otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        mean_val = np.mean(blur)
        if mean_val < 100:
            th_adaptive = cv2.adaptiveThreshold(
                blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 11, 2
            )
        else:
            th_adaptive = cv2.adaptiveThreshold(
                blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, self.threshold_block_size, self.threshold_C
            )
        
        return cv2.bitwise_and(th_otsu, th_adaptive)
    
    def _optimized_deskew(self, img: 'np.ndarray') -> 'np.ndarray':
        if len(img.shape) != 2:
            return img
        
        coords = np.column_stack(np.where(img < 128))
        if len(coords) < 100:
            return img
        
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        
        if abs(angle) < 0.3:
            return img
        
        if abs(angle) > 45:
            logger.warning(f"倾斜角度过大: {angle:.2f}度，跳过校正")
            return img
        
        (h, w) = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        
        return cv2.warpAffine(
            img, M, (w, h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(255, 255, 255)
        )
    
    def to_base64(self, img_bytes: bytes) -> str:
        return base64.b64encode(img_bytes).decode('utf-8')


preprocessor = ImagePreprocessor(mode="balanced")

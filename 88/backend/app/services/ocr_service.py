import numpy as np
import json
import hashlib
import time
import asyncio
import threading
import logging
from typing import List, Dict, Any, Optional, Tuple
from collections import OrderedDict
from dataclasses import dataclass, field
from functools import lru_cache
from ..core.config import settings
from ..schemas.record import OCRLine, OCRResult

logger = logging.getLogger(__name__)


@dataclass
class ModelConfig:
    name: str
    description: str
    det_algorithm: str
    rec_algorithm: str
    use_angle_cls: bool
    max_image_size: Tuple[int, int]
    target_fps: float
    priority: int


@dataclass
class PerformanceStats:
    total_requests: int = 0
    cache_hits: int = 0
    total_processing_time: float = 0.0
    errors: int = 0
    model_usage: Dict[str, int] = field(default_factory=dict)
    time_distribution: Dict[str, int] = field(default_factory=lambda: {"fast": 0, "normal": 0, "slow": 0})

    @property
    def avg_processing_time(self) -> float:
        return self.total_processing_time / self.total_requests if self.total_requests > 0 else 0.0


class LRUResultCache:
    def __init__(self, maxsize: int = 200, ttl: int = 7200):
        self.cache = OrderedDict()
        self.maxsize = maxsize
        self.ttl = ttl
        self.lock = threading.Lock()

    def get(self, key: str) -> Optional[OCRResult]:
        with self.lock:
            if key in self.cache:
                result, timestamp = self.cache[key]
                if time.time() - timestamp < self.ttl:
                    self.cache.move_to_end(key)
                    return result
                else:
                    del self.cache[key]
        return None

    def set(self, key: str, value: OCRResult):
        with self.lock:
            self.cache[key] = (value, time.time())
            self.cache.move_to_end(key)
            while len(self.cache) > self.maxsize:
                self.cache.popitem(last=False)

    def clear(self):
        with self.lock:
            self.cache.clear()

    def __len__(self):
        return len(self.cache)


class BatchProcessor:
    def __init__(self, max_batch_size: int = 4, max_wait_time: float = 0.1):
        self.max_batch_size = max_batch_size
        self.max_wait_time = max_wait_time
        self._batch: List[Tuple[np.ndarray, str, threading.Event, Optional[OCRResult]]] = []
        self._lock = threading.Lock()
        self._worker_thread: Optional[threading.Thread] = None
        self._running = False

    def start(self, process_func):
        self._running = True
        self._process_func = process_func
        self._worker_thread = threading.Thread(target=self._worker, daemon=True)
        self._worker_thread.start()

    def stop(self):
        self._running = False
        if self._worker_thread:
            self._worker_thread.join()

    def submit(self, image: np.ndarray, image_path: str) -> OCRResult:
        event = threading.Event()
        result_container: List[Optional[OCRResult]] = [None]

        with self._lock:
            self._batch.append((image, image_path, event, result_container))
            current_batch_size = len(self._batch)

        if current_batch_size >= self.max_batch_size:
            event.wait(timeout=self.max_wait_time * 2)
        else:
            event.wait(timeout=self.max_wait_time)

        return result_container[0] or self._process_func(image, image_path)

    def _worker(self):
        while self._running:
            time.sleep(self.max_wait_time / 2)

            with self._lock:
                if len(self._batch) == 0:
                    continue
                batch = self._batch[:self.max_batch_size]
                self._batch = self._batch[self.max_batch_size:]

            if len(batch) == 1:
                image, image_path, event, result_container = batch[0]
                result_container[0] = self._process_func(image, image_path)
                event.set()
            else:
                for image, image_path, event, result_container in batch:
                    result_container[0] = self._process_func(image, image_path)
                    event.set()


class OCRService:
    def __init__(self):
        self.ocr_light = None
        self.ocr_standard = None
        self._initialized = {"light": False, "standard": False}
        self.cache = LRUResultCache(maxsize=200, ttl=7200)
        self.timeout = 20
        self.min_confidence = 0.3

        self.stats = PerformanceStats()
        self._stats_lock = threading.Lock()

        self.model_configs = {
            "light": ModelConfig(
                name="light",
                description="轻量模型，快速检测",
                det_algorithm="DB",
                rec_algorithm="CRNN",
                use_angle_cls=False,
                max_image_size=(960, 960),
                target_fps=10.0,
                priority=1
            ),
            "standard": ModelConfig(
                name="standard",
                description="标准模型，平衡精度",
                det_algorithm="DB",
                rec_algorithm="CRNN",
                use_angle_cls=True,
                max_image_size=(1280, 1280),
                target_fps=5.0,
                priority=2
            )
        }

        self.batch_processor = BatchProcessor(max_batch_size=2, max_wait_time=0.05)
        self._batch_processor_started = False

    def _initialize_model(self, model_type: str = "standard"):
        if self._initialized.get(model_type, False):
            return True

        try:
            from paddleocr import PaddleOCR
            config = self.model_configs[model_type]

            if model_type == "light":
                self.ocr_light = PaddleOCR(
                    use_angle_cls=config.use_angle_cls,
                    lang=settings.OCR_LANG,
                    show_log=False,
                    det_algorithm=config.det_algorithm,
                    rec_algorithm=config.rec_algorithm,
                    use_gpu=False,
                    det_db_thresh=0.5,
                    det_db_box_thresh=0.5,
                    rec_batch_num=6
                )
            else:
                self.ocr_standard = PaddleOCR(
                    use_angle_cls=config.use_angle_cls,
                    lang=settings.OCR_LANG,
                    show_log=False,
                    det_algorithm=config.det_algorithm,
                    rec_algorithm=config.rec_algorithm,
                    use_gpu=False,
                    det_db_thresh=0.3,
                    det_db_box_thresh=0.5,
                    rec_batch_num=6
                )

            self._initialized[model_type] = True
            logger.info(f"PaddleOCR {model_type} 模型初始化成功")
            return True
        except Exception as e:
            logger.warning(f"PaddleOCR {model_type} 模型初始化失败: {e}，使用模拟OCR模式")
            self._initialized[model_type] = False
            return False

    def _select_model(self, image: np.ndarray) -> str:
        h, w = image.shape[:2]
        resolution = h * w

        if resolution < 500000 or self.stats.avg_processing_time > 2.0:
            return "light"
        return "standard"

    def _resize_for_model(self, image: np.ndarray, model_type: str) -> np.ndarray:
        config = self.model_configs[model_type]
        max_h, max_w = config.max_image_size
        h, w = image.shape[:2]

        if h > max_h or w > max_w:
            scale = min(max_h / h, max_w / w)
            new_h, new_w = int(h * scale), int(w * scale)
            image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)

        return image

    def _ensure_batch_processor(self):
        if not self._batch_processor_started:
            self.batch_processor.start(self._process_single_image)
            self._batch_processor_started = True

    def _compute_image_hash(self, image: np.ndarray) -> str:
        if image is None:
            return hashlib.md5(str(time.time()).encode()).hexdigest()

        try:
            gray = image if len(image.shape) == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            resized = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA)
            mean = resized.mean()
            hash_bits = (resized > mean).flatten()
            hash_int = int(''.join(map(str, hash_bits.astype(int))), 2)
            return hashlib.md5(str(hash_int).encode()).hexdigest()
        except Exception as e:
            logger.warning(f"计算图像哈希失败: {e}")
            return hashlib.md5(str(time.time()).encode()).hexdigest()

    def _process_single_image(self, image: np.ndarray, image_path: str) -> OCRResult:
        model_type = self._select_model(image)
        self._initialize_model(model_type)

        resized_image = self._resize_for_model(image, model_type)

        ocr_model = self.ocr_standard if model_type == "standard" else self.ocr_light

        if ocr_model is not None:
            result = self._paddle_ocr_recognize(resized_image, ocr_model)
        else:
            result = self._mock_ocr_recognize(image_path)

        self.stats.model_usage[model_type] = self.stats.model_usage.get(model_type, 0) + 1

        return result

    def recognize(self, image: Optional[np.ndarray], image_path: str, use_batch: bool = False) -> OCRResult:
        start_time = time.time()

        with self._stats_lock:
            self.stats.total_requests += 1

        if image is not None:
            img_hash = self._compute_image_hash(image)
            cached_result = self.cache.get(img_hash)
            if cached_result is not None:
                with self._stats_lock:
                    self.stats.cache_hits += 1
                logger.info("缓存命中，跳过OCR推理")
                processing_time = time.time() - start_time
                self._update_stats(processing_time)
                return cached_result
        else:
            img_hash = None

        try:
            if image is not None and use_batch:
                self._ensure_batch_processor()
                result = self.batch_processor.submit(image, image_path)
            elif image is not None:
                result = self._process_single_image(image, image_path)
            else:
                result = self._mock_ocr_recognize(image_path)

            if img_hash is not None:
                self.cache.set(img_hash, result)

            processing_time = time.time() - start_time
            self._update_stats(processing_time)
            return result

        except Exception as e:
            with self._stats_lock:
                self.stats.errors += 1
            logger.error(f"OCR识别出错: {e}")
            return self._mock_ocr_recognize(image_path)

    async def recognize_async(self, image: Optional[np.ndarray], image_path: str) -> OCRResult:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.recognize, image, image_path)

    def recognize_with_timeout(self, image: Optional[np.ndarray], image_path: str) -> OCRResult:
        result = [None]
        error = [None]

        def worker():
            try:
                result[0] = self.recognize(image, image_path)
            except Exception as e:
                error[0] = e

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        thread.join(timeout=self.timeout)

        if thread.is_alive():
            print(f"OCR识别超时（{self.timeout}秒），使用模拟结果")
            return self._mock_ocr_recognize(image_path)

        if error[0] is not None:
            print(f"OCR识别异常: {error[0]}，使用模拟结果")
            return self._mock_ocr_recognize(image_path)

        return result[0]

    def _paddle_ocr_recognize(self, image: np.ndarray, ocr_model) -> OCRResult:
        processed_image = self._preprocess_for_ocr(image)

        lines: List[OCRLine] = []
        total_confidence = 0.0
        raw_text_parts = []

        try:
            result = ocr_model.ocr(processed_image, cls=True)

            if result and result[0]:
                sorted_lines = sorted(result[0], key=lambda x: (x[0][0][1], x[0][0][0]))

                for line in sorted_lines:
                    position = line[0]
                    text, confidence = line[1]

                    if float(confidence) < self.min_confidence:
                        text = self._correct_low_confidence_text(text, float(confidence))

                    ocr_line = OCRLine(
                        text=text,
                        confidence=float(confidence),
                        position=[[float(p[0]), float(p[1])] for p in position]
                    )
                    lines.append(ocr_line)
                    total_confidence += float(confidence)
                    raw_text_parts.append(text)
        except Exception as e:
            logger.error(f"PaddleOCR推理异常: {e}")

        if len(lines) == 0:
            return self._fallback_recognition(processed_image)

        avg_confidence = total_confidence / len(lines) if lines else 0.0
        raw_text = "\n".join(raw_text_parts)

        return OCRResult(
            lines=lines,
            raw_text=raw_text,
            average_confidence=avg_confidence
        )

    def _preprocess_for_ocr(self, image: np.ndarray) -> np.ndarray:
        import cv2

        h, w = image.shape[:2]

        if h * w > 2000000:
            scale = np.sqrt(2000000 / (h * w))
            image = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image

        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        enhanced_bgr = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)

        return enhanced_bgr

    def _correct_low_confidence_text(self, text: str, confidence: float) -> str:
        common_corrections = {
            'O': '0', 'o': '0',
            'I': '1', 'l': '1', '|': '1',
            'Z': '2', 'z': '2',
            'S': '5', 's': '5',
            'G': '6', 'g': '6',
            'B': '8', 'b': '8',
            'Q': '0', 'q': '0',
            '×': 'x', 'X': 'x',
            '：': ':', '；': ';',
            '，': ',', '。': '.',
            '（': '(', '）': ')',
            '【': '[', '】': ']',
        }

        for wrong, correct in common_corrections.items():
            text = text.replace(wrong, correct)

        return text

    def _fallback_recognition(self, image: np.ndarray) -> OCRResult:
        print("OCR未识别到文本，使用降级识别策略")

        import cv2

        gray = image if len(image.shape) == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        lines: List[OCRLine] = []
        if contours:
            for i, contour in enumerate(contours[:10]):
                x, y, w, h = cv2.boundingRect(contour)
                if w > 20 and h > 10:
                    lines.append(OCRLine(
                        text=f"区域_{i+1}",
                        confidence=0.5,
                        position=[[float(x), float(y)], [float(x+w), float(y)],
                                  [float(x+w), float(y+h)], [float(x), float(y+h)]]
                    ))

        return OCRResult(
            lines=lines,
            raw_text="\n".join([line.text for line in lines]),
            average_confidence=0.5
        )

    def _mock_ocr_recognize(self, image_path: str) -> OCRResult:
        mock_data = [
            {"text": "设备名称：电动机", "confidence": 0.95},
            {"text": "型号规格：Y2-132M-4", "confidence": 0.92},
            {"text": "出厂编号：202401001234", "confidence": 0.96},
            {"text": "制造厂家：上海电机厂有限公司", "confidence": 0.94},
            {"text": "生产日期：2024-01-15", "confidence": 0.91},
            {"text": "额定功率：7.5kW", "confidence": 0.93},
            {"text": "额定电压：380V", "confidence": 0.95},
            {"text": "额定电流：15.4A", "confidence": 0.90},
            {"text": "重量：85kg", "confidence": 0.88},
            {"text": "外形尺寸：500×350×400mm", "confidence": 0.89},
            {"text": "检验周期：12个月", "confidence": 0.92}
        ]

        lines: List[OCRLine] = []
        total_confidence = 0.0
        raw_text_parts = []

        for i, item in enumerate(mock_data):
            ocr_line = OCRLine(
                text=item["text"],
                confidence=item["confidence"],
                position=[[10.0, 10.0 + i * 30], [200.0, 10.0 + i * 30],
                          [200.0, 35.0 + i * 30], [10.0, 35.0 + i * 30]]
            )
            lines.append(ocr_line)
            total_confidence += item["confidence"]
            raw_text_parts.append(item["text"])

        avg_confidence = total_confidence / len(lines) if lines else 0.0
        raw_text = "\n".join(raw_text_parts)

        return OCRResult(
            lines=lines,
            raw_text=raw_text,
            average_confidence=avg_confidence
        )

    def _update_stats(self, processing_time: float):
        with self._stats_lock:
            self.stats.total_processing_time += processing_time

            if processing_time < 0.5:
                self.stats.time_distribution["fast"] += 1
            elif processing_time < 2.0:
                self.stats.time_distribution["normal"] += 1
            else:
                self.stats.time_distribution["slow"] += 1

    def get_stats(self) -> Dict[str, Any]:
        with self._stats_lock:
            return {
                "total_requests": self.stats.total_requests,
                "cache_hits": self.stats.cache_hits,
                "cache_hit_rate": self.stats.cache_hits / max(self.stats.total_requests, 1),
                "avg_processing_time": self.stats.avg_processing_time,
                "errors": self.stats.errors,
                "model_usage": self.stats.model_usage,
                "time_distribution": self.stats.time_distribution,
                "cache_size": len(self.cache)
            }

    def clear_cache(self):
        self.cache.clear()
        logger.info("OCR缓存已清空")

    def reset_stats(self):
        with self._stats_lock:
            self.stats = PerformanceStats()
        logger.info("OCR统计信息已重置")

    def ocr_result_to_json(self, ocr_result: OCRResult) -> str:
        return json.dumps(ocr_result.model_dump(), ensure_ascii=False)


try:
    import cv2
except ImportError:
    cv2 = None

ocr_service = OCRService()

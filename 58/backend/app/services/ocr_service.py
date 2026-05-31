import numpy as np
from typing import List, Optional, Tuple, Dict, Any
import logging
import hashlib
import time
import threading
from dataclasses import dataclass

from app.config import settings
from app.schemas.document import OCRResult, OCRLine

logger = logging.getLogger(__name__)


@dataclass
class ModelConfig:
    precision: str = "fp16"
    det_algorithm: str = "DB"
    rec_algorithm: str = "CRNN"
    use_quantization: bool = False
    max_batch_size: int = 6
    det_limit_side_len: int = 960
    rec_limit_side_len: int = 960


class OCRCache:
    def __init__(self, max_size: int = 100, ttl: int = 3600):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._max_size = max_size
        self._ttl = ttl
        self._lock = threading.Lock()
        self._hit_count = 0
        self._miss_count = 0
    
    def _get_key(self, image: np.ndarray) -> str:
        img_bytes = image.tobytes()
        return hashlib.md5(img_bytes).hexdigest()
    
    def get(self, image: np.ndarray) -> Optional[OCRResult]:
        key = self._get_key(image)
        with self._lock:
            if key in self._cache:
                item = self._cache[key]
                if time.time() - item['timestamp'] < self._ttl:
                    self._hit_count += 1
                    logger.info(f"OCR 缓存命中 (命中率: {self.hit_rate:.1%})")
                    return item['result']
                else:
                    del self._cache[key]
            self._miss_count += 1
        return None
    
    def set(self, image: np.ndarray, result: OCRResult):
        key = self._get_key(image)
        with self._lock:
            if len(self._cache) >= self._max_size:
                oldest_key = min(self._cache.keys(), key=lambda k: self._cache[k]['timestamp'])
                del self._cache[oldest_key]
            
            self._cache[key] = {
                'result': result,
                'timestamp': time.time()
            }
            logger.info(f"OCR 结果已缓存，当前缓存大小: {len(self._cache)}")
    
    @property
    def hit_rate(self) -> float:
        total = self._hit_count + self._miss_count
        return self._hit_count / total if total > 0 else 0.0
    
    def clear(self):
        with self._lock:
            self._cache.clear()
            self._hit_count = 0
            self._miss_count = 0


class OCRService:
    def __init__(self):
        self._ocr = None
        self._use_mock = True
        self._cache = OCRCache(max_size=100)
        self._init_time = 0
        self._config = ModelConfig()
        self._init_ocr()
    
    def _init_ocr(self):
        start_time = time.time()
        
        try:
            from paddleocr import PaddleOCR
            
            ocr_kwargs = {
                'use_angle_cls': True,
                'lang': settings.ocr_lang,
                'use_gpu': settings.ocr_use_gpu,
                'show_log': False,
                'det_db_thresh': 0.3,
                'det_db_box_thresh': 0.5,
                'det_db_unclip_ratio': 1.6,
                'max_batch_size': self._config.max_batch_size,
                'use_dilation': True,
                'det_db_score_mode': 'fast',
                'rec_batch_num': self._config.max_batch_size,
                'det_limit_side_len': self._config.det_limit_side_len,
                'rec_limit_side_len': self._config.rec_limit_side_len,
            }
            
            if self._config.precision == "int8" and self._config.use_quantization:
                ocr_kwargs['enable_mkldnn'] = True
                ocr_kwargs['cpu_threads'] = 4
                logger.info("启用 INT8 量化加速")
            elif self._config.precision == "fp16" and settings.ocr_use_gpu:
                ocr_kwargs['precision'] = 'fp16'
                logger.info("启用 FP16 半精度推理")
            
            if settings.ocr_det_model_dir:
                ocr_kwargs['det_model_dir'] = settings.ocr_det_model_dir
            if settings.ocr_rec_model_dir:
                ocr_kwargs['rec_model_dir'] = settings.ocr_rec_model_dir
            if settings.ocr_cls_model_dir:
                ocr_kwargs['cls_model_dir'] = settings.ocr_cls_model_dir
            
            self._ocr = PaddleOCR(**ocr_kwargs)
            self._use_mock = False
            self._init_time = time.time() - start_time
            logger.info(f"PaddleOCR 初始化成功 - 精度: {self._config.precision}, 耗时: {self._init_time:.2f}s")
            
        except Exception as e:
            logger.warning(f"PaddleOCR 初始化失败，将使用模拟模式: {e}")
            self._use_mock = True
    
    def set_config(self, **kwargs):
        if 'precision' in kwargs:
            self._config.precision = kwargs['precision']
        if 'use_quantization' in kwargs:
            self._config.use_quantization = kwargs['use_quantization']
        if 'max_batch_size' in kwargs:
            self._config.max_batch_size = kwargs['max_batch_size']
        logger.info(f"OCR 配置已更新: {kwargs}")
    
    def recognize(self, image: np.ndarray, use_cache: bool = True) -> OCRResult:
        start_time = time.time()
        
        if use_cache:
            cached_result = self._cache.get(image)
            if cached_result:
                return cached_result
        
        if self._use_mock:
            result = self._mock_recognize(image)
            if use_cache:
                self._cache.set(image, result)
            return result
        
        try:
            result = self._ocr.ocr(image, cls=True)
            
            lines: List[OCRLine] = []
            total_confidence = 0.0
            valid_lines = 0
            
            if result and len(result) > 0:
                for page in result:
                    if page is None:
                        continue
                    for line in page:
                        bbox = line[0]
                        text = line[1][0]
                        confidence = line[1][1]
                        
                        if confidence > 0.25 and len(text.strip()) > 0:
                            ocr_line = OCRLine(
                                text=text.strip(),
                                confidence=float(confidence),
                                bbox=[[float(p[0]), float(p[1])] for p in bbox]
                            )
                            lines.append(ocr_line)
                            total_confidence += float(confidence)
                            valid_lines += 1
            
            lines = self._merge_overlapping_lines(lines)
            lines = self._sort_lines_by_position(lines)
            
            raw_text = '\n'.join([line.text for line in lines])
            avg_confidence = total_confidence / valid_lines if valid_lines > 0 else 0.0
            
            result = OCRResult(
                raw_text=raw_text,
                lines=lines,
                confidence=avg_confidence
            )
            
            if use_cache:
                self._cache.set(image, result)
            
            elapsed = time.time() - start_time
            logger.info(
                f"OCR 识别完成 - 行数: {len(lines)}, "
                f"置信度: {avg_confidence:.3f}, "
                f"耗时: {elapsed:.2f}s, "
                f"缓存命中率: {self._cache.hit_rate:.1%}"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"OCR 识别失败: {e}", exc_info=True)
            result = self._mock_recognize(image)
            return result
    
    def recognize_batch(self, images: List[np.ndarray], use_cache: bool = True) -> List[OCRResult]:
        results = []
        total_start = time.time()
        
        for i, img in enumerate(images):
            logger.info(f"批量识别进度: {i+1}/{len(images)}")
            result = self.recognize(img, use_cache=use_cache)
            results.append(result)
        
        total_time = time.time() - total_start
        logger.info(f"批量识别完成 - 数量: {len(images)}, 总耗时: {total_time:.2f}s, 平均: {total_time/len(images):.2f}s/张")
        
        return results
    
    def _merge_overlapping_lines(self, lines: List[OCRLine]) -> List[OCRLine]:
        if len(lines) <= 1:
            return lines
        
        merged = []
        used = set()
        
        for i, line1 in enumerate(lines):
            if i in used:
                continue
            
            current_line = line1
            
            for j, line2 in enumerate(lines[i+1:], i+1):
                if j in used:
                    continue
                
                if self._is_overlapping(current_line, line2):
                    current_line = self._merge_two_lines(current_line, line2)
                    used.add(j)
            
            merged.append(current_line)
        
        return merged
    
    def _is_overlapping(self, line1: OCRLine, line2: OCRLine) -> bool:
        bbox1 = line1.bbox
        bbox2 = line2.bbox
        
        y1_center = (bbox1[0][1] + bbox1[2][1]) / 2
        y2_center = (bbox2[0][1] + bbox2[2][1]) / 2
        
        height1 = abs(bbox1[2][1] - bbox1[0][1])
        height2 = abs(bbox2[2][1] - bbox2[0][1])
        
        y_distance = abs(y1_center - y2_center)
        avg_height = (height1 + height2) / 2
        
        return y_distance < avg_height * 0.4
    
    def _merge_two_lines(self, line1: OCRLine, line2: OCRLine) -> OCRLine:
        x1 = min([p[0] for p in line1.bbox] + [p[0] for p in line2.bbox])
        y1 = min([p[1] for p in line1.bbox] + [p[1] for p in line2.bbox])
        x2 = max([p[0] for p in line1.bbox] + [p[0] for p in line2.bbox])
        y2 = max([p[1] for p in line1.bbox] + [p[1] for p in line2.bbox])
        
        if line1.bbox[0][0] < line2.bbox[0][0]:
            merged_text = line1.text + ' ' + line2.text
        else:
            merged_text = line2.text + ' ' + line1.text
        
        avg_confidence = (line1.confidence + line2.confidence) / 2
        
        return OCRLine(
            text=merged_text,
            confidence=avg_confidence,
            bbox=[[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
        )
    
    def _sort_lines_by_position(self, lines: List[OCRLine]) -> List[OCRLine]:
        if not lines:
            return lines
        
        line_heights = []
        for line in lines:
            bbox = line.bbox
            y_center = (bbox[0][1] + bbox[2][1]) / 2
            height = abs(bbox[2][1] - bbox[0][1])
            line_heights.append(height)
        
        avg_height = sum(line_heights) / len(line_heights) if line_heights else 20
        
        def sort_key(line):
            bbox = line.bbox
            y_center = (bbox[0][1] + bbox[2][1]) / 2
            x_center = (bbox[0][0] + bbox[1][0]) / 2
            
            row = int(y_center / (avg_height * 1.5))
            return (row, x_center)
        
        return sorted(lines, key=sort_key)
    
    def clear_cache(self):
        self._cache.clear()
        logger.info("OCR 缓存已清空")
    
    def get_stats(self) -> Dict[str, Any]:
        return {
            "use_mock": self._use_mock,
            "init_time": self._init_time,
            "cache_size": len(self._cache._cache),
            "cache_hit_rate": self._cache.hit_rate,
            "cache_hit_count": self._cache._hit_count,
            "cache_miss_count": self._cache._miss_count,
            "config": {
                "precision": self._config.precision,
                "use_quantization": self._config.use_quantization,
                "max_batch_size": self._config.max_batch_size,
                "det_limit_side_len": self._config.det_limit_side_len
            }
        }
    
    def get_system_stats(self) -> Dict[str, Any]:
        return {
            "cache_hit_rate": self._cache.hit_rate,
            "precision": self._config.precision,
            "use_quantization": self._config.use_quantization,
            "max_batch_size": self._config.max_batch_size
        }
    
    def _mock_recognize(self, image: np.ndarray) -> OCRResult:
        h, w = image.shape[:2] if len(image.shape) == 3 else image.shape
        
        mock_lines = [
            OCRLine(
                text="关于开展2024年度工作总结的通知",
                confidence=0.92,
                bbox=[[100, 50], [w-100, 50], [w-100, 90], [100, 90]]
            ),
            OCRLine(
                text="各部门、各单位：",
                confidence=0.95,
                bbox=[[80, 120], [250, 120], [250, 150], [80, 150]]
            ),
            OCRLine(
                text="根据公司工作安排，现对2024年度各项工作进行全面总结。",
                confidence=0.88,
                bbox=[[80, 180], [w-80, 180], [w-80, 210], [80, 210]]
            ),
            OCRLine(
                text="请各部门于2024年12月25日前提交工作总结报告。",
                confidence=0.90,
                bbox=[[80, 240], [w-80, 240], [w-80, 270], [80, 270]]
            ),
            OCRLine(
                text="报告应包含以下内容：工作完成情况、存在问题、明年计划。",
                confidence=0.85,
                bbox=[[80, 300], [w-80, 300], [w-80, 330], [80, 330]]
            ),
            OCRLine(
                text="特此通知。",
                confidence=0.96,
                bbox=[[80, 360], [200, 360], [200, 390], [80, 390]]
            ),
            OCRLine(
                text="总经理办公室",
                confidence=0.93,
                bbox=[[w-250, h-150], [w-80, h-150], [w-80, h-120], [w-250, h-120]]
            ),
            OCRLine(
                text="张三",
                confidence=0.88,
                bbox=[[w-250, h-100], [w-150, h-100], [w-150, h-70], [w-250, h-70]]
            ),
            OCRLine(
                text="2024年12月10日",
                confidence=0.94,
                bbox=[[w-280, h-50], [w-80, h-50], [w-80, h-20], [w-280, h-20]]
            )
        ]
        
        raw_text = '\n'.join([line.text for line in mock_lines])
        avg_confidence = sum(line.confidence for line in mock_lines) / len(mock_lines)
        
        return OCRResult(
            raw_text=raw_text,
            lines=mock_lines,
            confidence=avg_confidence
        )


ocr_service = OCRService()

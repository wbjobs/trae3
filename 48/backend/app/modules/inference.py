import os
import time
import random
import hashlib
import logging
from dataclasses import dataclass
from typing import Optional, Dict, Any, List, Tuple

import numpy as np

logger = logging.getLogger(__name__)

DEFECT_TYPES = ["CRACK", "RUST", "DEFORM", "MISSING", "LEAK", "WEAR", "LOOSE", "ABNORMAL"]

DEFECT_NAMES = {
    "CRACK": "裂纹",
    "RUST": "锈蚀",
    "DEFORM": "变形",
    "MISSING": "缺失",
    "LEAK": "渗漏",
    "WEAR": "磨损",
    "LOOSE": "松动",
    "ABNORMAL": "异响",
}

SEVERITY_RULES = {
    "CRACK": {"low": (0.4, 0.6), "medium": (0.6, 0.8), "high": (0.8, 0.9), "critical": (0.9, 1.0)},
    "RUST": {"low": (0.4, 0.55), "medium": (0.55, 0.75), "high": (0.75, 0.9), "critical": (0.9, 1.0)},
    "DEFORM": {"low": (0.4, 0.5), "medium": (0.5, 0.7), "high": (0.7, 0.85), "critical": (0.85, 1.0)},
    "MISSING": {"low": (0.4, 0.5), "medium": (0.5, 0.65), "high": (0.65, 0.8), "critical": (0.8, 1.0)},
    "LEAK": {"low": (0.4, 0.55), "medium": (0.55, 0.7), "high": (0.7, 0.9), "critical": (0.9, 1.0)},
    "WEAR": {"low": (0.4, 0.6), "medium": (0.6, 0.8), "high": (0.8, 0.92), "critical": (0.92, 1.0)},
    "LOOSE": {"low": (0.4, 0.6), "medium": (0.6, 0.78), "high": (0.78, 0.9), "critical": (0.9, 1.0)},
    "ABNORMAL": {"low": (0.4, 0.55), "medium": (0.55, 0.72), "high": (0.72, 0.88), "critical": (0.88, 1.0)},
}

DESCRIPTIONS = {
    "CRACK": ["表面裂纹，长度约{size}px", "纵向裂纹延伸", "网状裂纹分布", "贯穿性裂纹"],
    "RUST": ["表面锈蚀区域，面积约{size}px²", "点状锈蚀聚集", "大面积锈蚀剥落", "缝隙锈蚀扩散"],
    "DEFORM": ["结构变形，偏移约{size}px", "弯曲变形", "局部凹陷", "扭曲变形"],
    "MISSING": ["部件缺失区域，约{size}px²", "螺栓缺失", "密封件脱落", "保护罩缺失"],
    "LEAK": ["渗漏痕迹，面积约{size}px²", "油渍渗漏", "水渍渗透", "气体泄漏痕迹"],
    "WEAR": ["磨损区域，面积约{size}px²", "均匀磨损", "局部磨损", "磨粒磨损"],
    "LOOSE": ["松动连接，偏移约{size}px", "螺母松动", "卡扣松脱", "焊接松动"],
    "ABNORMAL": ["异常区域，面积约{size}px²", "异常振动痕迹", "异响关联区域", "温度异常区域"],
}

FEATURE_DIM = 64


@dataclass
class InferenceConfig:
    max_defects: int = 4
    min_confidence: float = 0.45
    max_confidence: float = 0.98
    enable_augmentation: bool = True
    feature_dim: int = FEATURE_DIM
    use_quantization: bool = True
    batch_size: int = 4

    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> "InferenceConfig":
        valid_keys = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in config_dict.items() if k in valid_keys})


class InferenceEngine:
    def __init__(self, config: Optional[InferenceConfig] = None):
        self.config = config or InferenceConfig()
        self._rng_cache: Dict[int, random.Random] = {}
        self._cache: Dict[str, Any] = {}
        self._cache_stats = {"hits": 0, "misses": 0}
        self._total_inference_time = 0.0
        self._total_images = 0

    def _get_rng(self, seed: int) -> random.Random:
        if seed not in self._rng_cache:
            if len(self._rng_cache) > 100:
                self._rng_cache.pop(next(iter(self._rng_cache)))
            self._rng_cache[seed] = random.Random(seed)
        return self._rng_cache[seed]

    def detect(self, image_size: Tuple[int, int], image_path: Optional[str] = None) -> List[Dict[str, Any]]:
        start = time.perf_counter()
        self._total_images += 1

        cache_key = None
        if image_path:
            try:
                with open(image_path, "rb") as f:
                    content = f.read()
                    cache_key = hashlib.md5(content).hexdigest()
                if cache_key in self._cache:
                    self._cache_stats["hits"] += 1
                    elapsed = (time.perf_counter() - start) * 1000
                    logger.debug(f"Cache hit! Inference time: {elapsed:.1f}ms")
                    return self._cache[cache_key]
            except Exception:
                cache_key = None

        self._cache_stats["misses"] += 1

        w, h = image_size
        seed = (hash(str(image_size)) + (hash(image_path) if image_path else 0)) % (2**31)
        rng = self._get_rng(seed)

        max_defects = min(self.config.max_defects, 6)
        num_defects = rng.choices(
            list(range(max_defects + 1)),
            weights=[15, 35, 30, 15, 4, 1][: max_defects + 1],
        )[0]

        defects = []
        for idx in range(num_defects):
            defect_type = rng.choice(DEFECT_TYPES)
            bw = rng.randint(int(w * 0.05), int(w * 0.3))
            bh = rng.randint(int(h * 0.05), int(h * 0.3))
            bx = rng.randint(0, max(w - bw, 1))
            by = rng.randint(0, max(h - bh, 1))
            confidence = rng.uniform(self.config.min_confidence, self.config.max_confidence)
            severity = self._determine_severity(defect_type, confidence)
            desc_templates = DESCRIPTIONS.get(defect_type, ["检测到异常"])
            desc = rng.choice(desc_templates).format(size=rng.randint(5, 200))

            defect = {
                "type": defect_type,
                "type_name": DEFECT_NAMES.get(defect_type, defect_type),
                "bbox": {"x": bx, "y": by, "width": bw, "height": bh},
                "confidence": round(float(confidence), 4),
                "severity": severity,
                "description": desc,
                "detection_order": idx,
            }
            defects.append(defect)

        if cache_key:
            self._cache[cache_key] = defects
            if len(self._cache) > 500:
                keys = list(self._cache.keys())
                for k in keys[:250]:
                    del self._cache[k]

        elapsed = (time.perf_counter() - start) * 1000
        self._total_inference_time += elapsed
        logger.debug(f"Inference completed: {num_defects} defects, time: {elapsed:.1f}ms")
        return defects

    def _determine_severity(self, defect_type: str, confidence: float) -> str:
        rules = SEVERITY_RULES.get(defect_type, SEVERITY_RULES["CRACK"])
        for level, (low, high) in rules.items():
            if low <= confidence < high:
                return level
        return "low"

    def extract_feature(self, defect_info: Dict[str, Any], image_size: Optional[Tuple[int, int]] = None) -> List[float]:
        defect_type = defect_info.get("type", defect_info.get("label", "UNKNOWN"))
        confidence = defect_info.get("confidence", 0.5)
        severity = defect_info.get("severity", "medium")
        bbox = defect_info.get("bbox", {})

        type_idx = DEFECT_TYPES.index(defect_type) if defect_type in DEFECT_TYPES else 0
        seed = type_idx * 1000 + int(confidence * 1000)
        rng = np.random.RandomState(seed)

        feature = np.zeros(FEATURE_DIM, dtype=np.float64)
        feature[:8] = np.eye(8)[type_idx]

        sev_map = {"low": 0.25, "medium": 0.5, "high": 0.75, "critical": 1.0}
        feature[8] = sev_map.get(severity, 0.5)
        feature[9] = float(confidence)

        if image_size and isinstance(bbox, dict):
            w, h = image_size
            feature[10] = bbox.get("x", 0) / max(w, 1)
            feature[11] = bbox.get("y", 0) / max(h, 1)
            feature[12] = bbox.get("width", 0) / max(w, 1)
            feature[13] = bbox.get("height", 0) / max(h, 1)

        feature[14:32] = rng.randn(18) * 0.3
        feature[32:] = rng.randn(32) * 0.2

        norm = np.linalg.norm(feature)
        if norm > 1e-8:
            feature = feature / norm

        if self.config.use_quantization:
            feature = np.round(feature * 127).astype(np.int8).astype(np.float64) / 127.0

        return feature.tolist()

    def extract_text_feature(self, text: str) -> List[float]:
        seed = hash(text) % (2**31)
        rng = np.random.RandomState(seed)

        feature = np.zeros(FEATURE_DIM, dtype=np.float64)
        text_lower = text.lower()

        type_onehot = np.zeros(8, dtype=np.float64)
        for defect_type in DEFECT_TYPES:
            cn_name = DEFECT_NAMES.get(defect_type, "")
            if defect_type.lower() in text_lower or cn_name in text:
                type_onehot[DEFECT_TYPES.index(defect_type)] = 1.0
        feature[:8] = type_onehot

        for kw, val in [
            ("严重", 1.0),
            ("critical", 1.0),
            ("高", 0.75),
            ("high", 0.75),
            ("中等", 0.5),
            ("medium", 0.5),
            ("轻微", 0.25),
            ("low", 0.25),
        ]:
            if kw in text_lower:
                feature[8] = max(feature[8], val)

        feature[14:32] = rng.randn(18) * 0.3
        feature[32:] = rng.randn(32) * 0.2

        norm = np.linalg.norm(feature)
        if norm > 1e-8:
            feature = feature / norm

        return feature.tolist()

    def batch_detect(self, image_list: List[Tuple[Tuple[int, int], Optional[str]]]) -> List[List[Dict[str, Any]]]:
        results = []
        batch_size = self.config.batch_size
        for i in range(0, len(image_list), batch_size):
            batch = image_list[i : i + batch_size]
            batch_results = [self.detect(size, path) for size, path in batch]
            results.extend(batch_results)
        return results

    def get_stats(self) -> Dict[str, Any]:
        return {
            "total_images": self._total_images,
            "avg_inference_time_ms": (
                self._total_inference_time / max(self._total_images, 1)
            ),
            "cache_hits": self._cache_stats["hits"],
            "cache_misses": self._cache_stats["misses"],
            "cache_size": len(self._cache),
            "cache_hit_rate": (
                self._cache_stats["hits"]
                / max(self._cache_stats["hits"] + self._cache_stats["misses"], 1)
            ),
            "config": {
                "max_defects": self.config.max_defects,
                "min_confidence": self.config.min_confidence,
                "feature_dim": self.config.feature_dim,
                "use_quantization": self.config.use_quantization,
                "batch_size": self.config.batch_size,
            },
        }


_engine_instance: Optional[InferenceEngine] = None


def get_inference_engine(config: Optional[Dict[str, Any]] = None) -> InferenceEngine:
    global _engine_instance
    if _engine_instance is None:
        cfg = InferenceConfig.from_dict(config) if config else InferenceConfig()
        _engine_instance = InferenceEngine(cfg)
    elif config:
        _engine_instance.config = InferenceConfig.from_dict(config)
    return _engine_instance


def simulate_detection(image_size: Tuple[int, int], image_path: Optional[str] = None) -> List[Dict[str, Any]]:
    engine = get_inference_engine()
    return engine.detect(image_size, image_path)


def extract_feature_vector(defect_info: Dict[str, Any], image_size: Optional[Tuple[int, int]] = None) -> List[float]:
    engine = get_inference_engine()
    return engine.extract_feature(defect_info, image_size)


def extract_text_vector(text: str) -> List[float]:
    engine = get_inference_engine()
    return engine.extract_text_feature(text)


def get_inference_stats() -> Dict[str, Any]:
    engine = get_inference_engine()
    return engine.get_stats()

import os
import io
import uuid
import time
import logging
from functools import lru_cache
from dataclasses import dataclass
from typing import Optional, Tuple, Dict, Any

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")

BLUR_THRESHOLD = 100.0
TARGET_MAX_SIZE = 1024
QUALITY_FAST = 80
QUALITY_HIGH = 95

_detection_cache: dict = {}
_cache_hits = 0
_cache_misses = 0


@dataclass
class ProcessMetrics:
    blur_score: float
    is_blurry: bool
    original_size: Tuple[int, int]
    processed_size: Tuple[int, int]
    process_time_ms: float
    enhancement_level: str


def ensure_upload_dir():
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def compute_blur_score(image_path: str) -> float:
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return 0.0
    h, w = img.shape
    roi = img[h // 4: 3 * h // 4, w // 4: 3 * w // 4]
    return cv2.Laplacian(roi, cv2.CV_64F).var()


def is_blurry(image_path: str, threshold: float = BLUR_THRESHOLD) -> bool:
    return compute_blur_score(image_path) < threshold


def _optimized_resize(img: Image.Image, max_size: int) -> Image.Image:
    if max(img.size) <= max_size:
        return img
    ratio = max_size / max(img.size)
    new_size = (int(img.width * ratio), int(img.height * ratio))
    if img.mode in ("RGB", "L"):
        return img.resize(new_size, Image.LANCZOS)
    return img.convert("RGB").resize(new_size, Image.LANCZOS)


def _fast_deblur(img_array: np.ndarray) -> np.ndarray:
    kernel = np.array([[0, -0.5, 0], [-0.5, 3, -0.5], [0, -0.5, 0]], dtype=np.float32)
    return cv2.filter2D(img_array, -1, kernel)


def _lightweight_clahe(img_array: np.ndarray, clip_limit: float = 2.0) -> np.ndarray:
    lab = cv2.cvtColor(img_array, cv2.COLOR_RGB2LAB)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)


def _adaptive_contrast(img_array: np.ndarray, is_blurry: bool) -> np.ndarray:
    lab = cv2.cvtColor(img_array, cv2.COLOR_RGB2LAB)
    l_mean = lab[:, :, 0].mean()
    if l_mean < 80:
        lab[:, :, 0] = np.clip(lab[:, :, 0] * 1.3, 0, 255).astype(np.uint8)
    elif l_mean > 180:
        lab[:, :, 0] = np.clip(lab[:, :, 0] * 0.85, 0, 255).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)


def preprocess_image(image_path: str, quality_mode: str = "balanced") -> str:
    start_time = time.perf_counter()
    ensure_upload_dir()

    blur_score = compute_blur_score(image_path)
    blurry = blur_score < BLUR_THRESHOLD

    with Image.open(image_path) as img:
        original_size = img.size
        img = img.convert("RGB")
        img = _optimized_resize(img, TARGET_MAX_SIZE)
        processed_size = img.size
        img_array = np.array(img)

    if blurry:
        img_array = _fast_deblur(img_array)
        enhancement_level = "high"
        contrast_factor = 1.3
    else:
        enhancement_level = "standard"
        contrast_factor = 1.1

    img_array = _lightweight_clahe(img_array, clip_limit=1.5 if blurry else 2.0)
    img_array = _adaptive_contrast(img_array, blurry)

    img = Image.fromarray(np.clip(img_array, 0, 255).astype(np.uint8))
    img = ImageEnhance.Contrast(img).enhance(contrast_factor)

    quality = QUALITY_HIGH if quality_mode == "high" else QUALITY_FAST
    processed_filename = f"proc_{uuid.uuid4().hex[:8]}_{os.path.basename(image_path)}"
    processed_path = os.path.join(UPLOAD_DIR, processed_filename)

    img.save(processed_path, quality=quality, optimize=True)

    process_time = (time.perf_counter() - start_time) * 1000
    metrics = ProcessMetrics(
        blur_score=blur_score,
        is_blurry=blurry,
        original_size=original_size,
        processed_size=processed_size,
        process_time_ms=process_time,
        enhancement_level=enhancement_level,
    )
    logger.debug(
        f"Preprocess metrics: blur={blur_score:.1f}, time={process_time:.1f}ms, "
        f"size={original_size}->{processed_size}, enhancement={enhancement_level}"
    )

    return processed_path


@lru_cache(maxsize=128)
def _cached_color_to_bgr(hex_color: str):
    h = hex_color.lstrip('#')
    r, g, b = tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    return (b, g, r)


SEVERITY_COLORS: Dict[str, Tuple[int, int, int]] = {
    "critical": (239, 71, 111),
    "high": (255, 107, 53),
    "medium": (250, 204, 21),
    "low": (6, 214, 160),
}

SEVERITY_NAMES: Dict[str, str] = {
    "critical": "严重",
    "high": "较高",
    "medium": "中等",
    "low": "轻微",
}

TYPE_NAMES: Dict[str, str] = {
    "CRACK": "裂纹",
    "RUST": "锈蚀",
    "DEFORM": "变形",
    "MISSING": "缺失",
    "LEAK": "渗漏",
    "WEAR": "磨损",
    "LOOSE": "松动",
    "ABNORMAL": "异响",
}


def draw_annotations(image_path: str, defects: list, show_confidence: bool = True) -> str:
    img = cv2.imread(image_path)
    if img is None:
        return image_path

    h, w = img.shape[:2]
    for idx, d in enumerate(defects):
        defect_type = d.get("type", d.get("label", ""))
        bbox = d.get("bbox", {})
        if isinstance(bbox, str):
            try:
                import json
                bbox = json.loads(bbox)
            except Exception:
                bbox = {}
        if not isinstance(bbox, dict):
            continue

        x, y, bw, bh = (
            int(bbox.get("x", 0)),
            int(bbox.get("y", 0)),
            int(bbox.get("width", 0)),
            int(bbox.get("height", 0)),
        )
        if bw <= 0 or bh <= 0:
            continue

        x = max(0, min(x, w - 1))
        y = max(0, min(y, h - 1))
        bw = max(1, min(bw, w - x))
        bh = max(1, min(bh, h - y))

        severity = d.get("severity", "medium")
        color = SEVERITY_COLORS.get(severity, (6, 214, 160))
        type_name = TYPE_NAMES.get(defect_type, defect_type)

        thickness = 2 if max(bw, bh) > 50 else 1
        cv2.rectangle(img, (x, y), (x + bw, y + bh), color, thickness)

        if show_confidence:
            label_text = f"{type_name} {d.get('confidence', 0):.0%}"
        else:
            label_text = type_name

        (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        ly = max(y - th - 8, th + 8)
        cv2.rectangle(img, (x, ly - th - 4), (x + tw + 4, ly), color, -1)
        cv2.putText(img, label_text, (x + 2, ly - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        if len(defects) <= 20:
            marker_size = min(bw, bh) // 4
            cv2.drawMarker(img, (x + bw // 2, y + bh // 2), color, cv2.MARKER_CROSS, marker_size, 1)

    annotated_filename = f"annot_{uuid.uuid4().hex[:8]}_{os.path.basename(image_path)}"
    annotated_path = os.path.join(UPLOAD_DIR, annotated_filename)
    cv2.imwrite(annotated_path, img, [cv2.IMWRITE_JPEG_QUALITY, QUALITY_HIGH])
    return annotated_path


def draw_annotations_bytes(image_bytes: bytes, defects: list) -> bytes:
    img_array = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img is None:
        return image_bytes

    for d in defects:
        defect_type = d.get("type", d.get("label", ""))
        bbox = d.get("bbox", {})
        if isinstance(bbox, str):
            try:
                import json
                bbox = json.loads(bbox)
            except Exception:
                bbox = {}
        if not isinstance(bbox, dict):
            continue
        x, y, bw, bh = int(bbox.get("x", 0)), int(bbox.get("y", 0)), int(bbox.get("width", 0)), int(bbox.get("height", 0))
        if bw <= 0 or bh <= 0:
            continue
        severity = d.get("severity", "medium")
        color = SEVERITY_COLORS.get(severity, (6, 214, 160))
        type_name = TYPE_NAMES.get(defect_type, defect_type)
        cv2.rectangle(img, (x, y), (x + bw, y + bh), color, 2)
        label_text = f"{type_name} {d.get('confidence', 0):.0%}"
        (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(img, (x, y - th - 8), (x + tw + 4, y), color, -1)
        cv2.putText(img, label_text, (x + 2, y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

    _, encoded = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, QUALITY_HIGH])
    return encoded.tobytes()


def get_cache_stats() -> Dict[str, Any]:
    return {
        "cache_size": len(_detection_cache),
        "cache_hits": _cache_hits,
        "cache_misses": _cache_misses,
        "hit_rate": _cache_hits / max(_cache_hits + _cache_misses, 1),
    }

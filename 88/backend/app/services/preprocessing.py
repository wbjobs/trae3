import cv2
import numpy as np
import os
import time
import logging
from functools import lru_cache
from PIL import Image, ImageEnhance, ImageFilter
from typing import Tuple, Optional, Dict, Any, List
from dataclasses import dataclass
from ..core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ProcessingProfile:
    name: str
    description: str
    quality_range: Tuple[float, float]
    steps: List[str]
    params: Dict[str, Any]


@dataclass
class ProcessingStats:
    total_images: int = 0
    avg_processing_time: float = 0.0
    profile_usage: Dict[str, int] = None
    quality_distribution: Dict[str, int] = None

    def __post_init__(self):
        if self.profile_usage is None:
            self.profile_usage = {}
        if self.quality_distribution is None:
            self.quality_distribution = {"very_low": 0, "low": 0, "medium": 0, "high": 0}


class ImagePreprocessor:
    def __init__(self):
        self.target_width = 1200
        self.target_height = 800
        self.quality_threshold = 50.0
        self.blur_threshold = 100.0

        self.profiles = self._init_processing_profiles()
        self.stats = ProcessingStats()
        self._processing_times = []

    def _init_processing_profiles(self) -> Dict[str, ProcessingProfile]:
        return {
            "ultra_fast": ProcessingProfile(
                name="ultra_fast",
                description="极速模式，仅基础预处理",
                quality_range=(80, 100),
                steps=["resize", "denoise_light", "enhance_light"],
                params={"denoise_strength": 3, "contrast_clip": 1.5}
            ),
            "fast": ProcessingProfile(
                name="fast",
                description="快速模式，标准预处理",
                quality_range=(60, 80),
                steps=["resize", "remove_reflection_light", "denoise", "enhance_contrast", "sharpen_light"],
                params={"denoise_strength": 5, "contrast_clip": 2.0, "sharpen_amount": 0.5}
            ),
            "balanced": ProcessingProfile(
                name="balanced",
                description="平衡模式，标准增强",
                quality_range=(40, 60),
                steps=["resize", "remove_reflection", "denoise", "enhance_contrast", "sharpen", "adaptive_threshold"],
                params={"denoise_strength": 7, "contrast_clip": 2.5, "sharpen_amount": 1.0}
            ),
            "quality": ProcessingProfile(
                name="quality",
                description="质量模式，全量增强",
                quality_range=(20, 40),
                steps=["resize", "remove_reflection", "deblur", "enhance_contrast", "super_resolution", "denoise_heavy", "sharpen_heavy", "adaptive_threshold", "morphology"],
                params={"denoise_strength": 10, "contrast_clip": 3.0, "sharpen_amount": 1.5}
            ),
            "max_quality": ProcessingProfile(
                name="max_quality",
                description="最高质量，极限增强",
                quality_range=(0, 20),
                steps=["resize", "remove_reflection_heavy", "deblur_heavy", "super_resolution", "enhance_contrast_heavy", "denoise_heavy", "sharpen_heavy", "adaptive_threshold_otsu", "morphology_heavy"],
                params={"denoise_strength": 15, "contrast_clip": 4.0, "sharpen_amount": 2.0}
            )
        }

    def _select_profile(self, quality: float) -> ProcessingProfile:
        for profile in self.profiles.values():
            min_q, max_q = profile.quality_range
            if min_q <= quality < max_q:
                return profile
        return self.profiles["balanced"]

    def _update_quality_stats(self, quality: float):
        if quality < 20:
            self.stats.quality_distribution["very_low"] += 1
        elif quality < 40:
            self.stats.quality_distribution["low"] += 1
        elif quality < 60:
            self.stats.quality_distribution["medium"] += 1
        else:
            self.stats.quality_distribution["high"] += 1

    def preprocess(self, image_path: str) -> Tuple[str, np.ndarray]:
        start_time = time.time()
        img = self._read_image(image_path)
        if img is None:
            raise ValueError(f"无法读取图像文件: {image_path}")

        quality = self._assess_image_quality(img)
        self._update_quality_stats(quality)
        logger.info(f"图像质量评估: {quality:.2f}/100")

        profile = self._select_profile(quality)
        logger.info(f"选择处理配置: {profile.name} - {profile.description}")
        self.stats.profile_usage[profile.name] = self.stats.profile_usage.get(profile.name, 0) + 1

        processed_img = self._execute_processing_pipeline(img, profile)

        processed_filename = self._generate_processed_filename(image_path)
        processed_path = os.path.join(settings.upload_dir_absolute, processed_filename)
        self._write_image(processed_path, processed_img)

        processing_time = time.time() - start_time
        self._update_stats(processing_time)

        logger.info(f"预处理完成，耗时: {processing_time:.3f}秒")
        return processed_path, processed_img

    def _execute_processing_pipeline(self, img: np.ndarray, profile: ProcessingProfile) -> np.ndarray:
        processed = img.copy()
        params = profile.params

        step_methods = {
            "resize": lambda x: self._resize(x),
            "denoise_light": lambda x: self._denoise(x, strength=params.get("denoise_strength", 3)),
            "denoise": lambda x: self._denoise(x, strength=params.get("denoise_strength", 5)),
            "denoise_heavy": lambda x: self._denoise(x, strength=params.get("denoise_strength", 10), heavy=True),
            "enhance_light": lambda x: self._enhance_contrast(x, clip_limit=params.get("contrast_clip", 1.5)),
            "enhance_contrast": lambda x: self._enhance_contrast(x, clip_limit=params.get("contrast_clip", 2.5)),
            "enhance_contrast_heavy": lambda x: self._enhance_contrast(x, clip_limit=params.get("contrast_clip", 4.0)),
            "remove_reflection_light": lambda x: self._remove_reflection(x, light=True),
            "remove_reflection": lambda x: self._remove_reflection(x),
            "remove_reflection_heavy": lambda x: self._remove_reflection(x, heavy=True),
            "deblur": lambda x: self._deblur_image(x),
            "deblur_heavy": lambda x: self._deblur_image(x, heavy=True),
            "sharpen_light": lambda x: self._sharpen_image(x, amount=params.get("sharpen_amount", 0.5)),
            "sharpen": lambda x: self._sharpen_image(x, amount=params.get("sharpen_amount", 1.0)),
            "sharpen_heavy": lambda x: self._sharpen_image(x, amount=params.get("sharpen_amount", 1.5), heavy=True),
            "super_resolution": lambda x: self._super_resolution(x),
            "adaptive_threshold": lambda x: self._adaptive_threshold(x),
            "adaptive_threshold_otsu": lambda x: self._adaptive_threshold(x, otsu=True),
            "morphology": lambda x: self._morphological_operations(x),
            "morphology_heavy": lambda x: self._morphological_operations(x, heavy=True)
        }

        for step in profile.steps:
            if step in step_methods:
                try:
                    processed = step_methods[step](processed)
                except Exception as e:
                    logger.warning(f"处理步骤 {step} 失败: {e}，跳过")

        return processed

    def _update_stats(self, processing_time: float):
        self.stats.total_images += 1
        self._processing_times.append(processing_time)
        if len(self._processing_times) > 100:
            self._processing_times.pop(0)
        self.stats.avg_processing_time = sum(self._processing_times) / len(self._processing_times)

    def get_stats(self) -> Dict[str, Any]:
        return {
            "total_processed": self.stats.total_images,
            "avg_time_ms": round(self.stats.avg_processing_time * 1000, 2),
            "profile_usage": self.stats.profile_usage,
            "quality_distribution": self.stats.quality_distribution
        }

    def _assess_image_quality(self, img: np.ndarray) -> float:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        blur_score = min(laplacian_var / self.blur_threshold * 50, 50)

        brightness = np.mean(gray)
        if brightness < 50:
            brightness_score = (brightness / 50) * 20
        elif brightness > 200:
            brightness_score = ((255 - brightness) / 55) * 20
        else:
            brightness_score = 20

        contrast = gray.std()
        contrast_score = min(contrast / 80 * 30, 30)

        total_score = blur_score + brightness_score + contrast_score
        return total_score

    def _remove_reflection(self, img: np.ndarray, light: bool = False, heavy: bool = False) -> np.ndarray:
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        h, s, v = cv2.split(hsv)

        v_mean = np.mean(v)
        v_std = np.std(v)

        threshold_factor = 0.7 if light else (0.3 if heavy else 0.5)
        kernel_size = 7 if light else (21 if heavy else 15)

        if v_mean > 180 and v_std > 60:
            logger.info("检测到高光区域，进行反光去除")
            v_float = v.astype(np.float32)
            threshold = v_mean + threshold_factor * v_std
            reflection_mask = v_float > threshold

            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
            reflection_mask = cv2.morphologyEx(
                reflection_mask.astype(np.uint8),
                cv2.MORPH_CLOSE,
                kernel
            )

            inpaint_radius = 2 if light else (5 if heavy else 3)
            v_inpainted = cv2.inpaint(
                v,
                reflection_mask.astype(np.uint8),
                inpaint_radius,
                cv2.INPAINT_TELEA
            )

            hsv_merged = cv2.merge([h, s, v_inpainted])
            result = cv2.cvtColor(hsv_merged, cv2.COLOR_HSV2BGR)
            return result

        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)

        l_mean = np.mean(l)
        if l_mean > 180:
            logger.info("进行全局亮度调整")
            clahe_clip = 1.5 if light else (3.0 if heavy else 2.0)
            clahe = cv2.createCLAHE(clipLimit=clahe_clip, tileGridSize=(8, 8))
            l = clahe.apply(l)
            lab = cv2.merge([l, a, b])
            result = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
            return result

        return img

    def _deblur_image(self, img: np.ndarray, heavy: bool = False) -> np.ndarray:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()

        blur_threshold = self.blur_threshold * (0.8 if heavy else 1.0)

        if laplacian_var < blur_threshold:
            logger.info(f"检测到模糊图像 (方差: {laplacian_var:.2f})，进行去模糊处理")

            psf_size = 3 if not heavy else 7
            psf = np.ones((psf_size, psf_size), np.float32) / (psf_size * psf_size)
            noise_var = 0.005 if not heavy else 0.001
            img_float = img.astype(np.float32) / 255.0

            result_channels = []
            for i in range(3):
                channel = img_float[:, :, i]
                deblurred = self._wiener_deconvolution(channel, psf, noise_var)
                result_channels.append(deblurred)

            result = cv2.merge(result_channels)
            result = np.clip(result * 255, 0, 255).astype(np.uint8)

            sharpen_strength = 1.0 if not heavy else 1.5
            kernel = np.array([
                [-sharpen_strength, -sharpen_strength, -sharpen_strength],
                [-sharpen_strength, 1 + 8 * sharpen_strength, -sharpen_strength],
                [-sharpen_strength, -sharpen_strength, -sharpen_strength]
            ])
            result = cv2.filter2D(result, -1, kernel)

            return result

        return img

    def _wiener_deconvolution(self, img: np.ndarray, psf: np.ndarray, noise_var: float) -> np.ndarray:
        rows, cols = img.shape
        psf_padded = np.zeros((rows, cols), dtype=np.float32)
        psf_rows, psf_cols = psf.shape
        psf_padded[:psf_rows, :psf_cols] = psf

        psf_fft = np.fft.fft2(np.fft.ifftshift(psf_padded))
        img_fft = np.fft.fft2(img)

        psf_conj = np.conj(psf_fft)
        denominator = np.abs(psf_fft) ** 2 + noise_var

        result_fft = img_fft * psf_conj / denominator
        result = np.real(np.fft.ifft2(result_fft))

        return result

    def _super_resolution(self, img: np.ndarray) -> np.ndarray:
        pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))

        enhancer = ImageEnhance.Sharpness(pil_img)
        pil_img = enhancer.enhance(1.5)

        enhancer = ImageEnhance.Contrast(pil_img)
        pil_img = enhancer.enhance(1.2)

        pil_img = pil_img.filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))

        result = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        return result

    def _sharpen_image(self, img: np.ndarray, amount: float = 1.0, heavy: bool = False) -> np.ndarray:
        center = 1 + 4 * amount
        kernel = np.array([
            [0, -amount, 0],
            [-amount, center, -amount],
            [0, -amount, 0]
        ])
        sharpened = cv2.filter2D(img, -1, kernel)
        sharpened = np.clip(sharpened, 0, 255).astype(np.uint8)

        if heavy:
            unsharp_kernel = np.array([
                [-1, -1, -1],
                [-1, 9, -1],
                [-1, -1, -1]
            ])
            sharpened = cv2.filter2D(sharpened, -1, unsharp_kernel)
            sharpened = np.clip(sharpened, 0, 255).astype(np.uint8)

        original_weight = 0.4 if heavy else 0.3
        return cv2.addWeighted(img, original_weight, sharpened, 1 - original_weight, 0)

    def _read_image(self, image_path: str) -> Optional[np.ndarray]:
        try:
            pil_img = Image.open(image_path)
            pil_img = pil_img.convert('RGB')

            enhancer = ImageEnhance.Sharpness(pil_img)
            pil_img = enhancer.enhance(1.1)

            img = np.array(pil_img)
            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
            return img
        except Exception as e:
            print(f"PIL读取图像失败: {e}")
            return None

    def _write_image(self, image_path: str, img: np.ndarray) -> bool:
        try:
            ext = os.path.splitext(image_path)[1].lower()
            if ext in ['.jpg', '.jpeg']:
                encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 95]
            elif ext == '.png':
                encode_param = [int(cv2.IMWRITE_PNG_COMPRESSION), 3]
            elif ext == '.bmp':
                encode_param = []
            else:
                encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 95]

            retval, buffer = cv2.imencode(ext, img, encode_param)
            if retval:
                with open(image_path, 'wb') as f:
                    buffer.tofile(f)
                return True
            return False
        except Exception as e:
            print(f"保存图像失败: {e}")
            return False

    def _resize(self, img: np.ndarray) -> np.ndarray:
        h, w = img.shape[:2]
        scale = min(self.target_width / w, self.target_height / h)
        new_w, new_h = int(w * scale), int(h * scale)
        return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

    def _denoise(self, img: np.ndarray, strength: int = 5, heavy: bool = False) -> np.ndarray:
        h, w = img.shape[:2]
        template_window = 7 if not heavy else 9
        search_window = 21 if not heavy else 31

        if h * w < 500000:
            return cv2.fastNlMeansDenoisingColored(img, None, strength, strength, template_window, search_window // 2 + 7)
        return cv2.fastNlMeansDenoisingColored(img, None, min(strength * 1.5, 15), min(strength * 1.5, 15), template_window, search_window)

    def _enhance_contrast(self, img: np.ndarray, clip_limit: float = 2.5) -> np.ndarray:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
        l = clahe.apply(l)
        lab = cv2.merge((l, a, b))
        return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    def _adaptive_threshold(self, img: np.ndarray, otsu: bool = False) -> np.ndarray:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        if otsu:
            otsu_thresh, binary_otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            return cv2.cvtColor(binary_otsu, cv2.COLOR_GRAY2BGR)

        adaptive_thresh = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )

        return cv2.cvtColor(adaptive_thresh, cv2.COLOR_GRAY2BGR)

    def _morphological_operations(self, img: np.ndarray, heavy: bool = False) -> np.ndarray:
        if not heavy:
            kernel_small = np.ones((1, 1), np.uint8)
            kernel_medium = np.ones((2, 2), np.uint8)
            img = cv2.erode(img, kernel_small, iterations=1)
            img = cv2.dilate(img, kernel_medium, iterations=1)
        else:
            kernel_open = np.ones((2, 2), np.uint8)
            kernel_close = np.ones((3, 3), np.uint8)
            img = cv2.morphologyEx(img, cv2.MORPH_OPEN, kernel_open)
            img = cv2.morphologyEx(img, cv2.MORPH_CLOSE, kernel_close)

        return img

    def _generate_processed_filename(self, original_path: str) -> str:
        base, ext = os.path.splitext(os.path.basename(original_path))
        return f"{base}_processed{ext}"


image_preprocessor = ImagePreprocessor()

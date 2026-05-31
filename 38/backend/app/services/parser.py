import os
import re
import uuid
import base64
import logging
import hashlib
import fitz
import pdfplumber
from PIL import Image, ImageFilter, ImageEnhance
from io import BytesIO
from docx import Document
from typing import Optional, Tuple, List
from ..config import UPLOAD_DIR, EXTRACTED_DIR
from ..models.schemas import ParsedContent

logger = logging.getLogger(__name__)


class PreprocessingConfig:
    IMAGE_MAX_SIZE = 1536
    IMAGE_QUALITY = 80
    IMAGE_MIN_SIZE = 64
    TEXT_MIN_LENGTH = 3
    CONTEXT_WINDOW = 400


class ImageInfo:
    def __init__(
        self,
        path: str,
        page_num: int = 0,
        index: int = 0,
        caption: str = "",
        nearby_text: str = "",
        bbox: Optional[tuple] = None,
        width: int = 0,
        height: int = 0,
        content_hash: str = "",
    ):
        self.path = path
        self.page_num = page_num
        self.index = index
        self.caption = caption
        self.nearby_text = nearby_text
        self.bbox = bbox
        self.width = width
        self.height = height
        self.content_hash = content_hash

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "page_num": self.page_num,
            "index": self.index,
            "caption": self.caption,
            "nearby_text": self.nearby_text,
            "bbox": list(self.bbox) if self.bbox else None,
            "width": self.width,
            "height": self.height,
            "content_hash": self.content_hash,
        }


def _normalize_text(text: str) -> str:
    if not text:
        return ""

    text = re.sub(r"\r\n", "\n", text)
    text = re.sub(r"\r", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    lines = text.split("\n")
    normalized_lines = []
    for line in lines:
        stripped = line.rstrip()
        if len(stripped) >= PreprocessingConfig.TEXT_MIN_LENGTH:
            normalized_lines.append(stripped)

    return "\n".join(normalized_lines)


def _clean_whitespace(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def _is_image_duplicate(img_bytes: bytes, seen_hashes: set) -> Tuple[bool, str]:
    content_hash = hashlib.md5(img_bytes).hexdigest()
    is_duplicate = content_hash in seen_hashes
    if not is_duplicate:
        seen_hashes.add(content_hash)
    return is_duplicate, content_hash


def _preprocess_image(img: Image.Image, enhance: bool = True) -> Image.Image:
    if img.mode not in ("RGB", "L"):
        if img.mode == "RGBA":
            background = Image.new("RGB", img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])
            img = background
        else:
            img = img.convert("RGB")

    w, h = img.size
    max_dim = max(w, h)

    if max_dim < PreprocessingConfig.IMAGE_MIN_SIZE:
        scale = PreprocessingConfig.IMAGE_MIN_SIZE / max_dim
        new_w, new_h = int(w * scale), int(h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)
    elif max_dim > PreprocessingConfig.IMAGE_MAX_SIZE:
        scale = PreprocessingConfig.IMAGE_MAX_SIZE / max_dim
        new_w, new_h = int(w * scale), int(h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)

    if enhance:
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.1)
        enhancer = ImageEnhance.Sharpness(img)
        img = enhancer.enhance(1.05)

    return img


def _save_extracted_image(
    image_bytes: bytes,
    doc_id: str,
    page_num: int,
    img_idx: int,
    seen_hashes: set = None,
) -> Tuple[Optional[str], Optional[ImageInfo]]:
    if seen_hashes is None:
        seen_hashes = set()

    is_dup, content_hash = _is_image_duplicate(image_bytes, seen_hashes)
    if is_dup:
        logger.debug(f"Skipping duplicate image on page {page_num}, index {img_idx}")
        return None, None

    img_dir = os.path.join(EXTRACTED_DIR, doc_id)
    os.makedirs(img_dir, exist_ok=True)
    filename = f"page{page_num}_img{img_idx}_{content_hash[:8]}.jpg"
    filepath = os.path.join(img_dir, filename)

    if os.path.exists(filepath):
        try:
            with Image.open(filepath) as existing_img:
                w, h = existing_img.size
            img_info = ImageInfo(
                path=filepath,
                page_num=page_num,
                index=img_idx,
                caption="",
                nearby_text="",
                bbox=None,
                width=w,
                height=h,
                content_hash=content_hash,
            )
            return filepath, img_info
        except Exception:
            pass

    try:
        img = Image.open(BytesIO(image_bytes))
        orig_w, orig_h = img.size
        img = _preprocess_image(img)

        buffer = BytesIO()
        img.save(buffer, "JPEG", quality=PreprocessingConfig.IMAGE_QUALITY, optimize=True, progressive=True)
        optimized_bytes = buffer.getvalue()

        with open(filepath, "wb") as f:
            f.write(optimized_bytes)

        w, h = img.size
        img_info = ImageInfo(
            path=filepath,
            page_num=page_num,
            index=img_idx,
            caption="",
            nearby_text="",
            bbox=None,
            width=w,
            height=h,
            content_hash=content_hash,
        )
        return filepath, img_info
    except Exception as e:
        logger.warning(f"Image optimization failed, saving raw: {e}")
        try:
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            with Image.open(BytesIO(image_bytes)) as img:
                w, h = img.size
            img_info = ImageInfo(
                path=filepath,
                page_num=page_num,
                index=img_idx,
                width=w,
                height=h,
                content_hash=content_hash,
            )
            return filepath, img_info
        except Exception as e2:
            logger.error(f"Raw image save also failed: {e2}")
            return None, None


def _extract_caption(
    page_text: str,
    img_bbox: tuple,
    page_height: float,
    max_lines: int = 3,
) -> str:
    if len(img_bbox) < 4:
        return ""

    img_y0, img_y1 = img_bbox[1], img_bbox[3]
    caption_patterns = [
        r"(?:图|Figure|Fig\.|图表|示意图)\s*[\d一二三四五六七八九十]+\s*[.、:：]?\s*(.+?)(?:\n\n|\n\s*\n|$)",
        r"(?:表|Table|Tab\.|表格)\s*[\d一二三四五六七八九十]+\s*[.、:：]?\s*(.+?)(?:\n\n|\n\s*\n|$)",
        r"(?:图片|插图|附图|附表)\s*[\d一二三四五六七八九十]*[.、:：]?\s*(.+?)(?:\n\n|\n\s*\n|$)",
    ]

    for pattern in caption_patterns:
        matches = re.finditer(pattern, page_text, re.IGNORECASE)
        for m in matches:
            caption = _clean_whitespace(m.group(1))
            if caption and len(caption) < 200:
                return caption

    img_relative_y = img_y1 / page_height if page_height > 0 else 0
    lines = page_text.split("\n")
    nearby_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and 3 < len(stripped) < 100:
            if (
                stripped.startswith(("图", "表", "Figure", "Fig", "Table", "Tab", "图片", "插图"))
                or any(kw in stripped for kw in ["示意图", "流程图", "架构图", "对比表", "统计表", "框图"])
            ):
                nearby_lines.append(stripped)
                if len(nearby_lines) >= max_lines:
                    break

    return "\n".join(nearby_lines[:max_lines])


def _get_nearby_text(
    page_text: str,
    img_bbox: tuple,
    page_height: float,
    context_chars: int = 400,
) -> str:
    if not page_text.strip():
        return ""

    if len(img_bbox) < 4:
        return _clean_whitespace(page_text[:context_chars * 2])

    img_center_y = (img_bbox[1] + img_bbox[3]) / 2
    relative_y = img_center_y / page_height if page_height > 0 else 0.5
    relative_y = max(0.0, min(1.0, relative_y))

    text_len = len(page_text)
    approx_pos = int(text_len * relative_y)

    text_start = max(0, approx_pos - context_chars)
    text_end = min(text_len, approx_pos + context_chars)

    nearby = page_text[text_start:text_end]
    nearby = _normalize_text(nearby)

    if len(nearby) > context_chars * 2:
        nearby = nearby[: context_chars * 2] + "..."

    return nearby


def _detect_page_layout(page: fitz.Page) -> dict:
    blocks = page.get_text("dict")
    layout_info = {
        "text_blocks": [],
        "image_blocks": [],
        "has_columns": False,
        "text_density": 0,
    }

    if "blocks" not in blocks:
        return layout_info

    text_x_positions = []
    for block in blocks["blocks"]:
        if block["type"] == 0:
            layout_info["text_blocks"].append(block["bbox"])
            text_x_positions.append(block["bbox"][0])
        elif block["type"] == 1:
            layout_info["image_blocks"].append(block["bbox"])

    if len(text_x_positions) > 5:
        unique_x = set(round(x, -1) for x in text_x_positions)
        layout_info["has_columns"] = len(unique_x) >= 2

    layout_info["text_density"] = len(layout_info["text_blocks"]) / max(1, len(blocks["blocks"]))
    return layout_info


def parse_pdf(filepath: str, doc_id: str) -> ParsedContent:
    text_parts = []
    image_paths: list[str] = []
    image_infos: list[dict] = []
    filename = os.path.basename(filepath)
    page_count = 0
    seen_image_hashes = set()

    try:
        doc = fitz.open(filepath)
        page_count = len(doc)

        for page_num in range(page_count):
            page = doc[page_num]
            page_rect = page.rect
            page_height = page_rect.height

            layout = _detect_page_layout(page)

            text = page.get_text("text")
            text = _normalize_text(text)
            if text.strip():
                text_parts.append(text.strip())

            images = page.get_images(full=True)
            for img_idx, img in enumerate(images):
                xref = img[0]
                try:
                    pix = fitz.Pixmap(doc, xref)
                    if pix.n < 5:
                        img_bytes = pix.tobytes("png")
                    else:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                        img_bytes = pix.tobytes("png")

                    img_bboxes = page.get_image_rects(xref)
                    img_bbox = img_bboxes[0] if img_bboxes else (0, 0, 0, 0)

                    caption = _extract_caption(text, img_bbox, page_height)
                    nearby_text = _get_nearby_text(text, img_bbox, page_height)

                    path, img_info = _save_extracted_image(
                        img_bytes, doc_id, page_num, img_idx, seen_image_hashes
                    )
                    if path and img_info:
                        img_info.caption = caption
                        img_info.nearby_text = nearby_text
                        img_info.bbox = img_bbox
                        image_paths.append(path)
                        image_infos.append(img_info.to_dict())

                        if caption or nearby_text:
                            enriched_text = f"\n\n[图片 {len(image_paths)} (第{page_num + 1}页)]\n"
                            if caption:
                                enriched_text += f"图注: {caption}\n"
                            if nearby_text:
                                enriched_text += f"上下文: {nearby_text[:300]}\n"
                            text_parts.append(enriched_text.strip())

                except Exception as e:
                    logger.warning(f"Failed to extract image {img_idx} from page {page_num}: {e}")

        doc.close()

        if not text_parts or all(len(t.strip()) < 10 for t in text_parts):
            logger.info(f"PDF appears to be scanned, attempting text extraction with pdfplumber...")
            try:
                with pdfplumber.open(filepath) as pdf:
                    page_count = len(pdf.pages)
                    for page in pdf.pages:
                        try:
                            text = page.extract_text()
                            if text:
                                text = _normalize_text(text)
                                if text.strip():
                                    text_parts.append(text.strip())
                        except Exception as e:
                            logger.warning(f"pdfplumber page extraction failed: {e}")
            except Exception as e:
                logger.error(f"pdfplumber fallback also failed: {e}")

    except Exception as e:
        logger.error(f"PyMuPDF parsing failed for {filepath}: {e}")

    full_text = "\n\n".join(text_parts)
    full_text = _normalize_text(full_text)

    return ParsedContent(
        doc_id=doc_id,
        filename=filename,
        text_content=full_text,
        images=image_paths,
        page_count=page_count,
    )


def parse_image(filepath: str, doc_id: str) -> ParsedContent:
    filename = os.path.basename(filepath)
    try:
        img = Image.open(filepath)
        img_dir = os.path.join(EXTRACTED_DIR, doc_id)
        os.makedirs(img_dir, exist_ok=True)

        orig_w, orig_h = img.size
        img = _preprocess_image(img)

        img_bytes_io = BytesIO()
        img.save(img_bytes_io, "JPEG", quality=PreprocessingConfig.IMAGE_QUALITY, optimize=True)
        img_bytes = img_bytes_io.getvalue()

        content_hash = hashlib.md5(img_bytes).hexdigest()[:8]
        base, ext = os.path.splitext(filename)
        saved_path = os.path.join(img_dir, f"0_{base}_{content_hash}.jpg")

        with open(saved_path, "wb") as f:
            f.write(img_bytes)

        w, h = img.size
        img_info = ImageInfo(
            path=saved_path,
            page_num=0,
            index=0,
            caption="",
            nearby_text="",
            bbox=(0, 0, w, h),
            width=w,
            height=h,
            content_hash=content_hash,
        )

        desc = f"[图片文件: {filename}]"
        if orig_w != w or orig_h != h:
            desc += f" (原尺寸: {orig_w}x{orig_h} -> 优化后: {w}x{h})"

        return ParsedContent(
            doc_id=doc_id,
            filename=filename,
            text_content=desc,
            images=[saved_path],
            page_count=1,
        )
    except Exception as e:
        logger.error(f"Image parsing failed for {filepath}: {e}")
        return ParsedContent(
            doc_id=doc_id,
            filename=filename,
            text_content="",
            images=[],
            page_count=0,
        )


def parse_docx(filepath: str, doc_id: str) -> ParsedContent:
    filename = os.path.basename(filepath)
    text_parts = []
    image_paths = []
    page_count = 1
    seen_image_hashes = set()

    try:
        doc = Document(filepath)
        img_idx = 0

        for para_idx, para in enumerate(doc.paragraphs):
            para_text = para.text.strip()
            if para_text:
                para_text = _normalize_text(para_text)
                text_parts.append(para_text)

            if para_text and any(
                kw in para_text for kw in ["图", "表", "Figure", "Fig", "Table", "Tab", "示意图", "流程图", "架构图"]
            ):
                for run in para.runs:
                    for rel in run.part.rels.values():
                        if "image" in rel.reltype:
                            try:
                                img_bytes = rel.target_part.blob
                                path, img_info = _save_extracted_image(
                                    img_bytes, doc_id, 0, img_idx, seen_image_hashes
                                )
                                if path and img_info:
                                    image_paths.append(path)
                                    img_info.caption = para_text[:100]
                                    enriched = f"\n[图片 {len(image_paths)}]\n图注: {para_text[:100]}\n"
                                    text_parts.append(enriched.strip())
                                    img_idx += 1
                            except Exception as e:
                                logger.warning(f"Failed to extract inline image: {e}")

        img_dir = os.path.join(EXTRACTED_DIR, doc_id)
        os.makedirs(img_dir, exist_ok=True)
        for rel in doc.part.rels.values():
            if "image" in rel.reltype:
                try:
                    img_bytes = rel.target_part.blob
                    content_hash = hashlib.md5(img_bytes).hexdigest()
                    if content_hash not in seen_image_hashes:
                        path, img_info = _save_extracted_image(
                            img_bytes, doc_id, 0, img_idx, seen_image_hashes
                        )
                        if path:
                            image_paths.append(path)
                            img_idx += 1
                except Exception as e:
                    logger.warning(f"Failed to extract image from docx: {e}")

    except Exception as e:
        logger.error(f"DOCX parsing failed for {filepath}: {e}")

    full_text = "\n\n".join(text_parts)
    full_text = _normalize_text(full_text)

    return ParsedContent(
        doc_id=doc_id,
        filename=filename,
        text_content=full_text,
        images=image_paths,
        page_count=page_count,
    )


def parse_txt(filepath: str, doc_id: str) -> ParsedContent:
    filename = os.path.basename(filepath)
    text = ""
    encodings = ["utf-8", "gbk", "gb18030", "latin-1"]

    for encoding in encodings:
        try:
            with open(filepath, "r", encoding=encoding) as f:
                text = f.read()
            break
        except UnicodeDecodeError:
            continue
    else:
        with open(filepath, "rb") as f:
            text = f.read().decode("utf-8", errors="ignore")

    text = _normalize_text(text)

    return ParsedContent(
        doc_id=doc_id,
        filename=filename,
        text_content=text,
        images=[],
        page_count=1,
    )


def image_to_base64(filepath: str, max_size: int = 1024, quality: int = 80) -> str:
    try:
        with Image.open(filepath) as img:
            if img.mode not in ("RGB", "L"):
                if img.mode == "RGBA":
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[3])
                    img = background
                else:
                    img = img.convert("RGB")

            w, h = img.size
            if max(w, h) > max_size:
                scale = max_size / max(w, h)
                new_w, new_h = int(w * scale), int(h * scale)
                img = img.resize((new_w, new_h), Image.LANCZOS)

            buffer = BytesIO()
            img.save(buffer, "JPEG", quality=quality, optimize=True)
            return base64.b64encode(buffer.getvalue()).decode("utf-8")
    except Exception as e:
        logger.warning(f"Image to base64 failed, using raw encoding: {e}")
        with open(filepath, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")


async def parse_document(filepath: str, doc_id: str = None) -> ParsedContent:
    if doc_id is None:
        doc_id = str(uuid.uuid4())

    ext = os.path.splitext(filepath)[1].lower()
    parsers = {
        ".pdf": parse_pdf,
        ".png": parse_image,
        ".jpg": parse_image,
        ".jpeg": parse_image,
        ".bmp": parse_image,
        ".tiff": parse_image,
        ".docx": parse_docx,
        ".doc": parse_docx,
        ".txt": parse_txt,
        ".md": parse_txt,
    }

    parser = parsers.get(ext)
    if parser is None:
        logger.error(f"Unsupported file type: {ext}")
        return ParsedContent(
            doc_id=doc_id,
            filename=os.path.basename(filepath),
            text_content=f"不支持的文件格式: {ext}",
            images=[],
            page_count=0,
        )

    result = parser(filepath, doc_id)
    logger.info(
        f"Parsed {filepath}: {len(result.text_content)} chars, "
        f"{len(result.images)} images, {result.page_count} pages"
    )
    return result


async def batch_parse(filepaths: list[str], max_concurrent: int = 4) -> list[ParsedContent]:
    import asyncio
    semaphore = asyncio.Semaphore(max_concurrent)

    async def bounded_parse(fp: str) -> ParsedContent:
        async with semaphore:
            doc_id = str(uuid.uuid4())
            return await parse_document(fp, doc_id)

    tasks = [bounded_parse(fp) for fp in filepaths]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    parsed_results = []
    for r in results:
        if isinstance(r, Exception):
            logger.error(f"Batch parse error: {r}")
        else:
            parsed_results.append(r)

    return parsed_results

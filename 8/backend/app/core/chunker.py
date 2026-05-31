import re
import hashlib
import logging
from typing import List, Dict, Set, Tuple
from app.config import (
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    SHARD_BY_SECTION,
    SHARD_DEDUP_ENABLED,
    CONTENT_HASH_ALGO,
)

logger = logging.getLogger(__name__)

_SENTENCE_ENDINGS = re.compile(r'[。！？\.\!\?]\s*')
_PARAGRAPH_BREAK = re.compile(r'\n\s*\n')
_SECTION_HEADER = re.compile(r'^#{1,6}\s+(.+)$', re.MULTILINE)
_DOCX_HEADING = re.compile(r'^第[一二三四五六七八九十百千]+[章节篇]\s*[：:]?\s*(.+)$', re.MULTILINE)
_CHAPTER_NUM = re.compile(r'^\d+(\.\d+)*\s+(.+)$', re.MULTILINE)


def _hash_content(content: str) -> str:
    if CONTENT_HASH_ALGO == "xxhash":
        try:
            import xxhash
            return xxhash.xxh3_64_hexdigest(content.encode('utf-8'))
        except ImportError:
            pass
    return hashlib.md5(content.encode('utf-8')).hexdigest()


class TextChunker:
    def __init__(self):
        self.seen_hashes: Set[str] = set()

    def chunk_pages(
        self,
        pages: List[Dict],
        chunk_size: int = CHUNK_SIZE,
        chunk_overlap: int = CHUNK_OVERLAP,
        enable_section_sharding: bool = SHARD_BY_SECTION,
        enable_dedup: bool = SHARD_DEDUP_ENABLED,
    ) -> List[Dict]:
        all_chunks: List[Dict] = []
        chunk_index = 0

        for page in pages:
            content = page["content"]
            page_number = page.get("page_number")
            if not content or not content.strip():
                continue

            page_chunks = self._process_page(
                content, page_number, chunk_size, chunk_overlap,
                enable_section_sharding, enable_dedup
            )

            for chunk in page_chunks:
                clean_text = self._clean_text(chunk["content"])
                if not clean_text:
                    continue

                content_hash = _hash_content(clean_text)
                if enable_dedup and content_hash in self.seen_hashes:
                    continue
                if enable_dedup:
                    self.seen_hashes.add(content_hash)

                all_chunks.append({
                    "content": clean_text,
                    "page_number": chunk.get("page_number"),
                    "token_count": len(clean_text),
                    "chunk_index": str(chunk_index),
                    "content_hash": content_hash,
                    "section": chunk.get("section", ""),
                })
                chunk_index += 1

        logger.info(f"Chunked into {len(all_chunks)} unique chunks (deduplicated: {enable_dedup})")
        return all_chunks

    def _process_page(
        self,
        content: str,
        page_number,
        chunk_size: int,
        chunk_overlap: int,
        enable_section: bool,
        enable_dedup: bool,
    ) -> List[Dict]:
        if enable_section:
            sections = self._extract_sections(content)
            if sections:
                chunks = []
                for section_title, section_content in sections:
                    section_chunks = self._split_text(
                        section_content, chunk_size, chunk_overlap
                    )
                    for c in section_chunks:
                        chunks.append({
                            "content": c,
                            "page_number": page_number,
                            "section": section_title,
                        })
                return chunks

        chunks = self._split_text(content, chunk_size, chunk_overlap)
        return [{"content": c, "page_number": page_number, "section": ""} for c in chunks]

    def _extract_sections(self, text: str) -> List[Tuple[str, str]]:
        sections: List[Tuple[str, str]] = []

        patterns = [
            (_SECTION_HEADER, 0),
            (_DOCX_HEADING, 1),
            (_CHAPTER_NUM, 2),
        ]

        best_sections: List[Tuple[int, str, int]] = []
        for pattern, group_idx in patterns:
            for match in pattern.finditer(text):
                title = match.group(group_idx + 1) if group_idx < len(match.groups()) else match.group(1)
                best_sections.append((match.start(), title, group_idx))

        if not best_sections:
            return []

        best_sections.sort(key=lambda x: x[0])

        for i in range(len(best_sections)):
            start_pos, title, _ = best_sections[i]
            end_pos = best_sections[i + 1][0] if i + 1 < len(best_sections) else len(text)
            section_content = text[start_pos:end_pos].strip()
            if section_content:
                sections.append((title, section_content))

        return sections

    def _clean_text(self, text: str) -> str:
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        text = text.replace('\ufffd', '')
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()

    def _split_text(self, text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
        if len(text) <= chunk_size:
            return [text]

        paragraphs = _PARAGRAPH_BREAK.split(text)
        if len(paragraphs) <= 1:
            return self._split_by_sentences(text, chunk_size, chunk_overlap)

        chunks = []
        current_chunk = ""
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            if len(current_chunk) + len(para) + 2 <= chunk_size:
                if current_chunk:
                    current_chunk += "\n\n" + para
                else:
                    current_chunk = para
            else:
                if current_chunk:
                    chunks.append(current_chunk)
                if len(para) > chunk_size:
                    sub_chunks = self._split_by_sentences(para, chunk_size, chunk_overlap)
                    chunks.extend(sub_chunks[:-1])
                    current_chunk = sub_chunks[-1] if sub_chunks else ""
                else:
                    current_chunk = para
        if current_chunk:
            chunks.append(current_chunk)

        if chunk_overlap > 0 and len(chunks) > 1:
            overlapped = [chunks[0]]
            for i in range(1, len(chunks)):
                prev_tail = chunks[i - 1][-chunk_overlap:] if len(chunks[i - 1]) > chunk_overlap else chunks[i - 1]
                overlapped.append(prev_tail + chunks[i])
            return overlapped

        return [c for c in chunks if c.strip()]

    def _split_by_sentences(self, text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
        sentences = []
        last_end = 0
        for match in _SENTENCE_ENDINGS.finditer(text):
            end = match.end()
            sentence = text[last_end:end].strip()
            if sentence:
                sentences.append(sentence)
            last_end = end
        if last_end < len(text):
            remaining = text[last_end:].strip()
            if remaining:
                sentences.append(remaining)

        if not sentences:
            return self._split_by_chars(text, chunk_size, chunk_overlap)

        chunks = []
        current_chunk = ""
        for sentence in sentences:
            if len(current_chunk) + len(sentence) + 1 <= chunk_size:
                if current_chunk:
                    current_chunk += sentence
                else:
                    current_chunk = sentence
            else:
                if current_chunk:
                    chunks.append(current_chunk)
                current_chunk = sentence
        if current_chunk:
            chunks.append(current_chunk)

        if not chunks:
            return self._split_by_chars(text, chunk_size, chunk_overlap)
        return chunks

    def _split_by_chars(self, text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            if end < len(text):
                split_pos = self._find_split_point(chunk, start)
                if split_pos > start + chunk_size // 3:
                    chunk = text[start:split_pos]
                    end = split_pos
            chunks.append(chunk.strip())
            start = end - chunk_overlap
            if start >= len(text):
                break
        return [c for c in chunks if c]

    def _find_split_point(self, chunk: str, absolute_start: int) -> int:
        for sep in ['。', '！', '？', '.', '!', '?', '\n', '；', ';', '，', ',', ' ']:
            pos = chunk.rfind(sep)
            if pos > len(chunk) // 3:
                return absolute_start + pos + len(sep)
        return absolute_start + len(chunk)

import re
import gc
from typing import Optional, List, Callable, Iterator, Dict, Any, Tuple
from pathlib import Path

from app.core.config import settings
from app.schemas.paper import PaperParseResult, PaperChapter, PaperReference


class StreamPDFParser:
    CHAPTER_PATTERNS = [
        r"^\s*(\d+)\s+([A-Z][\w\s]+)$",
        r"^\s*(\d+\.\d+)\s+([\w\s]+)$",
        r"^\s*(Chapter\s+\d+)\s*[:：]?\s*([\w\s]+)$",
        r"^\s*([一二三四五六七八九十]+)\s*[、\.]\s*([\w\s]+)$",
        r"^\s*([一二三四五六七八九十]+)\s*章\s*[:：]?\s*([\w\s]+)$",
    ]

    ABSTRACT_PATTERNS = [
        r"Abstract\s*[:：]?\s*(.*?)(?=\n\s*(Keywords|Key\s+words|1\.|I\.|Introduction))",
        r"摘要\s*[:：]?\s*(.*?)(?=\n\s*(关键词|关键字|1\.|一、|引言))",
    ]

    KEYWORDS_PATTERNS = [
        r"Keywords\s*[:：]?\s*(.*?)(?=\n\s*(1\.|I\.|Introduction))",
        r"Key\s+words\s*[:：]?\s*(.*?)(?=\n\s*(1\.|I\.|Introduction))",
        r"关键词\s*[:：]?\s*(.*?)(?=\n\s*(1\.|一、|引言))",
        r"关键字\s*[:：]?\s*(.*?)(?=\n\s*(1\.|一、|引言))",
    ]

    REFERENCES_HEADINGS = [
        "References",
        "Reference",
        "Bibliography",
        "参考文献",
        "参考资料",
        "引文",
    ]

    def __init__(
        self,
        chunk_size: Optional[int] = None,
        stream_threshold: Optional[int] = None,
        memory_limit_mb: Optional[int] = None,
    ):
        self.chunk_size = chunk_size or settings.PDF_PARSER_CHUNK_SIZE
        self.stream_threshold = stream_threshold or settings.PDF_PARSER_STREAM_THRESHOLD
        self.memory_limit_mb = memory_limit_mb or settings.PDF_PARSER_MEMORY_LIMIT_MB
        self._progress_callback: Optional[Callable[[int, int, str], None]] = None

    def set_progress_callback(
        self, callback: Callable[[int, int, str], None]
    ) -> None:
        self._progress_callback = callback

    def _report_progress(self, current: int, total: int, stage: str) -> None:
        if self._progress_callback:
            try:
                self._progress_callback(current, total, stage)
            except Exception:
                pass

    def _check_memory_usage(self) -> bool:
        try:
            import psutil
            import os
            process = psutil.Process(os.getpid())
            mem_mb = process.memory_info().rss / 1024 / 1024
            return mem_mb < self.memory_limit_mb
        except ImportError:
            return True

    def _get_pdf_page_count(self, file_path: str) -> int:
        try:
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                return len(pdf.pages)
        except Exception:
            try:
                from pypdf import PdfReader
                reader = PdfReader(file_path)
                return len(reader.pages)
            except Exception:
                return 0

    def _extract_pages_stream(
        self, file_path: str, start_page: int, end_page: int
    ) -> Tuple[List[str], Dict[str, Any]]:
        pages_text = []
        metadata = {}

        try:
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                if start_page == 0 and end_page >= len(pdf.pages) - 1:
                    if pdf.metadata:
                        metadata = {
                            "title": pdf.metadata.get("Title"),
                            "author": pdf.metadata.get("Author"),
                            "subject": pdf.metadata.get("Subject"),
                            "creator": pdf.metadata.get("Creator"),
                            "producer": pdf.metadata.get("Producer"),
                            "creation_date": pdf.metadata.get("CreationDate"),
                            "modification_date": pdf.metadata.get("ModDate"),
                            "keywords": pdf.metadata.get("Keywords"),
                        }

                for page_idx in range(start_page, min(end_page + 1, len(pdf.pages))):
                    page = pdf.pages[page_idx]
                    text = page.extract_text() or ""
                    pages_text.append(text)

        except Exception:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            if start_page == 0 and end_page >= len(reader.pages) - 1:
                if reader.metadata:
                    meta = reader.metadata
                    metadata = {
                        "title": meta.title,
                        "author": meta.author,
                        "subject": meta.subject,
                        "creator": meta.creator,
                        "producer": meta.producer,
                        "creation_date": str(meta.creation_date) if meta.creation_date else None,
                        "modification_date": str(meta.modification_date) if meta.modification_date else None,
                    }

            for page_idx in range(start_page, min(end_page + 1, len(reader.pages))):
                page = reader.pages[page_idx]
                text = page.extract_text() or ""
                pages_text.append(text)

        return pages_text, metadata

    def _clean_text(self, text: str) -> str:
        if not text:
            return ""

        text = re.sub(r'\r\n', '\n', text)
        text = re.sub(r'\r', '\n', text)
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = text.strip()

        return text

    def extract_title(self, text: str) -> Optional[str]:
        if not text:
            return None

        lines = text.split("\n")
        for line in lines[:10]:
            line = line.strip()
            if len(line) > 10 and len(line) < 300:
                if not re.match(r"^(http|www|\d|@|Received|Accepted|Published)", line, re.IGNORECASE):
                    if sum(1 for c in line if c.isalpha()) / max(len(line), 1) > 0.5:
                        return line

        return None

    def extract_abstract(self, text: str) -> Optional[str]:
        if not text:
            return None

        for pattern in self.ABSTRACT_PATTERNS:
            match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
            if match:
                abstract = match.group(1).strip()
                abstract = re.sub(r"\s+", " ", abstract)
                if 50 < len(abstract) < 5000:
                    return abstract

        return None

    def extract_keywords(self, text: str) -> List[str]:
        if not text:
            return []

        for pattern in self.KEYWORDS_PATTERNS:
            match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
            if match:
                keywords_text = match.group(1).strip()
                keywords = re.split(r"[,;，；、]", keywords_text)
                keywords = [k.strip() for k in keywords if k.strip()]
                keywords = [k for k in keywords if len(k) < 100]
                if keywords:
                    return keywords

        return []

    def extract_chapters(
        self,
        pages_text: List[str],
        start_page_num: int = 1,
    ) -> List[PaperChapter]:
        if not pages_text:
            return []

        all_text = "\n".join(pages_text)
        lines = all_text.split("\n")
        chapters: List[PaperChapter] = []
        chapter_starts: List[Tuple[int, int, str, int]] = []

        for line_idx, line in enumerate(lines):
            line = line.strip()
            if not line or len(line) > 200:
                continue

            for pattern in self.CHAPTER_PATTERNS:
                match = re.match(pattern, line, re.IGNORECASE)
                if match:
                    level = 2 if "." in match.group(1) else 1
                    title = match.group(2).strip()
                    char_count = 0
                    page_num = start_page_num
                    for i, page_text in enumerate(pages_text):
                        char_count += len(page_text)
                        current_text = "\n".join(lines[:line_idx + 1])
                        if len(current_text) <= char_count:
                            page_num = start_page_num + i
                            break
                    chapter_starts.append((line_idx, level, title, page_num))
                    break

        if not chapter_starts:
            for i, page_text in enumerate(pages_text):
                cleaned = self._clean_text(page_text)
                if cleaned:
                    chapters.append(PaperChapter(
                        title=f"Page {start_page_num + i}",
                        content=cleaned,
                        page=start_page_num + i,
                        level=1,
                    ))
            return chapters

        chapter_starts.sort(key=lambda x: x[0])

        for i, (start_idx, level, title, page_num) in enumerate(chapter_starts):
            end_idx = chapter_starts[i + 1][0] if i + 1 < len(chapter_starts) else len(lines)
            content_lines = lines[start_idx + 1:end_idx]
            content = self._clean_text("\n".join(content_lines))

            if content:
                chapters.append(PaperChapter(
                    title=title,
                    content=content,
                    page=page_num,
                    level=level,
                ))

        return chapters

    def extract_references(self, text: str) -> List[PaperReference]:
        if not text:
            return []

        references: List[PaperReference] = []
        ref_start = -1

        for heading in self.REFERENCES_HEADINGS:
            pattern = rf"(?im)^\s*{heading}\s*[:：]?\s*$"
            match = re.search(pattern, text)
            if match:
                ref_start = match.end()
                break

        if ref_start == -1:
            for heading in self.REFERENCES_HEADINGS:
                idx = text.rfind(heading)
                if idx != -1:
                    ref_start = idx + len(heading)
                    break

        if ref_start == -1:
            return []

        ref_text = text[ref_start:].strip()
        ref_entries = re.split(r"\n\s*(?:\[\d+\]|\d+\.)", ref_text)
        ref_entries = [e.strip() for e in ref_entries if e.strip()]

        if len(ref_entries) < 2:
            ref_entries = re.split(r"\n{2,}", ref_text)
            ref_entries = [e.strip() for e in ref_entries if e.strip() and len(e) > 20]

        for entry in ref_entries[:100]:
            entry = re.sub(r"\s+", " ", entry).strip()
            if len(entry) < 20:
                continue

            ref = PaperReference(text=entry)

            year_match = re.search(r"\b(19|20)\d{2}\b", entry)
            if year_match:
                ref.year = year_match.group()

            authors_match = re.match(r"^([A-Z][^.]+?)(?:\.\s|\s\()", entry)
            if authors_match:
                ref.authors = authors_match.group(1).strip()

            title_match = re.search(r'"([^"]+)"|“([^”]+)”', entry)
            if title_match:
                ref.title = title_match.group(1) or title_match.group(2)
            else:
                parts = re.split(r"\.|\?|!", entry)
                for part in parts:
                    part = part.strip()
                    if 10 < len(part) < 300:
                        if not re.search(r"\b(19|20)\d{2}\b|pp|vol|issue|ISBN|DOI", part, re.IGNORECASE):
                            ref.title = part
                            break

            venue_match = re.search(r"(?:In|Proceedings of|Journal of|Conference on)\s+([^.]+)", entry, re.IGNORECASE)
            if venue_match:
                ref.venue = venue_match.group(1).strip()

            references.append(ref)

        return references

    def parse_stream(
        self,
        file_path: str,
    ) -> Iterator[Dict[str, Any]]:
        file_path_obj = Path(file_path)
        if not file_path_obj.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        total_pages = self._get_pdf_page_count(file_path)

        if total_pages <= self.stream_threshold:
            result = self.parse(file_path)
            yield {
                "type": "complete",
                "data": result.model_dump(),
                "progress": 100,
                "stage": "complete",
            }
            return

        self._report_progress(0, total_pages, "start")

        all_metadata = {}
        collected_chapters: List[PaperChapter] = []
        collected_text_parts: List[str] = []

        for chunk_start in range(0, total_pages, self.chunk_size):
            chunk_end = min(chunk_start + self.chunk_size - 1, total_pages - 1)

            if not self._check_memory_usage():
                gc.collect()

            pages_text, metadata = self._extract_pages_stream(
                file_path, chunk_start, chunk_end
            )

            if chunk_start == 0 and metadata:
                all_metadata.update(metadata)

            chunk_text = "\n".join(pages_text)
            cleaned_chunk = self._clean_text(chunk_text)
            collected_text_parts.append(cleaned_chunk)

            chapters = self.extract_chapters(pages_text, start_page_num=chunk_start + 1)
            collected_chapters.extend(chapters)

            progress = int((chunk_end + 1) / total_pages * 100)
            self._report_progress(chunk_end + 1, total_pages, f"parsing pages {chunk_start + 1}-{chunk_end + 1}")

            yield {
                "type": "chunk",
                "chunk_index": chunk_start // self.chunk_size,
                "start_page": chunk_start + 1,
                "end_page": chunk_end + 1,
                "page_count": len(pages_text),
                "chapter_count": len(chapters),
                "progress": progress,
                "chapters": [c.model_dump() for c in chapters],
            }

            del pages_text, chapters, cleaned_chunk

        full_text = "\n".join(collected_text_parts)

        title = self.extract_title(full_text)
        if not title and all_metadata.get("title"):
            title = all_metadata["title"]

        abstract = self.extract_abstract(full_text[:5000])
        keywords = self.extract_keywords(full_text[:5000])
        references = self.extract_references(full_text[-10000:])

        final_result = PaperParseResult(
            title=title,
            authors=None,
            abstract=abstract,
            keywords=keywords if keywords else None,
            total_pages=total_pages,
            chapters=collected_chapters,
            references=references,
            metadata=all_metadata,
            raw_text=full_text[:100000] if len(full_text) > 100000 else full_text,
        )

        self._report_progress(total_pages, total_pages, "complete")

        yield {
            "type": "complete",
            "data": final_result.model_dump(),
            "progress": 100,
            "stage": "complete",
        }

        del collected_text_parts, collected_chapters, full_text
        gc.collect()

    def parse(self, file_path: str) -> PaperParseResult:
        file_path_obj = Path(file_path)
        if not file_path_obj.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        pages_text, metadata = self._extract_pages_stream(file_path, 0, 100000)
        full_text = "\n".join(pages_text)
        cleaned_text = self._clean_text(full_text)

        title = self.extract_title(cleaned_text)
        if not title and metadata.get("title"):
            title = metadata["title"]

        abstract = self.extract_abstract(cleaned_text)
        keywords = self.extract_keywords(cleaned_text)
        chapters = self.extract_chapters(pages_text)
        references = self.extract_references(cleaned_text)

        return PaperParseResult(
            title=title,
            authors=None,
            abstract=abstract,
            keywords=keywords if keywords else None,
            total_pages=len(pages_text),
            chapters=chapters,
            references=references,
            metadata=metadata,
            raw_text=cleaned_text,
        )

    def extract_pages_only(
        self,
        file_path: str,
        start_page: int = 0,
        end_page: Optional[int] = None,
    ) -> List[str]:
        total_pages = self._get_pdf_page_count(file_path)
        if end_page is None:
            end_page = total_pages - 1

        pages_text, _ = self._extract_pages_stream(file_path, start_page, end_page)
        return [self._clean_text(p) for p in pages_text]


_stream_parser: Optional[StreamPDFParser] = None


def get_stream_parser() -> StreamPDFParser:
    global _stream_parser
    if _stream_parser is None:
        _stream_parser = StreamPDFParser()
    return _stream_parser


stream_pdf_parser = StreamPDFParser()

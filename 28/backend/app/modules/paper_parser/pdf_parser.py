import re
import json
from typing import Optional
from pathlib import Path

from pypdf import PdfReader
import pdfplumber

from app.modules.paper_parser.base_parser import BaseParser
from app.schemas.paper import PaperParseResult, PaperChapter, PaperReference


class PDFParser(BaseParser):
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

    AUTHOR_PATTERNS = [
        r"by\s+([A-Z][a-zA-Z\s\.,\-']+)(?=\n|$)",
        r"([A-Z][a-zA-Z\s\-']+(?:,\s*[A-Z][a-zA-Z\s\-']+)*)(?=\n\s*\n|\n\s*\w+@)",
    ]

    REFERENCES_HEADINGS = [
        "References",
        "Reference",
        "Bibliography",
        "参考文献",
        "参考资料",
        "引文",
    ]

    def parse(self, file_path: str) -> PaperParseResult:
        file_path_obj = Path(file_path)
        if not file_path_obj.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        pages_text, metadata = self._extract_with_pdfplumber(file_path)
        full_text = "\n".join(pages_text)
        cleaned_text = self._clean_text(full_text)

        title = self.extract_title(cleaned_text)
        if not title and metadata.get("title"):
            title = metadata["title"]

        authors = self.extract_authors(cleaned_text)
        abstract = self.extract_abstract(cleaned_text)
        keywords = self.extract_keywords(cleaned_text)
        chapters = self.extract_chapters(cleaned_text, pages_text)
        references = self.extract_references(cleaned_text)

        parse_result = PaperParseResult(
            title=title,
            authors=authors if authors else None,
            abstract=abstract,
            keywords=keywords if keywords else None,
            total_pages=len(pages_text),
            chapters=chapters,
            references=references,
            metadata=metadata,
            raw_text=cleaned_text,
        )

        return parse_result

    def _extract_with_pypdf(self, file_path: str) -> tuple[list[str], dict]:
        reader = PdfReader(file_path)
        pages_text = []
        for page in reader.pages:
            pages_text.append(page.extract_text() or "")

        metadata = {}
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

        return pages_text, metadata

    def _extract_with_pdfplumber(self, file_path: str) -> tuple[list[str], dict]:
        pages_text = []
        metadata = {}

        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                pages_text.append(text)

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

        if not any(pages_text):
            pages_text, pypdf_meta = self._extract_with_pypdf(file_path)
            metadata.update(pypdf_meta)

        return pages_text, metadata

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

    def extract_authors(self, text: str) -> list[str]:
        if not text:
            return []

        lines = text.split("\n")
        authors_text = ""

        for i, line in enumerate(lines[:20]):
            line = line.strip()
            for pattern in self.AUTHOR_PATTERNS:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    authors_text = match.group(1)
                    break
            if authors_text:
                break

        if not authors_text:
            for i in range(min(5, len(lines))):
                line = lines[i].strip()
                if "@" in line and i > 0:
                    for j in range(max(0, i - 3), i):
                        candidate = lines[j].strip()
                        if candidate and len(candidate) < 200 and "@" not in candidate:
                            if re.search(r"[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+", candidate):
                                authors_text = candidate
                                break
                    break

        if not authors_text:
            return []

        authors = re.split(r"[,&]|\sand\s", authors_text)
        authors = [a.strip() for a in authors if a.strip()]
        authors = [a for a in authors if 2 < len(a) < 100]

        return authors

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

    def extract_keywords(self, text: str) -> list[str]:
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

    def extract_chapters(self, text: str, pages: Optional[list[str]] = None) -> list[PaperChapter]:
        if not text:
            return []

        chapters: list[PaperChapter] = []
        lines = text.split("\n")

        chapter_starts: list[tuple[int, int, str, int]] = []

        for line_idx, line in enumerate(lines):
            line = line.strip()
            if not line or len(line) > 200:
                continue

            for pattern in self.CHAPTER_PATTERNS:
                match = re.match(pattern, line, re.IGNORECASE)
                if match:
                    level = 2 if "." in match.group(1) else 1
                    title = match.group(2).strip()
                    page_num = self._find_page_number(line_idx, lines, pages)
                    chapter_starts.append((line_idx, level, title, page_num))
                    break

        if not chapter_starts:
            if pages:
                for i, page_text in enumerate(pages):
                    if page_text.strip():
                        chapters.append(PaperChapter(
                            title=f"Page {i + 1}",
                            content=self._clean_text(page_text),
                            page=i + 1,
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

    def _find_page_number(self, line_idx: int, all_lines: list[str], pages: Optional[list[str]]) -> Optional[int]:
        if not pages:
            return None

        char_count = 0
        for page_num, page_text in enumerate(pages, 1):
            char_count += len(page_text)
            current_text = "\n".join(all_lines[:line_idx + 1])
            if len(current_text) <= char_count:
                return page_num

        return len(pages)

    def extract_references(self, text: str) -> list[PaperReference]:
        if not text:
            return []

        references: list[PaperReference] = []
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

    def parse_to_json(self, file_path: str) -> str:
        result = self.parse(file_path)
        return result.model_dump_json(indent=2, ensure_ascii=False)

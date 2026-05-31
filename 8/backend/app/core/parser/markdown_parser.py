import re
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


class MarkdownParser:
    def parse(self, file_path: str) -> List[Dict]:
        encodings = ['utf-8', 'gbk', 'gb2312', 'gb18030', 'big5', 'latin-1']
        md_text = None
        for encoding in encodings:
            try:
                with open(file_path, "r", encoding=encoding) as f:
                    md_text = f.read()
                break
            except (UnicodeDecodeError, UnicodeError):
                continue
        if md_text is None:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                md_text = f.read()

        sections = self._split_by_headers(md_text)
        if not sections:
            clean_text = self._clean_markdown(md_text)
            if not clean_text:
                return []
            return [{"content": clean_text, "page_number": None}]

        results = []
        for title, content in sections:
            full_content = f"{title}\n{content}" if title else content
            clean = self._clean_markdown(full_content)
            if clean.strip():
                results.append({"content": clean.strip(), "page_number": None})
        return results

    def _split_by_headers(self, text: str) -> list[tuple[str, str]]:
        sections = []
        current_header = ""
        current_content = []
        for line in text.split("\n"):
            if re.match(r'^#{1,6}\s+', line):
                if current_content:
                    sections.append((current_header, "\n".join(current_content)))
                current_header = line.strip()
                current_content = []
            else:
                current_content.append(line)
        if current_content:
            sections.append((current_header, "\n".join(current_content)))
        return sections

    def _clean_markdown(self, text: str) -> str:
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        text = text.replace('\ufffd', '')
        text = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'\1', text)
        text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
        text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
        text = re.sub(r'\*{1,2}([^*]+)\*{1,2}', r'\1', text)
        text = re.sub(r'_{1,2}([^_]+)_{1,2}', r'\1', text)
        text = re.sub(r'`{1,3}([^`]+)`{1,3}', r'\1', text)
        text = re.sub(r'^[-*+]\s+', '', text, flags=re.MULTILINE)
        text = re.sub(r'^\d+\.\s+', '', text, flags=re.MULTILINE)
        text = re.sub(r'^>\s+', '', text, flags=re.MULTILINE)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()

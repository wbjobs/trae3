import re
import logging
from typing import List, Dict
from docx import Document

logger = logging.getLogger(__name__)


class DocxParser:
    def parse(self, file_path: str) -> List[Dict]:
        doc = Document(file_path)
        paragraphs = []
        for para in doc.paragraphs:
            text = para.text.strip()
            if text:
                text = self._clean_text(text)
                if text:
                    paragraphs.append(text)
        if not paragraphs:
            return []
        full_text = "\n\n".join(paragraphs)
        return [{"content": full_text, "page_number": None}]

    def _clean_text(self, text: str) -> str:
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        text = text.replace('\ufffd', '')
        return text.strip()

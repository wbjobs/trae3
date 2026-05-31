import re
import logging
from typing import List, Dict
from PyPDF2 import PdfReader

logger = logging.getLogger(__name__)


class PDFParser:
    def parse(self, file_path: str) -> List[Dict]:
        reader = PdfReader(file_path)
        pages = []
        for i, page in enumerate(reader.pages):
            try:
                text = page.extract_text()
                if text:
                    text = self._clean_pdf_text(text)
                    if text.strip():
                        pages.append({"content": text.strip(), "page_number": i + 1})
            except Exception as e:
                logger.warning(f"Failed to extract text from page {i + 1}: {e}")
                continue
        return pages

    def _clean_pdf_text(self, text: str) -> str:
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        text = text.replace('\ufffd', '')
        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'([。！？；：，、）】」』])\s+', r'\1', text)
        text = re.sub(r'\s+([（【「『])', r'\1', text)
        return text

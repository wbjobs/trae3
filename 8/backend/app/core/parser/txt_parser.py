import re
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


class TxtParser:
    def parse(self, file_path: str) -> List[Dict]:
        encodings = ['utf-8', 'gbk', 'gb2312', 'gb18030', 'big5', 'latin-1']
        text = None
        for encoding in encodings:
            try:
                with open(file_path, "r", encoding=encoding) as f:
                    text = f.read()
                break
            except (UnicodeDecodeError, UnicodeError):
                continue
        if text is None:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        text = text.replace('\ufffd', '')
        if not text.strip():
            return []
        return [{"content": text.strip(), "page_number": None}]

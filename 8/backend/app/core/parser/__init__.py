from .pdf_parser import PDFParser
from .docx_parser import DocxParser
from .txt_parser import TxtParser
from .markdown_parser import MarkdownParser

PARSERS = {
    ".pdf": PDFParser(),
    ".docx": DocxParser(),
    ".txt": TxtParser(),
    ".md": MarkdownParser(),
}

def get_parser(file_type: str):
    return PARSERS.get(file_type.lower())

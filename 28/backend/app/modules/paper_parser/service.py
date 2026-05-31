import json
from typing import Optional
from pathlib import Path

from app.modules.paper_parser.base_parser import BaseParser
from app.modules.paper_parser.pdf_parser import PDFParser
from app.schemas.paper import PaperParseResult


class PaperParserService:
    def __init__(self):
        self._parsers: dict[str, type[BaseParser]] = {}
        self._register_parsers()

    def _register_parsers(self):
        self._parsers[".pdf"] = PDFParser

    def get_parser(self, file_extension: str) -> Optional[type[BaseParser]]:
        file_extension = file_extension.lower()
        return self._parsers.get(file_extension)

    def parse(self, file_path: str) -> PaperParseResult:
        file_extension = Path(file_path).suffix.lower()
        parser_class = self.get_parser(file_extension)
        if not parser_class:
            raise ValueError(f"Unsupported file format: {file_extension}")

        parser = parser_class()
        return parser.parse(file_path)

    def parse_file(self, file_path: str, output_json: Optional[str] = None) -> PaperParseResult:
        result = self.parse(file_path)

        if output_json:
            output_path = Path(output_json)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(result.model_dump(mode="python"), f, ensure_ascii=False, indent=2)

        return result

    def get_supported_formats(self) -> list[str]:
        return sorted(self._parsers.keys())

    def is_supported(self, file_path: str) -> bool:
        file_extension = Path(file_path).suffix.lower()
        return file_extension in self._parsers


paper_parser_service = PaperParserService()

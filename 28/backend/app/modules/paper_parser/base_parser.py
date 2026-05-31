from abc import ABC, abstractmethod
from typing import Optional

from app.schemas.paper import PaperParseResult


class BaseParser(ABC):
    @abstractmethod
    def parse(self, file_path: str) -> PaperParseResult:
        pass

    @abstractmethod
    def extract_title(self, text: str) -> Optional[str]:
        pass

    @abstractmethod
    def extract_authors(self, text: str) -> list[str]:
        pass

    @abstractmethod
    def extract_abstract(self, text: str) -> Optional[str]:
        pass

    @abstractmethod
    def extract_keywords(self, text: str) -> list[str]:
        pass

    @abstractmethod
    def extract_chapters(self, text: str, pages: Optional[list[str]] = None) -> list:
        pass

    @abstractmethod
    def extract_references(self, text: str) -> list:
        pass

    def _clean_text(self, text: str) -> str:
        if not text:
            return ""
        lines = [line.strip() for line in text.split("\n")]
        lines = [line for line in lines if line]
        return "\n".join(lines)

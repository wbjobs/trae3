import json
from typing import Optional, Any
from sqlalchemy.orm import Session

from app.models import Paper, PaperStatus
from app.schemas import PaperCreate, PaperUpdate, PaperParseResult
from app.services.base import BaseService
from app.modules.paper_parser import paper_parser_service


class PaperService(BaseService[Paper, PaperCreate, PaperUpdate]):
    def __init__(self):
        super().__init__(Paper)

    def create(self, db: Session, *, obj_in: PaperCreate) -> Paper:
        obj_in_data = obj_in.model_dump()
        db_obj = Paper(**obj_in_data)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update_status(self, db: Session, *, paper_id: int, status: PaperStatus) -> Optional[Paper]:
        paper = self.get(db, paper_id)
        if not paper:
            return None
        paper.status = status
        db.add(paper)
        db.commit()
        db.refresh(paper)
        return paper

    def update_parse_result(self, db: Session, *, paper_id: int, parse_result: PaperParseResult) -> Optional[Paper]:
        paper = self.get(db, paper_id)
        if not paper:
            return None

        authors_str = ", ".join(parse_result.authors) if parse_result.authors else None
        keywords_str = ", ".join(parse_result.keywords) if parse_result.keywords else None

        paper.title = parse_result.title or paper.title
        paper.authors = authors_str or paper.authors
        paper.abstract = parse_result.abstract or paper.abstract
        paper.keywords = keywords_str or paper.keywords
        paper.total_pages = parse_result.total_pages
        paper.parsed_content = parse_result.model_dump_json(ensure_ascii=False)
        paper.status = PaperStatus.COMPLETED

        db.add(paper)
        db.commit()
        db.refresh(paper)
        return paper

    def parse_paper(self, db: Session, *, paper_id: int) -> Optional[Paper]:
        paper = self.get(db, paper_id)
        if not paper:
            return None

        if not paper_parser_service.is_supported(paper.file_path):
            paper.status = PaperStatus.FAILED
            db.add(paper)
            db.commit()
            db.refresh(paper)
            return paper

        try:
            self.update_status(db, paper_id=paper_id, status=PaperStatus.PARSING)
            parse_result = paper_parser_service.parse(paper.file_path)
            return self.update_parse_result(db, paper_id=paper_id, parse_result=parse_result)
        except Exception as e:
            paper = self.get(db, paper_id)
            if paper:
                paper.status = PaperStatus.FAILED
                db.add(paper)
                db.commit()
                db.refresh(paper)
            return paper

    def get_parse_result(self, db: Session, *, paper_id: int) -> Optional[PaperParseResult]:
        paper = self.get(db, paper_id)
        if not paper or not paper.parsed_content:
            return None
        try:
            parse_data = json.loads(paper.parsed_content)
            return PaperParseResult(**parse_data)
        except (json.JSONDecodeError, ValueError):
            return None

    def get_by_user(self, db: Session, *, user_id: int, skip: int = 0, limit: int = 100) -> list[Paper]:
        return db.query(Paper).filter(Paper.created_by == user_id).order_by(Paper.created_at.desc()).offset(skip).limit(limit).all()

    def get_by_status(self, db: Session, *, status: PaperStatus, skip: int = 0, limit: int = 100) -> list[Paper]:
        return db.query(Paper).filter(Paper.status == status).order_by(Paper.created_at.desc()).offset(skip).limit(limit).all()

    def search(self, db: Session, *, keyword: str, skip: int = 0, limit: int = 100) -> list[Paper]:
        pattern = f"%{keyword}%"
        return (
            db.query(Paper)
            .filter(
                (Paper.title.ilike(pattern))
                | (Paper.authors.ilike(pattern))
                | (Paper.abstract.ilike(pattern))
                | (Paper.keywords.ilike(pattern))
            )
            .order_by(Paper.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )


paper_service = PaperService()

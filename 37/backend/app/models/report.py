from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    report_name = Column(String(200), nullable=False)
    report_type = Column(String(50), nullable=False)
    device_code = Column(String(50))
    start_time = Column(DateTime(timezone=True))
    end_time = Column(DateTime(timezone=True))
    file_path = Column(String(500))
    file_format = Column(String(20), default="xlsx")
    file_size = Column(Integer)
    parameters = Column(JSON)
    created_by = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

from sqlalchemy import Column, Integer, String, Text, LargeBinary, Enum, ForeignKey
from sqlalchemy.orm import relationship
import enum

from app.models.base import BaseModel


class ChartStatus(str, enum.Enum):
    PENDING = "pending"
    EXTRACTING = "extracting"
    SUCCESS = "success"
    FAILED = "failed"


class ChartType(str, enum.Enum):
    LINE = "line"
    BAR = "bar"
    PIE = "pie"
    SCATTER = "scatter"
    TABLE = "table"
    HEATMAP = "heatmap"
    FLOWCHART = "flowchart"
    AREA = "area"
    OTHER = "other"
    UNKNOWN = "unknown"


class Chart(BaseModel):
    __tablename__ = "charts"

    paper_id = Column(Integer, nullable=False, index=True)
    figure_id = Column(String(100), index=True)
    caption = Column(Text)
    page_number = Column(Integer, nullable=False)
    image_path = Column(String(500))
    image_data = Column(LargeBinary)
    chart_type = Column(Enum(ChartType), default=ChartType.UNKNOWN, nullable=False)
    extracted_data = Column(Text)
    status = Column(Enum(ChartStatus), default=ChartStatus.PENDING, nullable=False)

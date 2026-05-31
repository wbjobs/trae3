from typing import Optional, Dict, Any
from pydantic import Field
from datetime import datetime

from app.schemas.base import BaseSchema, TimestampMixin
from app.models.chart import ChartType, ChartStatus


class ChartBase(BaseSchema):
    paper_id: int = Field(..., description="论文ID")
    figure_id: Optional[str] = Field(None, description="图表编号", max_length=100)
    caption: Optional[str] = Field(None, description="图表标题/说明")
    page_number: int = Field(..., description="页码")
    image_path: Optional[str] = Field(None, description="图片路径", max_length=500)
    chart_type: ChartType = Field(default=ChartType.UNKNOWN, description="图表类型")
    extracted_data: Optional[Dict[str, Any]] = Field(None, description="提取的数据")
    status: ChartStatus = Field(default=ChartStatus.PENDING, description="提取状态")


class ChartCreate(ChartBase):
    image_data: Optional[bytes] = Field(None, description="图片二进制数据")


class ChartUpdate(BaseSchema):
    figure_id: Optional[str] = Field(None, description="图表编号", max_length=100)
    caption: Optional[str] = Field(None, description="图表标题/说明")
    page_number: Optional[int] = Field(None, description="页码")
    image_path: Optional[str] = Field(None, description="图片路径", max_length=500)
    image_data: Optional[bytes] = Field(None, description="图片二进制数据")
    chart_type: Optional[ChartType] = Field(None, description="图表类型")
    extracted_data: Optional[Dict[str, Any]] = Field(None, description="提取的数据")
    status: Optional[ChartStatus] = Field(None, description="提取状态")
    is_active: Optional[bool] = Field(None, description="是否激活")


class ChartExtractRequest(BaseSchema):
    paper_id: int = Field(..., description="论文ID")
    pdf_path: str = Field(..., description="PDF文件路径")
    start_page: Optional[int] = Field(None, description="起始页码")
    end_page: Optional[int] = Field(None, description="结束页码")
    dpi: int = Field(default=300, description="渲染DPI")


class ChartExtractResult(BaseSchema):
    figure_id: Optional[str] = Field(None, description="图表编号")
    caption: Optional[str] = Field(None, description="图表标题/说明")
    page_number: int = Field(..., description="页码")
    chart_type: ChartType = Field(..., description="图表类型")
    bounding_box: tuple = Field(..., description="图表边界框 (x0, y0, x1, y1)")
    confidence: float = Field(..., description="置信度")
    image_path: Optional[str] = Field(None, description="图片路径")
    extracted_data: Optional[Dict[str, Any]] = Field(None, description="提取的数据")


class ChartInfo(ChartBase, TimestampMixin):
    id: int


class ChartResponse(ChartInfo):
    chart_url: Optional[str] = Field(None, description="图表API URL")
    image_url: Optional[str] = Field(None, description="图表静态图片URL")


class ChartExtractTaskResponse(BaseSchema):
    task_id: str = Field(..., description="任务ID")
    paper_id: int = Field(..., description="论文ID")
    status: str = Field(..., description="任务状态")
    total_pages: int = Field(..., description="总页数")
    processed_pages: int = Field(default=0, description="已处理页数")
    charts_found: int = Field(default=0, description="发现的图表数量")
    created_at: datetime = Field(..., description="创建时间")

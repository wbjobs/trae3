from typing import List, Optional, Dict, Any, Union
from enum import Enum
from pydantic import Field, ConfigDict

from app.schemas.base import BaseSchema


class ChartType(str, Enum):
    LINE = "line"
    BAR = "bar"
    PIE = "pie"
    SCATTER = "scatter"
    TABLE = "table"
    HEATMAP = "heatmap"
    UNKNOWN = "unknown"


class ChartDataPoint(BaseSchema):
    model_config = ConfigDict(from_attributes=True)

    x: Optional[Union[float, str]] = Field(None, description="X轴数值或类别")
    y: Optional[float] = Field(None, description="Y轴数值")
    label: Optional[str] = Field(None, description="数据点标签")
    value: Optional[float] = Field(None, description="数值（用于饼图百分比）")
    color: Optional[str] = Field(None, description="数据点颜色（HEX格式）")
    pixel_x: Optional[int] = Field(None, description="像素坐标X")
    pixel_y: Optional[int] = Field(None, description="像素坐标Y")
    confidence: float = Field(1.0, description="识别置信度")


class ChartTable(BaseSchema):
    model_config = ConfigDict(from_attributes=True)

    headers: List[str] = Field(default_factory=list, description="表格表头")
    rows: List[List[Any]] = Field(default_factory=list, description="表格数据行")
    row_count: int = Field(0, description="行数")
    col_count: int = Field(0, description="列数")


class ChartAxis(BaseSchema):
    model_config = ConfigDict(from_attributes=True)

    axis_type: str = Field(..., description="坐标轴类型 (x/y)")
    label: Optional[str] = Field(None, description="坐标轴标签")
    min_value: Optional[float] = Field(None, description="最小值")
    max_value: Optional[float] = Field(None, description="最大值")
    tick_values: List[float] = Field(default_factory=list, description="刻度值")
    tick_labels: List[str] = Field(default_factory=list, description="刻度标签")
    pixel_position: Optional[int] = Field(None, description="轴的像素位置")


class ChartLegendItem(BaseSchema):
    model_config = ConfigDict(from_attributes=True)

    label: str = Field(..., description="图例标签")
    color: Optional[str] = Field(None, description="图例颜色")
    series_index: int = Field(0, description="系列索引")


class ChartVisionRequest(BaseSchema):
    model_config = ConfigDict(from_attributes=True)

    image_path: Optional[str] = Field(None, description="图像文件路径")
    image_url: Optional[str] = Field(None, description="图像URL")
    chart_type: Optional[ChartType] = Field(None, description="指定图表类型，自动识别时可为空")
    expected_columns: Optional[List[str]] = Field(None, description="期望的列名（用于表格识别）")
    language: str = Field("eng+chi_sim", description="OCR语言")
    return_image: bool = Field(False, description="是否返回标注后的图像")


class ChartVisionResponse(BaseSchema):
    model_config = ConfigDict(from_attributes=True)

    chart_type: ChartType = Field(..., description="识别的图表类型")
    title: Optional[str] = Field(None, description="图表标题")
    description: Optional[str] = Field(None, description="图表描述")
    axes: List[ChartAxis] = Field(default_factory=list, description="坐标轴信息")
    legends: List[ChartLegendItem] = Field(default_factory=list, description="图例信息")
    data_points: List[ChartDataPoint] = Field(default_factory=list, description="数据点列表")
    series: Dict[str, List[ChartDataPoint]] = Field(default_factory=dict, description="按系列分组的数据")
    table: Optional[ChartTable] = Field(None, description="表格数据（仅表格类型）")
    raw_text: Optional[str] = Field(None, description="OCR识别的原始文本")
    confidence: float = Field(0.0, description="整体识别置信度")
    processing_time_ms: float = Field(0.0, description="处理耗时（毫秒）")
    annotated_image: Optional[str] = Field(None, description="标注后的图像（Base64编码）")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="额外元数据")

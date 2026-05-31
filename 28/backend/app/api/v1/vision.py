from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Form, Query

from app.schemas.base import ResponseBase
from app.schemas.chart_vision import ChartVisionResponse, ChartType
from app.services.vision_service import vision_service

router = APIRouter()


@router.post("/analyze", response_model=ResponseBase[ChartVisionResponse])
async def analyze_chart(
    file: UploadFile = File(..., description="图表图像文件"),
    chart_type: Optional[ChartType] = Form(None, description="指定图表类型，不指定则自动识别"),
    language: str = Form("eng+chi_sim", description="OCR语言，如 eng, chi_sim, eng+chi_sim"),
    return_image: bool = Form(False, description="是否返回标注后的图像")
):
    try:
        result = await vision_service.analyze_chart_image(
            file=file,
            chart_type=chart_type.value if chart_type else None,
            language=language,
            return_image=return_image
        )
        return ResponseBase(data=result, message="图表分析成功")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"图表分析失败: {str(e)}")


@router.post("/analyze/path", response_model=ResponseBase[ChartVisionResponse])
async def analyze_chart_by_path(
    image_path: str = Form(..., description="图像文件的本地路径"),
    chart_type: Optional[ChartType] = Form(None, description="指定图表类型"),
    language: str = Form("eng+chi_sim", description="OCR语言"),
    return_image: bool = Form(False, description="是否返回标注后的图像")
):
    try:
        result = await vision_service.analyze_chart_from_path(
            image_path=image_path,
            chart_type=chart_type.value if chart_type else None,
            language=language,
            return_image=return_image
        )
        return ResponseBase(data=result, message="图表分析成功")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"图表分析失败: {str(e)}")


@router.post("/analyze/url", response_model=ResponseBase[ChartVisionResponse])
async def analyze_chart_by_url(
    image_url: str = Form(..., description="图像的URL地址"),
    chart_type: Optional[ChartType] = Form(None, description="指定图表类型"),
    language: str = Form("eng+chi_sim", description="OCR语言"),
    return_image: bool = Form(False, description="是否返回标注后的图像")
):
    try:
        result = await vision_service.analyze_chart_from_url(
            image_url=image_url,
            chart_type=chart_type.value if chart_type else None,
            language=language,
            return_image=return_image
        )
        return ResponseBase(data=result, message="图表分析成功")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"图表分析失败: {str(e)}")


@router.post("/ocr", response_model=ResponseBase[dict])
async def extract_text(
    file: UploadFile = File(..., description="图像文件"),
    language: str = Form("eng+chi_sim", description="OCR语言")
):
    try:
        result = await vision_service.extract_text(file=file, language=language)
        return ResponseBase(data=result, message="文本提取成功")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文本提取失败: {str(e)}")


@router.post("/detect-type", response_model=ResponseBase[dict])
async def detect_chart_type(
    file: UploadFile = File(..., description="图表图像文件")
):
    try:
        result = await vision_service.detect_chart_type(file=file)
        return ResponseBase(data=result, message="图表类型检测成功")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"图表类型检测失败: {str(e)}")


@router.get("/chart-types", response_model=ResponseBase[list])
async def get_supported_chart_types():
    types = [
        {"type": ChartType.LINE.value, "name": "折线图", "description": "提取曲线数据点序列"},
        {"type": ChartType.BAR.value, "name": "柱状图", "description": "提取每个柱子的类别和数值"},
        {"type": ChartType.PIE.value, "name": "饼图", "description": "提取每个扇区的标签和百分比"},
        {"type": ChartType.TABLE.value, "name": "表格", "description": "提取表格结构和单元格内容"},
    ]
    return ResponseBase(data=types, message="获取支持的图表类型成功")

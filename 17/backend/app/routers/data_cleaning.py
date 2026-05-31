from fastapi import APIRouter, HTTPException
from typing import List

from ..schemas import ApiResponse, DataCleaningParams, CleaningResult
from ..services.data_cleaner import data_cleaner_service

router = APIRouter(prefix="/cleaning", tags=["数据清洗"])


@router.post("/clean", response_model=ApiResponse)
async def clean_time_series_data(params: DataCleaningParams):
    try:
        result = await data_cleaner_service.clean_time_series_data(params)
        return ApiResponse(data=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate", response_model=ApiResponse)
def validate_data_quality(points: List[dict]):
    try:
        from ..schemas import TimeSeriesPoint
        ts_points = [TimeSeriesPoint(**p) for p in points]
        result = data_cleaner_service.validate_data_quality(ts_points)
        return ApiResponse(data=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

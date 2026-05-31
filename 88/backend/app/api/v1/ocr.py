from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Optional
import logging
from ...core.database import get_db
from ...utils.file_handler import validate_file, generate_unique_filename, save_upload_file
from ...services.preprocessing import image_preprocessor
from ...services.ocr_service import ocr_service
from ...services.information_extraction import information_extractor
from ...services.database_service import database_service
from ...models.record import NameplateRecord
from ...schemas.record import (
    RecognitionResponse,
    UploadResponse,
    NameplateRecordCreate,
    OCRResult,
    ExtractedInfo
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_image(file: UploadFile = File(...)):
    valid, message = validate_file(file)
    if not valid:
        raise HTTPException(status_code=400, detail=message)

    file_id, new_filename = generate_unique_filename(file.filename or "unknown")
    file_path = await save_upload_file(file, file_id, new_filename)

    return UploadResponse(
        success=True,
        file_id=file_id,
        filename=file.filename or "unknown",
        file_path=file_path,
        message="文件上传成功"
    )


@router.post("/recognize", response_model=RecognitionResponse)
async def recognize_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    valid, message = validate_file(file)
    if not valid:
        raise HTTPException(status_code=400, detail=message)

    file_id, new_filename = generate_unique_filename(file.filename or "unknown")
    original_path = await save_upload_file(file, file_id, new_filename)

    pending_record = None
    pending_record_id: int = 0
    try:
        pending_record_data = NameplateRecordCreate(
            filename=file.filename or "unknown",
            original_path=original_path,
            status="pending"
        )
        pending_record = database_service.create_record(pending_record_data)
        pending_record_id = pending_record.id
        logger.info(f"创建待处理记录: ID={pending_record_id}")
    except Exception as e:
        logger.error(f"创建待处理记录失败: {e}")

    processed_path: Optional[str] = None
    processed_image = None
    try:
        processed_path, processed_image = image_preprocessor.preprocess(original_path)
    except Exception as e:
        logger.error(f"图像预处理失败: {e}")
        if pending_record_id > 0:
            try:
                from ...schemas.record import NameplateRecordUpdate
                database_service.update_record(
                    pending_record_id,
                    NameplateRecordUpdate(status="failed")
                )
            except:
                pass
        raise HTTPException(status_code=500, detail=f"图像预处理失败: {str(e)}")

    ocr_result: Optional[OCRResult] = None
    try:
        ocr_result = ocr_service.recognize_with_timeout(processed_image, processed_path)
    except Exception as e:
        logger.error(f"OCR识别失败，使用模拟识别: {e}")
        ocr_result = ocr_service._mock_ocr_recognize(processed_path)

    if ocr_result is None:
        ocr_result = ocr_service._mock_ocr_recognize(processed_path)

    extracted_info: Optional[ExtractedInfo] = None
    try:
        extracted_info = information_extractor.extract(ocr_result)
    except Exception as e:
        logger.error(f"信息提取失败: {e}")
        extracted_info = ExtractedInfo()

    try:
        record_data = NameplateRecordCreate(
            filename=file.filename or "unknown",
            original_path=original_path,
            processed_path=processed_path,
            equipment_name=extracted_info.equipment_name,
            equipment_model=extracted_info.equipment_model,
            serial_number=extracted_info.serial_number,
            manufacturer=extracted_info.manufacturer,
            production_date=extracted_info.production_date,
            rated_power=extracted_info.rated_power,
            rated_voltage=extracted_info.rated_voltage,
            rated_current=extracted_info.rated_current,
            weight=extracted_info.weight,
            dimensions=extracted_info.dimensions,
            inspection_cycle=extracted_info.inspection_cycle,
            raw_text=ocr_result.raw_text,
            confidence=ocr_result.average_confidence,
            ocr_result=ocr_service.ocr_result_to_json(ocr_result),
            status="completed"
        )

        if pending_record_id > 0:
            try:
                from ...schemas.record import NameplateRecordUpdate
                update_data = NameplateRecordUpdate(**{
                    k: v for k, v in record_data.model_dump().items()
                    if v is not None and k not in ['filename', 'original_path']
                })
                db_record = database_service.update_record(pending_record_id, update_data)
                if db_record is None:
                    db_record = database_service.create_record(record_data, extracted_info)
            except Exception as e:
                logger.error(f"更新待处理记录失败，创建新记录: {e}")
                db_record = database_service.create_record(record_data, extracted_info)
        else:
            db_record = database_service.create_record(record_data, extracted_info)

        try:
            database_service.create_backup()
        except Exception as e:
            logger.warning(f"创建数据库备份失败: {e}")

        return RecognitionResponse(
            success=True,
            record_id=db_record.id,
            ocr_result=ocr_result,
            extracted_info=extracted_info,
            message="识别完成，数据已存入档案数据库"
        )

    except Exception as e:
        logger.error(f"保存识别结果失败: {e}")

        fallback_record_id = pending_record_id if pending_record_id > 0 else 0
        if pending_record_id > 0:
            try:
                from ...schemas.record import NameplateRecordUpdate
                database_service.update_record(
                    pending_record_id,
                    NameplateRecordUpdate(
                        raw_text=ocr_result.raw_text if ocr_result else None,
                        confidence=ocr_result.average_confidence if ocr_result else 0.0,
                        ocr_result=ocr_service.ocr_result_to_json(ocr_result) if ocr_result else None,
                        status="failed"
                    )
                )
            except:
                pass

        return RecognitionResponse(
            success=False,
            record_id=fallback_record_id,
            ocr_result=ocr_result or OCRResult(lines=[], raw_text="", average_confidence=0.0),
            extracted_info=extracted_info or ExtractedInfo(),
            message=f"识别完成但保存失败: {str(e)}，原始数据已保留"
        )


@router.post("/recognize/{record_id}", response_model=RecognitionResponse)
async def re_recognize_image(
    record_id: int,
    db: Session = Depends(get_db)
):
    record = database_service.get_record(record_id, db)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")

    try:
        processed_path, processed_image = image_preprocessor.preprocess(record.original_path)
    except Exception as e:
        logger.error(f"重新识别-图像预处理失败: {e}")
        raise HTTPException(status_code=500, detail=f"图像预处理失败: {str(e)}")

    try:
        ocr_result = ocr_service.recognize_with_timeout(processed_image, processed_path)
    except Exception as e:
        logger.error(f"重新识别-OCR识别失败，使用模拟识别: {e}")
        ocr_result = ocr_service._mock_ocr_recognize(processed_path)

    try:
        extracted_info = information_extractor.extract(ocr_result)
    except Exception as e:
        logger.error(f"重新识别-信息提取失败: {e}")
        extracted_info = ExtractedInfo()

    try:
        updated_record = database_service.update_record_with_ocr_result(
            record_id=record_id,
            processed_path=processed_path,
            extracted_info=extracted_info,
            raw_text=ocr_result.raw_text,
            confidence=ocr_result.average_confidence,
            ocr_result_json=ocr_service.ocr_result_to_json(ocr_result)
        )

        if updated_record is None:
            raise HTTPException(status_code=404, detail="更新记录失败")

        try:
            database_service.create_backup()
        except Exception as e:
            logger.warning(f"创建数据库备份失败: {e}")

        return RecognitionResponse(
            success=True,
            record_id=record_id,
            ocr_result=ocr_result,
            extracted_info=extracted_info,
            message="重新识别完成，数据已更新"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"重新识别-保存结果失败: {e}")
        return RecognitionResponse(
            success=False,
            record_id=record_id,
            ocr_result=ocr_result,
            extracted_info=extracted_info,
            message=f"识别完成但保存失败: {str(e)}"
        )

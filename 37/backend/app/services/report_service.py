import os
import pandas as pd
from datetime import datetime
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.vibration_data import VibrationData
from app.models.anomaly import AnomalyRecord
from app.models.schemas import ReportCreate
from app.services.crud_service import CRUDService
from app.services.timeseries_calculator import TimeSeriesCalculator


class ReportService:
    def __init__(self, db: Session):
        self.db = db
        self.crud_service = CRUDService(db)
        self.report_dir = "reports"
        os.makedirs(self.report_dir, exist_ok=True)

    def generate_vibration_report_excel(
        self,
        report_data: ReportCreate,
        vibration_data: List[VibrationData]
    ) -> str:
        device_code = report_data.device_code or "ALL"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"vibration_report_{device_code}_{timestamp}.xlsx"
        file_path = os.path.join(self.report_dir, filename)

        df = pd.DataFrame([{
            "timestamp": d.timestamp,
            "x_axis": d.x_axis,
            "y_axis": d.y_axis,
            "z_axis": d.z_axis,
            "temperature": d.temperature,
            "speed": d.speed
        } for d in vibration_data])

        analysis_result = TimeSeriesCalculator.analyze_vibration_data(
            vibration_data, include_fft=False
        )

        summary_data = {
            "指标": [
                "X轴RMS", "Y轴RMS", "Z轴RMS",
                "X轴峰值", "Y轴峰值", "Z轴峰值",
                "X轴峭度", "Y轴峭度", "Z轴峭度",
                "X轴偏度", "Y轴偏度", "Z轴偏度",
                "平均温度", "最高温度", "平均转速"
            ],
            "数值": [
                analysis_result.get("rms_x", 0),
                analysis_result.get("rms_y", 0),
                analysis_result.get("rms_z", 0),
                analysis_result.get("peak_x", 0),
                analysis_result.get("peak_y", 0),
                analysis_result.get("peak_z", 0),
                analysis_result.get("kurtosis_x", 0),
                analysis_result.get("kurtosis_y", 0),
                analysis_result.get("kurtosis_z", 0),
                analysis_result.get("skewness_x", 0),
                analysis_result.get("skewness_y", 0),
                analysis_result.get("skewness_z", 0),
                analysis_result.get("temperature_mean", 0),
                analysis_result.get("temperature_max", 0),
                analysis_result.get("speed_mean", 0)
            ]
        }
        df_summary = pd.DataFrame(summary_data)

        with pd.ExcelWriter(file_path, engine="xlsxwriter") as writer:
            df_summary.to_excel(writer, sheet_name="统计摘要", index=False)
            df.to_excel(writer, sheet_name="原始数据", index=False)

            workbook = writer.book
            worksheet = writer.sheets["统计摘要"]
            worksheet.set_column("A:B", 20)

        return file_path

    def generate_anomaly_report_excel(
        self,
        report_data: ReportCreate,
        anomaly_records: List[AnomalyRecord]
    ) -> str:
        device_code = report_data.device_code or "ALL"
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"anomaly_report_{device_code}_{timestamp}.xlsx"
        file_path = os.path.join(self.report_dir, filename)

        df = pd.DataFrame([{
            "时间": a.timestamp,
            "设备代码": a.device_code,
            "异常类型": a.anomaly_type,
            "严重程度": a.severity,
            "轴向": a.axis,
            "数值": a.value,
            "阈值": a.threshold,
            "描述": a.description,
            "状态": a.status
        } for a in anomaly_records])

        severity_counts = df["严重程度"].value_counts().to_dict()
        type_counts = df["异常类型"].value_counts().to_dict()

        summary_data = {
            "统计项": ["总异常数", "严重异常", "警告异常", "一般异常"] +
                     [f"{t}异常" for t in type_counts.keys()],
            "数量": [len(df),
                    severity_counts.get("critical", 0),
                    severity_counts.get("warning", 0),
                    severity_counts.get("info", 0)] +
                    list(type_counts.values())
        }
        df_summary = pd.DataFrame(summary_data)

        with pd.ExcelWriter(file_path, engine="xlsxwriter") as writer:
            df_summary.to_excel(writer, sheet_name="统计摘要", index=False)
            df.to_excel(writer, sheet_name="异常记录", index=False)

        return file_path

    def generate_report(
        self,
        report_data: ReportCreate
    ) -> str:
        if report_data.report_type == "vibration":
            vibration_data = self.crud_service.get_vibration_data(
                report_data.device_code,
                report_data.start_time,
                report_data.end_time,
                limit=50000
            )
            file_path = self.generate_vibration_report_excel(report_data, vibration_data)
        elif report_data.report_type == "anomaly":
            anomaly_records = self.crud_service.get_anomaly_records(
                report_data.device_code,
                report_data.start_time,
                report_data.end_time,
                limit=10000
            )
            file_path = self.generate_anomaly_report_excel(report_data, anomaly_records)
        else:
            raise ValueError(f"Unknown report type: {report_data.report_type}")

        file_size = os.path.getsize(file_path)
        self.crud_service.create_report(report_data, file_path, file_size)

        return file_path

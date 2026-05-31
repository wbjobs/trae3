import os
import io
import uuid
import time
import json
import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor, white, black
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Image,
        Table,
        TableStyle,
        PageBreak,
        HRFlowable,
    )
    from reportlab.pdfgen import canvas
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False
    logger.warning("reportlab not installed, PDF generation disabled")

REPORT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports")
os.makedirs(REPORT_DIR, exist_ok=True)

SEVERITY_COLORS_HEX = {
    "critical": "#EF476F",
    "high": "#FF6B35",
    "medium": "#FACC15",
    "low": "#06D6A0",
}

SEVERITY_NAMES = {
    "critical": "严重",
    "high": "较高",
    "medium": "中等",
    "low": "轻微",
}

TYPE_NAMES = {
    "CRACK": "裂纹",
    "RUST": "锈蚀",
    "DEFORM": "变形",
    "MISSING": "缺失",
    "LEAK": "渗漏",
    "WEAR": "磨损",
    "LOOSE": "松动",
    "ABNORMAL": "异响",
}

LOGO_COLOR = HexColor("#0F172A")
ACCENT_COLOR = HexColor("#06D6A0")


@dataclass
class ReportDefect:
    type: str
    type_name: str
    severity: str
    confidence: float
    description: str
    bbox: Dict[str, int]
    image_path: Optional[str] = None


@dataclass
class ReportInspection:
    id: str
    filename: str
    created_at: str
    status: str
    annotated_image_path: Optional[str]
    defects: List[ReportDefect] = field(default_factory=list)


@dataclass
class ReportSummary:
    total_inspections: int = 0
    total_defects: int = 0
    severity_distribution: Dict[str, int] = field(default_factory=dict)
    type_distribution: Dict[str, int] = field(default_factory=dict)
    defect_rate: float = 0.0


def _get_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            "CustomTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            textColor=LOGO_COLOR,
            spaceAfter=20,
            alignment=1,
        )
    )
    styles.add(
        ParagraphStyle(
            "CustomHeading2",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=16,
            textColor=LOGO_COLOR,
            spaceBefore=15,
            spaceAfter=10,
            borderPadding=(0, 0, 5, 0),
        )
    )
    styles.add(
        ParagraphStyle(
            "CustomBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            textColor=HexColor("#334155"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            "CustomSmall",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            textColor=HexColor("#64748B"),
        )
    )
    styles.add(
        ParagraphStyle(
            "SeverityBadge",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=white,
            alignment=1,
        )
    )
    return styles


def _add_header_footer(canvas_obj: canvas.Canvas, doc):
    canvas_obj.saveState()
    canvas_obj.setFillColor(LOGO_COLOR)
    canvas_obj.rect(0, doc.pagesize[1] - 8 * mm, doc.pagesize[0], 8 * mm, fill=1, stroke=0)
    canvas_obj.setFillColor(white)
    canvas_obj.setFont("Helvetica-Bold", 10)
    canvas_obj.drawString(15 * mm, doc.pagesize[1] - 5.5 * mm, "巡检智能缺陷识别平台")
    canvas_obj.setFont("Helvetica", 8)
    canvas_obj.setFillColor(HexColor("#94A3B8"))
    canvas_obj.drawRightString(
        doc.pagesize[0] - 15 * mm,
        doc.pagesize[1] - 5.5 * mm,
        datetime.now().strftime("%Y-%m-%d %H:%M"),
    )
    canvas_obj.setFillColor(HexColor("#334155"))
    canvas_obj.setFont("Helvetica", 8)
    canvas_obj.drawString(15 * mm, 10 * mm, f"第 {doc.page} 页")
    canvas_obj.drawRightString(
        doc.pagesize[0] - 15 * mm,
        10 * mm,
        "Defect AI Platform | Confidential",
    )
    canvas_obj.restoreState()


def _draw_severity_badge(text: str, color_hex: str, width: int = 60) -> Table:
    color = HexColor(color_hex)
    data = [[Paragraph(text, style="SeverityBadge")]]
    t = Table(data, colWidths=[width])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), color),
                ("TEXTCOLOR", (0, 0), (-1, -1), white),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROUNDEDCORNERS", [4, 4, 4, 4]),
            ]
        )
    )
    return t


def generate_single_report(inspection: ReportInspection, output_dir: Optional[str] = None) -> str:
    if not HAS_REPORTLAB:
        raise RuntimeError("reportlab is required for PDF generation")

    output_dir = output_dir or REPORT_DIR
    filename = f"report_{inspection.id}_{int(time.time())}.pdf"
    filepath = os.path.join(output_dir, filename)

    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )
    styles = _get_styles()
    story = []

    story.append(Paragraph("巡检缺陷检测报告", styles["CustomTitle"]))
    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor("#334155")))
    story.append(Spacer(1, 3 * mm))

    info_data = [
        ["报告编号", inspection.id],
        ["文件名称", inspection.filename],
        ["检测时间", inspection.created_at],
        ["检测状态", "已完成" if inspection.status == "completed" else "处理中"],
        ["缺陷数量", str(len(inspection.defects))],
    ]
    info_table = Table(info_data, colWidths=[40 * mm, 120 * mm])
    info_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), HexColor("#F1F5F9")),
                ("TEXTCOLOR", (0, 0), (0, -1), HexColor("#64748B")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#CBD5E1")),
            ]
        )
    )
    story.append(info_table)
    story.append(Spacer(1, 8 * mm))

    if inspection.annotated_image_path and os.path.exists(inspection.annotated_image_path):
        story.append(Paragraph("检测结果图", styles["CustomHeading2"]))
        try:
            img = Image(
                inspection.annotated_image_path,
                width=170 * mm,
                height=110 * mm,
                kind="proportional",
            )
            story.append(img)
        except Exception as e:
            logger.warning(f"Failed to embed image: {e}")
            story.append(Paragraph("[图片加载失败]", styles["CustomSmall"]))
        story.append(Spacer(1, 5 * mm))

    if inspection.defects:
        story.append(Paragraph("缺陷详细列表", styles["CustomHeading2"]))

        header = [
            "#",
            "缺陷类型",
            "严重程度",
            "置信度",
            "位置",
            "描述",
        ]
        table_data = [header]
        for idx, defect in enumerate(inspection.defects, 1):
            badge = _draw_severity_badge(
                SEVERITY_NAMES.get(defect.severity, defect.severity),
                SEVERITY_COLORS_HEX.get(defect.severity, "#64748B"),
            )
            bbox_str = f"({defect.bbox.get('x', 0)}, {defect.bbox.get('y', 0)})"
            table_data.append([
                str(idx),
                TYPE_NAMES.get(defect.type, defect.type),
                badge,
                f"{defect.confidence * 100:.1f}%",
                bbox_str,
                Paragraph(defect.description, styles["CustomBody"]),
            ])

        defect_table = Table(
            table_data,
            colWidths=[10 * mm, 25 * mm, 25 * mm, 20 * mm, 25 * mm, 75 * mm],
            repeatRows=1,
        )
        defect_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), LOGO_COLOR),
                    ("TEXTCOLOR", (0, 0), (-1, 0), white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 10),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#CBD5E1")),
                ]
            )
        )
        story.append(defect_table)

    else:
        story.append(Paragraph("检测结果", styles["CustomHeading2"]))
        story.append(Paragraph("未检测到缺陷", styles["CustomBody"]))

    story.append(Spacer(1, 10 * mm))
    story.append(HRFlowable(width="100%", thickness=0.3, color=HexColor("#CBD5E1")))
    story.append(Spacer(1, 3 * mm))
    story.append(
        Paragraph(
            "本报告由 AI 系统自动生成，仅供参考。如有疑问，请联系专业人员复核。",
            styles["CustomSmall"],
        )
    )

    doc.build(story, onFirstPage=_add_header_footer, onLaterPages=_add_header_footer)
    logger.info(f"Single report generated: {filepath}")
    return filepath


def generate_batch_report(
    inspections: List[ReportInspection],
    summary: ReportSummary,
    output_dir: Optional[str] = None,
) -> str:
    if not HAS_REPORTLAB:
        raise RuntimeError("reportlab is required for PDF generation")

    output_dir = output_dir or REPORT_DIR
    batch_id = uuid.uuid4().hex[:8]
    filename = f"batch_report_{batch_id}_{int(time.time())}.pdf"
    filepath = os.path.join(output_dir, filename)

    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )
    styles = _get_styles()
    story = []

    story.append(Paragraph("批次巡检报告", styles["CustomTitle"]))
    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor("#334155")))
    story.append(Spacer(1, 5 * mm))

    story.append(Paragraph("统计摘要", styles["CustomHeading2"]))

    summary_data = [
        ["巡检总数", str(summary.total_inspections)],
        ["缺陷总数", str(summary.total_defects)],
        ["平均缺陷率", f"{summary.defect_rate * 100:.1f}%"],
    ]
    summary_table = Table(summary_data, colWidths=[60 * mm, 100 * mm])
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), HexColor("#F1F5F9")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 14),
                ("TEXTCOLOR", (0, 0), (0, -1), HexColor("#64748B")),
                ("TEXTCOLOR", (1, 0), (1, -1), LOGO_COLOR),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#CBD5E1")),
            ]
        )
    )
    story.append(summary_table)
    story.append(Spacer(1, 8 * mm))

    story.append(Paragraph("严重程度分布", styles["CustomHeading2"]))
    sev_data = [["严重程度", "数量"]]
    for sev in ["critical", "high", "medium", "low"]:
        count = summary.severity_distribution.get(sev, 0)
        badge = _draw_severity_badge(
            SEVERITY_NAMES.get(sev, sev),
            SEVERITY_COLORS_HEX.get(sev, "#64748B"),
        )
        sev_data.append([badge, str(count)])
    sev_table = Table(sev_data, colWidths=[60 * mm, 60 * mm])
    sev_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), LOGO_COLOR),
                ("TEXTCOLOR", (0, 0), (-1, 0), white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 11),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#CBD5E1")),
            ]
        )
    )
    story.append(sev_table)
    story.append(Spacer(1, 8 * mm))

    story.append(Paragraph("缺陷类型分布", styles["CustomHeading2"]))
    type_data = [["缺陷类型", "数量"]]
    for typ, name in TYPE_NAMES.items():
        count = summary.type_distribution.get(typ, 0)
        type_data.append([name, str(count)])
    type_table = Table(type_data, colWidths=[60 * mm, 60 * mm])
    type_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), LOGO_COLOR),
                ("TEXTCOLOR", (0, 0), (-1, 0), white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 11),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#CBD5E1")),
            ]
        )
    )
    story.append(type_table)
    story.append(PageBreak())

    for insp_idx, inspection in enumerate(inspections, 1):
        story.append(Paragraph(f"巡检 {insp_idx}: {inspection.filename}", styles["CustomHeading2"]))
        story.append(HRFlowable(width="100%", thickness=0.3, color=HexColor("#CBD5E1")))
        story.append(Spacer(1, 3 * mm))

        mini_info = [
            ["编号", inspection.id],
            ["时间", inspection.created_at],
            ["缺陷数", str(len(inspection.defects))],
        ]
        mini_table = Table(mini_info, colWidths=[30 * mm, 130 * mm])
        mini_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), HexColor("#F1F5F9")),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("TEXTCOLOR", (0, 0), (0, -1), HexColor("#64748B")),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#CBD5E1")),
                ]
            )
        )
        story.append(mini_table)
        story.append(Spacer(1, 5 * mm))

        if inspection.annotated_image_path and os.path.exists(inspection.annotated_image_path):
            try:
                img = Image(
                    inspection.annotated_image_path,
                    width=160 * mm,
                    height=100 * mm,
                    kind="proportional",
                )
                story.append(img)
                story.append(Spacer(1, 5 * mm))
            except Exception as e:
                logger.warning(f"Failed to embed image for {inspection.id}: {e}")

        if inspection.defects:
            defect_rows = [["#", "类型", "严重程度", "置信度", "描述"]]
            for d_idx, defect in enumerate(inspection.defects, 1):
                badge = _draw_severity_badge(
                    SEVERITY_NAMES.get(defect.severity, defect.severity),
                    SEVERITY_COLORS_HEX.get(defect.severity, "#64748B"),
                )
                defect_rows.append([
                    str(d_idx),
                    TYPE_NAMES.get(defect.type, defect.type),
                    badge,
                    f"{defect.confidence * 100:.1f}%",
                    Paragraph(defect.description, styles["CustomSmall"]),
                ])
            d_table = Table(
                defect_rows,
                colWidths=[10 * mm, 25 * mm, 25 * mm, 20 * mm, 90 * mm],
                repeatRows=1,
            )
            d_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), LOGO_COLOR),
                        ("TEXTCOLOR", (0, 0), (-1, 0), white),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, 0), 9),
                        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 4),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#CBD5E1")),
                    ]
                )
            )
            story.append(d_table)

        if insp_idx < len(inspections):
            story.append(PageBreak())

    story.append(Spacer(1, 10 * mm))
    story.append(HRFlowable(width="100%", thickness=0.3, color=HexColor("#CBD5E1")))
    story.append(Spacer(1, 3 * mm))
    story.append(
        Paragraph(
            f"本报告包含 {len(inspections)} 个巡检记录，由 AI 系统自动生成，仅供参考。",
            styles["CustomSmall"],
        )
    )

    doc.build(story, onFirstPage=_add_header_footer, onLaterPages=_add_header_footer)
    logger.info(f"Batch report generated: {filepath}, {len(inspections)} inspections")
    return filepath

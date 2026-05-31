import re
from typing import Dict, Optional, Tuple, List, Any
from dataclasses import dataclass
from ..schemas.record import OCRResult, OCRLine, ExtractedInfo


@dataclass
class FieldCandidate:
    field: str
    value: str
    confidence: float
    source_line: int
    position_y: float


class InformationExtractor:
    def __init__(self):
        self.field_configs = {
            "equipment_name": {
                "labels": ["设备名称", "产品名称", "名称", "产品型号", "Equipment", "Name"],
                "patterns": [
                    r"(?:设备名称|产品名称|名称|Equipment\s*Name)[:：\s]+(.+?)(?=$|\n)",
                    r"^(.+?电动机)(?=$|\n)",
                    r"^(.+?泵)(?=$|\n)",
                    r"^(.+?压缩机)(?=$|\n)",
                    r"^(.+?风机)(?=$|\n)",
                    r"^(.+?变压器)(?=$|\n)",
                    r"^(.+?开关柜)(?=$|\n)",
                    r"^(.+?电机)(?=$|\n)",
                    r"^(.+?控制柜)(?=$|\n)"
                ],
                "keywords": ["电动机", "泵", "压缩机", "风机", "变压器", "开关柜", "电机", "控制柜"],
                "required": True,
                "priority": 1
            },
            "equipment_model": {
                "labels": ["型号规格", "型号", "规格", "Model", "Type"],
                "patterns": [
                    r"(?:型号规格|型号|规格|Model|Type)[:：\s]+(.+?)(?=$|\n)",
                    r"型号[:：]?([A-Za-z][A-Za-z0-9\-]{2,})",
                    r"规\s*格[:：]?(.+?)(?=$|\n)",
                    r"([A-Z]{1,3}\d{1,4}[-/]?[A-Za-z0-9\-]{2,})"
                ],
                "keywords": [],
                "required": True,
                "priority": 1
            },
            "serial_number": {
                "labels": ["出厂编号", "编号", "Serial No", "SN", "No", "编号"],
                "patterns": [
                    r"(?:出厂编号|编号|Serial\s*No\.?|SN|No\.?)[:：\s]+(.+?)(?=$|\n)",
                    r"编号[:：]?([A-Za-z0-9]{6,})",
                    r"(\d{8,})"
                ],
                "keywords": [],
                "required": True,
                "priority": 1
            },
            "manufacturer": {
                "labels": ["制造厂家", "生产厂家", "制造商", "厂家", "Made by", "Manufacturer"],
                "patterns": [
                    r"(?:制造厂家|生产厂家|制造商|厂家|Made\s*by|Manufacturer)[:：\s]+(.+?)(?=$|\n)",
                    r"(.+?有限公司)",
                    r"(.+?股份公司)",
                    r"(.+?集团)",
                    r"(.+?制造厂)",
                    r"(.+?工厂)"
                ],
                "keywords": ["公司", "制造厂", "有限公司", "股份公司", "集团", "厂", "工厂"],
                "required": True,
                "priority": 1
            },
            "production_date": {
                "labels": ["生产日期", "出厂日期", "制造日期", "Date"],
                "patterns": [
                    r"(?:生产日期|出厂日期|制造日期|Date)[:：\s]+(.+?)(?=$|\n)",
                    r"(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)",
                    r"(\d{4}[-/]\d{1,2}[-/]\d{1,2})",
                    r"(20\d{2}\s*年\s*\d{1,2}\s*月)"
                ],
                "keywords": ["年", "月", "日"],
                "required": False,
                "priority": 2
            },
            "rated_power": {
                "labels": ["额定功率", "功率", "Power"],
                "patterns": [
                    r"(?:额定功率|功率|Power)[:：\s]+(.+?)(?=$|\n)",
                    r"(\d+\.?\d*\s*[kKmM]?[Ww])",
                    r"(\d+\.?\d*\s*[kKmM][Ww])"
                ],
                "keywords": ["kW", "KW", "W", "w", "功率"],
                "required": False,
                "priority": 2
            },
            "rated_voltage": {
                "labels": ["额定电压", "电压", "Voltage"],
                "patterns": [
                    r"(?:额定电压|电压|Voltage)[:：\s]+(.+?)(?=$|\n)",
                    r"(\d+\s*[Vv])",
                    r"(\d+[Vv])",
                    r"(\d{2,3}\s*[Vv](?:/\d{2,3}\s*[Vv])?)"
                ],
                "keywords": ["V", "v", "电压"],
                "required": False,
                "priority": 2
            },
            "rated_current": {
                "labels": ["额定电流", "电流", "Current"],
                "patterns": [
                    r"(?:额定电流|电流|Current)[:：\s]+(.+?)(?=$|\n)",
                    r"(\d+\.?\d*\s*[Aa])",
                    r"(\d+\.?\d*[Aa])"
                ],
                "keywords": ["A", "a", "电流"],
                "required": False,
                "priority": 2
            },
            "weight": {
                "labels": ["重量", "净重", "毛重", "Weight"],
                "patterns": [
                    r"(?:重量|净重|毛重|Weight)[:：\s]+(.+?)(?=$|\n)",
                    r"(\d+\.?\d*\s*[kKgG][gG]?)",
                    r"(\d+\.?\d*[kKgG])"
                ],
                "keywords": ["kg", "KG", "g", "G", "重量"],
                "required": False,
                "priority": 2
            },
            "dimensions": {
                "labels": ["外形尺寸", "尺寸", "长×宽×高", "Dimensions"],
                "patterns": [
                    r"(?:外形尺寸|尺寸|长×宽×高|Dimensions)[:：\s]+(.+?)(?=$|\n)",
                    r"(\d+\s*[×xX*]\s*\d+\s*[×xX*]\s*\d+\s*[mMcC][mM]?)",
                    r"(\d+\s*[×xX*]\s*\d+\s*[×xX*]\s*\d+)"
                ],
                "keywords": ["×", "x", "X", "*", "mm", "cm", "尺寸"],
                "required": False,
                "priority": 2
            },
            "inspection_cycle": {
                "labels": ["检验周期", "检定周期", "校验周期", "检测周期"],
                "patterns": [
                    r"(?:检验周期|检定周期|校验周期|检测周期)[:：\s]+(.+?)(?=$|\n)",
                    r"(\d+\s*个月)",
                    r"(\d+\s*天)",
                    r"(\d+\s*年)"
                ],
                "keywords": ["个月", "天", "年", "周期"],
                "required": False,
                "priority": 2
            }
        }

        self.conflict_resolution_rules = {
            "equipment_name": ["equipment_model"],
            "equipment_model": ["serial_number"],
            "serial_number": ["equipment_model"]
        }

        self.text_normalization_map = {
            'O': '0', 'o': '0',
            'I': '1', 'l': '1', '|': '1',
            'Z': '2', 'z': '2',
            'S': '5', 's': '5',
            'G': '6', 'g': '6',
            'B': '8', 'b': '8',
            'Q': '0', 'q': '0',
            '×': 'x', 'X': 'x',
            '：': ':', '；': ';',
            '，': ',', '。': '.',
            '（': '(', '）': ')',
            '【': '[', '】': ']',
            ' ': ' ', '　': ' '
        }

    def extract(self, ocr_result: OCRResult) -> ExtractedInfo:
        extracted = ExtractedInfo()

        normalized_lines = self._normalize_lines(ocr_result.lines)
        normalized_text = "\n".join([line.text for line in normalized_lines])

        candidates: List[FieldCandidate] = []

        for field_name, config in self.field_configs.items():
            field_candidates = self._extract_field_candidates(
                field_name, config, normalized_lines, normalized_text
            )
            candidates.extend(field_candidates)

        resolved_candidates = self._resolve_conflicts(candidates)

        for candidate in resolved_candidates:
            if candidate.confidence >= 0.5:
                current_value = getattr(extracted, candidate.field)
                if current_value is None or candidate.confidence > self._calculate_field_confidence(current_value):
                    setattr(extracted, candidate.field, candidate.value)

        extracted = self._apply_fallback_extraction(extracted, normalized_lines)
        extracted = self._standardize_fields(extracted)
        extracted = self._cross_validate_fields(extracted)

        return extracted

    def _normalize_lines(self, lines: List[OCRLine]) -> List[OCRLine]:
        normalized = []
        for line in lines:
            normalized_text = self._normalize_text(line.text)
            if normalized_text.strip():
                normalized.append(OCRLine(
                    text=normalized_text,
                    confidence=line.confidence,
                    position=line.position
                ))
        return normalized

    def _normalize_text(self, text: str) -> str:
        for wrong, correct in self.text_normalization_map.items():
            text = text.replace(wrong, correct)

        text = re.sub(r'\s+', ' ', text).strip()

        text = re.sub(r'([:：])\s*', r'\1', text)

        return text

    def _extract_field_candidates(
        self,
        field_name: str,
        config: Dict[str, Any],
        lines: List[OCRLine],
        raw_text: str
    ) -> List[FieldCandidate]:
        candidates = []

        for pattern_idx, pattern in enumerate(config["patterns"]):
            try:
                match = re.search(pattern, raw_text, re.IGNORECASE | re.MULTILINE)
                if match:
                    value = match.group(1).strip()
                    value = self._clean_extracted_value(field_name, value)

                    if value and len(value) > 0:
                        confidence = self._calculate_match_confidence(
                            field_name, pattern_idx, value, config
                        )

                        line_index = self._find_line_index(raw_text, match.start(), len(lines))
                        position_y = self._get_line_position_y(lines, line_index)

                        candidate = FieldCandidate(
                            field=field_name,
                            value=value,
                            confidence=confidence,
                            source_line=line_index,
                            position_y=position_y
                        )
                        candidates.append(candidate)
            except re.error as e:
                print(f"正则表达式错误 (字段: {field_name}, 模式: {pattern_idx}): {e}")

        for line_idx, line in enumerate(lines):
            for label in config["labels"]:
                if label in line.text:
                    parts = re.split(r'[:：]', line.text, maxsplit=1)
                    if len(parts) == 2 and parts[1].strip():
                        value = self._clean_extracted_value(field_name, parts[1].strip())
                        if value:
                            confidence = 0.7 + (line.confidence * 0.2)
                            position_y = self._get_line_position_y(lines, line_idx)

                            candidate = FieldCandidate(
                                field=field_name,
                                value=value,
                                confidence=confidence,
                                source_line=line_idx,
                                position_y=position_y
                            )
                            candidates.append(candidate)

        for keyword in config["keywords"]:
            for line_idx, line in enumerate(lines):
                if keyword in line.text:
                    has_label = any(label in line.text for label in config["labels"])
                    if not has_label:
                        value = line.text.strip()
                        value = self._clean_extracted_value(field_name, value)
                        if value:
                            confidence = 0.4 + (line.confidence * 0.3)
                            position_y = self._get_line_position_y(lines, line_idx)

                            candidate = FieldCandidate(
                                field=field_name,
                                value=value,
                                confidence=confidence,
                                source_line=line_idx,
                                position_y=position_y
                            )
                            candidates.append(candidate)

        return sorted(candidates, key=lambda x: x.confidence, reverse=True)

    def _clean_extracted_value(self, field_name: str, value: str) -> str:
        value = value.strip()

        value = re.sub(r'^[\s:：,.;，。；]+|[\s:：,.;，。；]+$', '', value)

        if field_name == "serial_number":
            value = re.sub(r'[^A-Za-z0-9\-]', '', value)

        if field_name == "production_date":
            value = value.replace('年', '-').replace('月', '-').replace('日', '')
            value = re.sub(r'[^0-9\-]', '', value)

        if field_name in ["rated_power", "rated_voltage", "rated_current", "weight"]:
            value = re.sub(r'\s+', '', value)

        if field_name == "dimensions":
            value = value.replace('×', 'x').replace('X', 'x').replace('*', 'x')

        return value.strip()

    def _calculate_match_confidence(
        self,
        field_name: str,
        pattern_idx: int,
        value: str,
        config: Dict[str, Any]
    ) -> float:
        base_confidence = 0.8

        if pattern_idx == 0:
            base_confidence += 0.1
        elif pattern_idx >= len(config["patterns"]) - 2:
            base_confidence -= 0.2

        if len(value) < 2:
            base_confidence -= 0.3
        elif len(value) > 50:
            base_confidence -= 0.1

        if any(keyword in value for keyword in config["keywords"]):
            base_confidence += 0.1

        if not value.strip():
            base_confidence = 0.0

        return max(0.0, min(1.0, base_confidence))

    def _calculate_field_confidence(self, value: str) -> float:
        if value is None:
            return 0.0

        confidence = 0.5

        if len(value) >= 2 and len(value) <= 50:
            confidence += 0.2

        if re.search(r'[A-Za-z0-9]', value):
            confidence += 0.1

        return min(1.0, confidence)

    def _find_line_index(self, raw_text: str, char_index: int, total_lines: int) -> int:
        lines = raw_text.split('\n')
        current_pos = 0
        for idx, line in enumerate(lines):
            line_end = current_pos + len(line) + 1
            if char_index < line_end:
                return idx
            current_pos = line_end
        return min(total_lines - 1, len(lines) - 1)

    def _get_line_position_y(self, lines: List[OCRLine], line_index: int) -> float:
        if line_index < 0 or line_index >= len(lines):
            return 0.0

        line = lines[line_index]
        if line.position and len(line.position) >= 2:
            return (line.position[0][1] + line.position[2][1]) / 2
        return float(line_index * 30)

    def _resolve_conflicts(self, candidates: List[FieldCandidate]) -> List[FieldCandidate]:
        if not candidates:
            return []

        field_candidates: Dict[str, List[FieldCandidate]] = {}
        for candidate in candidates:
            if candidate.field not in field_candidates:
                field_candidates[candidate.field] = []
            field_candidates[candidate.field].append(candidate)

        resolved = []
        used_positions = set()

        for field_name in sorted(
            self.field_configs.keys(),
            key=lambda x: self.field_configs[x]["priority"]
        ):
            if field_name in field_candidates and field_candidates[field_name]:
                for candidate in sorted(
                    field_candidates[field_name],
                    key=lambda x: x.confidence,
                    reverse=True
                ):
                    position_key = (round(candidate.position_y, -1), candidate.field)

                    conflict = False
                    if field_name in self.conflict_resolution_rules:
                        for conflicting_field in self.conflict_resolution_rules[field_name]:
                            conflicting_key = (round(candidate.position_y, -1), conflicting_field)
                            if conflicting_key in used_positions:
                                conflict = True
                                break

                    if not conflict and position_key not in used_positions:
                        resolved.append(candidate)
                        used_positions.add(position_key)
                        break

        return resolved

    def _apply_fallback_extraction(
        self,
        extracted: ExtractedInfo,
        lines: List[OCRLine]
    ) -> ExtractedInfo:
        if not extracted.manufacturer:
            extracted.manufacturer = self._extract_manufacturer_fallback(lines)

        if not extracted.equipment_name:
            extracted.equipment_name = self._extract_equipment_name_fallback(lines)

        if not extracted.equipment_model and len(lines) > 1:
            for line in lines[1:3]:
                if re.match(r'^[A-Za-z][A-Za-z0-9\-]{3,}$', line.text):
                    extracted.equipment_model = line.text
                    break

        return extracted

    def _extract_manufacturer_fallback(self, lines: List[OCRLine]) -> Optional[str]:
        keywords = ["公司", "制造厂", "有限公司", "股份公司", "集团", "厂", "工厂"]
        for line in lines:
            for keyword in keywords:
                if keyword in line.text:
                    return self._clean_extracted_value("manufacturer", line.text)
        return None

    def _extract_equipment_name_fallback(self, lines: List[OCRLine]) -> Optional[str]:
        if len(lines) > 0:
            return self._clean_extracted_value("equipment_name", lines[0].text)
        return None

    def _standardize_fields(self, extracted: ExtractedInfo) -> ExtractedInfo:
        if extracted.production_date:
            date_match = re.match(r'(\d{4})-(\d{1,2})-(\d{1,2})', extracted.production_date)
            if date_match:
                year, month, day = date_match.groups()
                extracted.production_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"

        if extracted.dimensions:
            extracted.dimensions = extracted.dimensions.replace(' ', '')

        if extracted.serial_number:
            extracted.serial_number = extracted.serial_number.upper()

        return extracted

    def _cross_validate_fields(self, extracted: ExtractedInfo) -> ExtractedInfo:
        if extracted.equipment_name and extracted.equipment_model:
            if extracted.equipment_name == extracted.equipment_model:
                if len(extracted.equipment_model) < 10:
                    extracted.equipment_name = None

        if extracted.rated_voltage:
            if not re.search(r'\d+', extracted.rated_voltage):
                extracted.rated_voltage = None

        if extracted.rated_current:
            if not re.search(r'\d+\.?\d*', extracted.rated_current):
                extracted.rated_current = None

        return extracted

    def validate_extracted(self, extracted: ExtractedInfo) -> Dict[str, bool]:
        validation = {}
        required_fields = ["equipment_name", "equipment_model", "serial_number", "manufacturer"]
        for field in required_fields:
            validation[field] = getattr(extracted, field) is not None
        return validation

    def get_extraction_report(self, extracted: ExtractedInfo) -> Dict[str, Any]:
        validation = self.validate_extracted(extracted)

        fields_found = sum(1 for v in vars(extracted).values() if v is not None)
        total_fields = len(vars(extracted))

        return {
            "field_validation": validation,
            "total_fields": total_fields,
            "fields_found": fields_found,
            "completion_rate": fields_found / total_fields if total_fields > 0 else 0,
            "required_fields_complete": all(validation.values())
        }


information_extractor = InformationExtractor()

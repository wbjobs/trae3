import re
import jieba
import jieba.analyse
from typing import List, Tuple, Optional, Dict, Any
from datetime import datetime
import logging

from app.schemas.document import OCRResult, DocumentStruct, StructuredField, OCRLine

logger = logging.getLogger(__name__)


class StructurizeService:
    def __init__(self):
        self._init_patterns()
        self._init_jieba()
    
    def _init_patterns(self):
        self.date_patterns = [
            (r'\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?', 1.0),
            (r'\d{4}年\d{1,2}月\d{1,2}日', 1.0),
            (r'\d{1,2}[-/月]\d{1,2}[日号]', 0.8),
            (r'二〇\d{2}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?', 0.9),
        ]
        
        self.title_keywords = [
            '通知', '公告', '通告', '决定', '命令', '指示',
            '请示', '报告', '批复', '意见', '函', '会议纪要',
            '总结', '计划', '申请', '证明', '介绍信', '证明信',
            '关于', '的通知', '的报告', '的请示', '的意见'
        ]
        
        self.sender_patterns = [
            (r'(?:发件人|发函单位|发文单位|抄送|报送)[：:]\s*(.+)', 0.9),
            (r'(?:签发人|审核人|批准人)[：:]\s*(.+)', 0.85),
        ]
        
        self.receiver_patterns = [
            (r'(?:收件人|收文单位|主送|抄送)[：:]\s*(.+)', 0.9),
            (r'^(各部门|各单位|各位|各科室).*$', 0.7),
        ]
        
        self.signature_patterns = [
            (r'(?:签字|签名|盖章|签章|落款)[：:]\s*(.+)', 0.9),
            (r'(?:经办人|负责人|审核人|审批人)[：:]\s*(.+)', 0.85),
        ]
        
        self.custom_field_patterns = {
            '编号': (r'(?:编号|文号|文件编号)[：:]\s*([^\n，。；;]+)', 0.9),
            '紧急程度': (r'(?:紧急程度|密级|优先级)[：:]\s*([^\n，。；;]+)', 0.85),
            '页数': (r'(?:共|本文件共)\s*(\d+\s*页)', 0.8),
            '附件': (r'(?:附件|附表|附图)[：:]\s*([^\n。]+)', 0.85),
            '联系电话': (r'(?:联系电话|电话|Tel)[：:]\s*([^\n，。；;]+)', 0.9),
            '电子邮箱': (r'(?:邮箱|电子邮箱|Email)[：:]\s*([^\n，。；;\s]+)', 0.9),
            '地址': (r'(?:地址|住址|办公地址)[：:]\s*([^\n，。；;]+)', 0.8),
        }
    
    def _init_jieba(self):
        try:
            jieba.initialize()
            jieba.load_userdict(self._get_user_dict())
        except Exception as e:
            logger.warning(f"jieba 初始化警告: {e}")
    
    def _get_user_dict(self) -> List[str]:
        return [
            '工作总结', '工作计划', '会议纪要', '通知公告',
            '总经理办公室', '人力资源部', '财务部', '技术部',
            '市场部', '运营部', '行政部', '研发部'
        ]
    
    def process(self, ocr_result: OCRResult) -> DocumentStruct:
        logger.info(f"开始结构化提取，共 {len(ocr_result.lines)} 行文本")
        
        try:
            lines_with_pos = self._analyze_line_positions(ocr_result.lines)
            
            title = self._extract_title(lines_with_pos)
            date = self._extract_date(lines_with_pos, ocr_result.raw_text)
            sender = self._extract_sender(lines_with_pos, ocr_result.raw_text)
            receiver = self._extract_receiver(lines_with_pos, ocr_result.raw_text)
            signature = self._extract_signature(lines_with_pos, ocr_result.raw_text)
            content = self._extract_content(lines_with_pos)
            keywords = self._extract_keywords(ocr_result.raw_text)
            custom_fields = self._extract_custom_fields(lines_with_pos, ocr_result.raw_text)
            
            result = DocumentStruct(
                title=title,
                date=date,
                sender=sender,
                receiver=receiver,
                signature=signature,
                content=content,
                keywords=keywords,
                custom_fields=custom_fields
            )
            
            logger.info(f"结构化提取完成 - 标题: {title[:20]}..., 日期: {date}, 关键词数: {len(keywords)}")
            return result
            
        except Exception as e:
            logger.error(f"结构化提取失败: {e}", exc_info=True)
            return DocumentStruct()
    
    def _analyze_line_positions(self, lines: List[OCRLine]) -> List[Dict[str, Any]]:
        analyzed = []
        
        for idx, line in enumerate(lines):
            bbox = line.bbox
            x_coords = [p[0] for p in bbox]
            y_coords = [p[1] for p in bbox]
            
            x_min = min(x_coords)
            x_max = max(x_coords)
            y_min = min(y_coords)
            y_max = max(y_coords)
            
            width = x_max - x_min
            height = y_max - y_min
            x_center = (x_min + x_max) / 2
            y_center = (y_min + y_max) / 2
            
            area = width * height
            is_centered = abs(x_center - 0.5) < 0.2 if width > 100 else False
            
            position = 'middle'
            if idx == 0:
                position = 'top'
            elif idx == len(lines) - 1:
                position = 'bottom'
            elif idx < 3:
                position = 'top_area'
            elif idx >= len(lines) - 3:
                position = 'bottom_area'
            
            analyzed.append({
                'line': line,
                'text': line.text,
                'confidence': line.confidence,
                'index': idx,
                'x_min': x_min,
                'x_max': x_max,
                'y_min': y_min,
                'y_max': y_max,
                'width': width,
                'height': height,
                'x_center': x_center,
                'y_center': y_center,
                'area': area,
                'is_centered': is_centered,
                'position': position
            })
        
        return analyzed
    
    def _extract_title(self, lines_with_pos: List[Dict[str, Any]]) -> str:
        if not lines_with_pos:
            return ""
        
        candidates = []
        
        for line_info in lines_with_pos[:5]:
            text = line_info['text'].strip()
            score = 0
            
            if len(text) < 4 or len(text) > 80:
                continue
            
            for keyword in self.title_keywords:
                if keyword in text:
                    score += 2.0
            
            if line_info['position'] in ['top', 'top_area']:
                score += 1.0
            
            if line_info['is_centered']:
                score += 0.5
            
            if line_info['height'] > 0:
                avg_height = sum(l['height'] for l in lines_with_pos) / len(lines_with_pos)
                if line_info['height'] > avg_height * 1.2:
                    score += 1.0
            
            score += line_info['confidence']
            
            candidates.append((text, score))
        
        if candidates:
            candidates.sort(key=lambda x: x[1], reverse=True)
            if candidates[0][1] > 1.0:
                return candidates[0][0]
        
        for line_info in lines_with_pos[:3]:
            text = line_info['text'].strip()
            if 4 <= len(text) <= 80:
                return text
        
        return ""
    
    def _extract_date(self, lines_with_pos: List[Dict[str, Any]], raw_text: str) -> str:
        all_matches = []
        
        for pattern, base_score in self.date_patterns:
            matches = re.findall(pattern, raw_text)
            for match in matches:
                normalized = self._normalize_date(match)
                if normalized:
                    all_matches.append({
                        'text': match,
                        'normalized': normalized,
                        'base_score': base_score
                    })
        
        for line_info in lines_with_pos:
            for pattern, base_score in self.date_patterns:
                matches = re.findall(pattern, line_info['text'])
                for match in matches:
                    score = base_score
                    
                    if line_info['position'] in ['bottom', 'bottom_area']:
                        score += 0.3
                    
                    score += line_info['confidence'] * 0.5
                    
                    normalized = self._normalize_date(match)
                    if normalized:
                        exists = any(m['text'] == match for m in all_matches)
                        if not exists:
                            all_matches.append({
                                'text': match,
                                'normalized': normalized,
                                'base_score': score
                            })
        
        if all_matches:
            all_matches.sort(key=lambda x: (x['base_score'], x['normalized']), reverse=True)
            return all_matches[0]['text']
        
        return ""
    
    def _normalize_date(self, date_str: str) -> Optional[datetime]:
        try:
            date_str = date_str.replace('年', '-').replace('月', '-').replace('日', '')
            date_str = date_str.replace('/', '-')
            
            if len(date_str.split('-')[0]) == 4:
                return datetime.strptime(date_str, '%Y-%m-%d')
            else:
                current_year = datetime.now().year
                return datetime.strptime(f"{current_year}-{date_str}", '%Y-%m-%d')
        except:
            return None
    
    def _extract_sender(self, lines_with_pos: List[Dict[str, Any]], raw_text: str) -> str:
        for pattern, score in self.sender_patterns:
            matches = re.findall(pattern, raw_text)
            if matches:
                return matches[0].strip()
        
        sender_keywords = ['公司', '集团', '办公室', '部', '处', '科', '室', '中心']
        candidates = []
        
        for line_info in lines_with_pos[-5:]:
            text = line_info['text'].strip()
            for keyword in sender_keywords:
                if keyword in text and len(text) < 40:
                    if not any(k in text for k in self.title_keywords):
                        score = line_info['confidence']
                        if line_info['position'] in ['bottom', 'bottom_area']:
                            score += 0.3
                        candidates.append((text, score))
        
        if candidates:
            candidates.sort(key=lambda x: x[1], reverse=True)
            return candidates[0][0]
        
        return ""
    
    def _extract_receiver(self, lines_with_pos: List[Dict[str, Any]], raw_text: str) -> str:
        for pattern, score in self.receiver_patterns:
            matches = re.findall(pattern, raw_text)
            if matches:
                return matches[0].strip()
        
        for line_info in lines_with_pos[:5]:
            text = line_info['text'].strip()
            if text.endswith(('：', ':', '：')) and len(text) < 30:
                return text.rstrip('：:').strip()
        
        return ""
    
    def _extract_signature(self, lines_with_pos: List[Dict[str, Any]], raw_text: str) -> str:
        for pattern, score in self.signature_patterns:
            matches = re.findall(pattern, raw_text)
            if matches:
                return matches[0].strip()
        
        candidates = []
        
        for line_info in lines_with_pos[-5:]:
            text = line_info['text'].strip()
            if 2 <= len(text) <= 10:
                if not re.match(r'^\d', text):
                    if not any(k in text for k in self.title_keywords):
                        if not re.search(r'[年月日]', text):
                            score = line_info['confidence']
                            if line_info['position'] in ['bottom', 'bottom_area']:
                                score += 0.2
                            candidates.append((text, score))
        
        if candidates:
            candidates.sort(key=lambda x: x[1], reverse=True)
            return candidates[0][0]
        
        return ""
    
    def _extract_content(self, lines_with_pos: List[Dict[str, Any]]) -> str:
        if len(lines_with_pos) <= 3:
            return '\n'.join([l['text'] for l in lines_with_pos])
        
        content_lines = []
        start_idx = 1
        end_idx = len(lines_with_pos) - 2
        
        for i in range(1, min(5, len(lines_with_pos))):
            if self._is_body_start(lines_with_pos[i]):
                start_idx = i
                break
        
        for i in range(len(lines_with_pos) - 2, max(1, len(lines_with_pos) - 6), -1):
            if self._is_body_end(lines_with_pos[i]):
                end_idx = i
                break
        
        for line_info in lines_with_pos[start_idx:end_idx + 1]:
            text = line_info['text'].strip()
            if text and not self._is_field_line(text):
                content_lines.append(text)
        
        content = '\n'.join(content_lines)
        
        if len(content) > 300:
            sentences = re.split(r'[。！？\n]', content)
            summary_sentences = []
            for sent in sentences:
                sent = sent.strip()
                if sent and len(summary_sentences) < 4:
                    summary_sentences.append(sent)
            content = '。'.join(summary_sentences) + '。'
        
        return content
    
    def _is_body_start(self, line_info: Dict[str, Any]) -> bool:
        text = line_info['text']
        if re.match(r'^[一二三四五六七八九十、（(]', text):
            return True
        if '：' in text or ':' in text:
            return True
        return False
    
    def _is_body_end(self, line_info: Dict[str, Any]) -> bool:
        text = line_info['text']
        if any(k in text for k in ['特此', '此致', '敬礼', '谢谢']):
            return True
        return False
    
    def _is_field_line(self, text: str) -> bool:
        field_prefixes = ['发件人', '收件人', '日期', '编号', '电话', '邮箱', '地址', '紧急程度']
        for prefix in field_prefixes:
            if text.startswith(prefix):
                return True
        return False
    
    def _extract_keywords(self, text: str, top_k: int = 10) -> List[str]:
        try:
            keywords = jieba.analyse.extract_tags(
                text,
                topK=top_k,
                withWeight=False,
                allowPOS=('n', 'vn', 'v', 'nr', 'ns', 'nt', 'nz')
            )
            
            filtered = []
            for kw in keywords:
                if len(kw) >= 2 and not kw.isdigit():
                    filtered.append(kw)
            
            return filtered[:top_k]
        except Exception as e:
            logger.warning(f"关键词提取失败: {e}")
            return []
    
    def _extract_custom_fields(self, lines_with_pos: List[Dict[str, Any]], raw_text: str) -> List[StructuredField]:
        custom_fields = []
        
        for field_name, (pattern, confidence) in self.custom_field_patterns.items():
            matches = re.findall(pattern, raw_text)
            if matches:
                value = matches[0].strip()
                if value and len(value) < 100:
                    custom_fields.append(StructuredField(
                        name=field_name,
                        value=value,
                        confidence=confidence
                    ))
        
        processed_names = {f.name for f in custom_fields}
        
        for line_info in lines_with_pos:
            text = line_info['text']
            pattern = r'([^：:\n]{2,8})[：:]\s*([^：:\n]{1,60})'
            matches = re.findall(pattern, text)
            
            for name, value in matches:
                name = name.strip()
                value = value.strip()
                
                if name and value and len(name) <= 10:
                    if name not in processed_names:
                        if not any(k in name for k in ['的', '了', '是', '在', '和', '与']):
                            conf = 0.7 + line_info['confidence'] * 0.15
                            conf = min(conf, 0.95)
                            custom_fields.append(StructuredField(
                                name=name,
                                value=value,
                                confidence=conf
                            ))
                            processed_names.add(name)
        
        return custom_fields[:10]


structurize_service = StructurizeService()

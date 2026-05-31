"""数据清洗服务 - 增强版"""
from datetime import datetime, timedelta
from typing import Optional, Dict, List
import pandas as pd
import numpy as np
from api.influxdb_client import influx_client


class DataCleaningService:
    """管网数据清洗服务 - 增强版异常检测"""
    
    def __init__(self):
        self.pressure_range = (0.05, 1.0)
        self.flow_range = (0, 500)
        self.iqr_factor = 1.5
        self.pressure_jump_threshold = 0.15
        self.flow_jump_threshold = 0.4
        self.z_score_threshold = 3.0
        self.rolling_window = 5
    
    def clean_pipeline_data(self, 
                            start_time: Optional[datetime] = None,
                            end_time: Optional[datetime] = None,
                            zone: Optional[str] = None) -> Dict:
        """清洗管网数据"""
        if not end_time:
            end_time = datetime.now()
        if not start_time:
            start_time = end_time - timedelta(days=7)
        
        pressure_data = influx_client.query_pressure_data(
            zone=zone, start_time=start_time, end_time=end_time
        )
        flow_data = influx_client.query_flow_data(
            zone=zone, start_time=start_time, end_time=end_time
        )
        
        df_p = pd.DataFrame(pressure_data) if pressure_data else pd.DataFrame()
        df_f = pd.DataFrame(flow_data) if flow_data else pd.DataFrame()
        
        if 'value' in df_p.columns and 'pressure' not in df_p.columns:
            df_p['pressure'] = df_p['value']
        if 'value' in df_f.columns and 'flow' not in df_f.columns:
            df_f['flow'] = df_f['value']
        
        result = {
            'pressure': self._clean_pressure_data(df_p),
            'flow': self._clean_flow_data(df_f),
            'overall_quality': {}
        }
        
        total_records = max(len(df_p), 1) + max(len(df_f), 1)
        cleaned_p = result['pressure']['cleaned_count']
        cleaned_f = result['flow']['cleaned_count']
        total_cleaned = cleaned_p + cleaned_f
        
        quality_score = max(0, 100 - (total_cleaned / total_records * 50)) if total_records > 0 else 85
        
        result['overall_quality'] = {
            'total_records': total_records,
            'cleaned_records': total_cleaned,
            'quality_score': round(quality_score, 2)
        }
        
        return result
    
    def _clean_pressure_data(self, df: pd.DataFrame) -> Dict:
        """清洗压力数据 - 增强版多维度检测"""
        if len(df) == 0 or 'pressure' not in df.columns:
            return {
                'original_count': 0, 
                'cleaned_count': 0, 
                'clean_rate': 0,
                'details': self._get_empty_details()
            }
        
        original_count = len(df)
        details = self._get_empty_details()
        
        df = df.copy()
        df['time'] = pd.to_datetime(df['time'])
        df = df.sort_values('time').reset_index(drop=True)
        
        details['out_of_range'] = self._detect_out_of_range(df, 'pressure', self.pressure_range)
        details['iqr_outliers'] = self._detect_iqr_outliers(df, 'pressure')
        details['z_score_outliers'] = self._detect_z_score_outliers(df, 'pressure')
        details['sudden_jump'] = self._detect_sudden_jump(df, 'pressure', self.pressure_jump_threshold)
        details['rolling_outliers'] = self._detect_rolling_outliers(df, 'pressure')
        details['flat_line'] = self._detect_flat_line(df, 'pressure')
        details['missing_values'] = int(df['pressure'].isna().sum())
        details['duplicate_timestamps'] = self._detect_duplicate_timestamps(df)
        
        all_masks = np.zeros(len(df), dtype=bool)
        for key in ['out_of_range', 'iqr_outliers', 'z_score_outliers', 
                    'sudden_jump', 'rolling_outliers', 'flat_line']:
            all_masks = all_masks | (df.get(f'_mask_{key}', False))
        
        cleaned_count = int(all_masks.sum())
        
        return {
            'original_count': original_count,
            'cleaned_count': cleaned_count,
            'clean_rate': round(cleaned_count / original_count * 100, 2) if original_count > 0 else 0,
            'details': details
        }
    
    def _clean_flow_data(self, df: pd.DataFrame) -> Dict:
        """清洗流量数据 - 增强版多维度检测"""
        if len(df) == 0 or 'flow' not in df.columns:
            return {
                'original_count': 0, 
                'cleaned_count': 0, 
                'clean_rate': 0,
                'details': self._get_empty_details()
            }
        
        original_count = len(df)
        details = self._get_empty_details()
        
        df = df.copy()
        df['time'] = pd.to_datetime(df['time'])
        df = df.sort_values('time').reset_index(drop=True)
        
        details['out_of_range'] = self._detect_out_of_range(df, 'flow', self.flow_range)
        details['iqr_outliers'] = self._detect_iqr_outliers(df, 'flow')
        details['z_score_outliers'] = self._detect_z_score_outliers(df, 'flow')
        details['sudden_jump'] = self._detect_sudden_jump_percent(df, 'flow', self.flow_jump_threshold)
        details['rolling_outliers'] = self._detect_rolling_outliers(df, 'flow')
        details['flat_line'] = self._detect_flat_line(df, 'flow')
        details['negative_values'] = int((df['flow'] < 0).sum())
        details['missing_values'] = int(df['flow'].isna().sum())
        details['duplicate_timestamps'] = self._detect_duplicate_timestamps(df)
        
        all_masks = np.zeros(len(df), dtype=bool)
        for key in ['out_of_range', 'iqr_outliers', 'z_score_outliers', 
                    'sudden_jump', 'rolling_outliers', 'flat_line', 'negative_values']:
            all_masks = all_masks | (df.get(f'_mask_{key}', False))
        
        cleaned_count = int(all_masks.sum())
        
        return {
            'original_count': original_count,
            'cleaned_count': cleaned_count,
            'clean_rate': round(cleaned_count / original_count * 100, 2) if original_count > 0 else 0,
            'details': details
        }
    
    def _get_empty_details(self) -> Dict:
        """获取空的详情字典"""
        return {
            'out_of_range': 0,
            'iqr_outliers': 0,
            'z_score_outliers': 0,
            'sudden_jump': 0,
            'rolling_outliers': 0,
            'flat_line': 0,
            'negative_values': 0,
            'missing_values': 0,
            'duplicate_timestamps': 0
        }
    
    def _detect_out_of_range(self, df: pd.DataFrame, field: str, value_range: tuple) -> int:
        """范围检测"""
        mask = (df[field] < value_range[0]) | (df[field] > value_range[1])
        df[f'_mask_out_of_range'] = mask
        return int(mask.sum())
    
    def _detect_iqr_outliers(self, df: pd.DataFrame, field: str) -> int:
        """IQR异常检测"""
        Q1 = df[field].quantile(0.25)
        Q3 = df[field].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - self.iqr_factor * IQR
        upper_bound = Q3 + self.iqr_factor * IQR
        mask = (df[field] < lower_bound) | (df[field] > upper_bound)
        df[f'_mask_iqr_outliers'] = mask
        return int(mask.sum())
    
    def _detect_z_score_outliers(self, df: pd.DataFrame, field: str) -> int:
        """Z-score异常检测"""
        mean = df[field].mean()
        std = df[field].std()
        if std == 0:
            df[f'_mask_z_score_outliers'] = False
            return 0
        z_scores = np.abs((df[field] - mean) / std)
        mask = z_scores > self.z_score_threshold
        df[f'_mask_z_score_outliers'] = mask
        return int(mask.sum())
    
    def _detect_sudden_jump(self, df: pd.DataFrame, field: str, threshold: float) -> int:
        """突变点检测（绝对差值）"""
        diff = df[field].diff().abs()
        mask = diff > threshold
        df[f'_mask_sudden_jump'] = mask
        return int(mask.sum())
    
    def _detect_sudden_jump_percent(self, df: pd.DataFrame, field: str, threshold: float) -> int:
        """突变点检测（百分比变化）"""
        pct_change = df[field].pct_change().abs()
        mask = pct_change > threshold
        df[f'_mask_sudden_jump'] = mask
        return int(mask.sum())
    
    def _detect_rolling_outliers(self, df: pd.DataFrame, field: str) -> int:
        """滑动窗口异常检测"""
        if len(df) < self.rolling_window:
            df[f'_mask_rolling_outliers'] = False
            return 0
        
        rolling_mean = df[field].rolling(window=self.rolling_window, center=True).mean()
        rolling_std = df[field].rolling(window=self.rolling_window, center=True).std()
        
        mask = np.abs(df[field] - rolling_mean) > 2 * rolling_std
        df[f'_mask_rolling_outliers'] = mask.fillna(False)
        return int(mask.sum())
    
    def _detect_flat_line(self, df: pd.DataFrame, field: str, min_length: int = 5) -> int:
        """平线检测（传感器卡死）"""
        if len(df) < min_length:
            df[f'_mask_flat_line'] = False
            return 0
        
        diff = df[field].diff().abs()
        is_flat = diff < 0.0001
        
        flat_regions = []
        current_flat = 0
        
        for i, flat in enumerate(is_flat):
            if flat:
                current_flat += 1
            else:
                if current_flat >= min_length:
                    flat_regions.extend(range(i - current_flat, i))
                current_flat = 0
        
        if current_flat >= min_length:
            flat_regions.extend(range(len(df) - current_flat, len(df)))
        
        mask = pd.Series(False, index=df.index)
        mask.iloc[flat_regions] = True
        df[f'_mask_flat_line'] = mask
        return int(mask.sum())
    
    def _detect_duplicate_timestamps(self, df: pd.DataFrame) -> int:
        """重复时间戳检测"""
        duplicates = df.duplicated(subset=['time'], keep=False)
        return int(duplicates.sum())
    
    def get_data_quality_report(self,
                                start_time: Optional[datetime] = None,
                                end_time: Optional[datetime] = None,
                                zone: Optional[str] = None) -> Dict:
        """获取数据质量报告 - 增强版"""
        if not end_time:
            end_time = datetime.now()
        if not start_time:
            start_time = end_time - timedelta(days=7)
        
        pressure_data = influx_client.query_pressure_data(
            zone=zone, start_time=start_time, end_time=end_time
        )
        flow_data = influx_client.query_flow_data(
            zone=zone, start_time=start_time, end_time=end_time
        )
        
        df_p = pd.DataFrame(pressure_data) if pressure_data else pd.DataFrame()
        df_f = pd.DataFrame(flow_data) if flow_data else pd.DataFrame()
        
        if 'value' in df_p.columns and 'pressure' not in df_p.columns:
            df_p['pressure'] = df_p['value']
        if 'value' in df_f.columns and 'flow' not in df_f.columns:
            df_f['flow'] = df_f['value']
        
        pressure_cleaning = self._clean_pressure_data(df_p)
        flow_cleaning = self._clean_flow_data(df_f)
        
        report = {
            'period': {
                'start': start_time.isoformat(),
                'end': end_time.isoformat()
            },
            'zone': zone or '全部',
            'pressure_quality': self._calculate_quality_metrics(df_p, pressure_cleaning, 'pressure'),
            'flow_quality': self._calculate_quality_metrics(df_f, flow_cleaning, 'flow')
        }
        
        p_score = report['pressure_quality']['overall_score']
        f_score = report['flow_quality']['overall_score']
        report['overall_quality_score'] = round((p_score + f_score) / 2, 2)
        
        return report
    
    def _calculate_quality_metrics(self, df: pd.DataFrame, cleaning_result: Dict, field: str) -> Dict:
        """计算质量指标 - 多维度评分"""
        if len(df) == 0 or field not in df.columns:
            return {
                'total_records': 0,
                'completeness': 85.0,
                'validity': 85.0,
                'consistency': 85.0,
                'uniqueness': 85.0,
                'timeliness': 85.0,
                'overall_score': 85.0,
                'details': self._get_empty_details()
            }
        
        total = len(df)
        details = cleaning_result.get('details', self._get_empty_details())
        
        completeness = max(0, 100 - (details.get('missing_values', 0) / total * 100 * 5))
        
        validity_errors = details.get('out_of_range', 0) + details.get('negative_values', 0)
        validity = max(0, 100 - (validity_errors / total * 100 * 2))
        
        consistency_errors = details.get('sudden_jump', 0) + details.get('flat_line', 0)
        consistency = max(0, 100 - (consistency_errors / total * 100 * 3))
        
        uniqueness = max(0, 100 - (details.get('duplicate_timestamps', 0) / total * 100 * 4))
        
        anomaly_errors = details.get('iqr_outliers', 0) + details.get('z_score_outliers', 0) + details.get('rolling_outliers', 0)
        accuracy = max(0, 100 - (anomaly_errors / total * 100 * 2))
        
        weights = {
            'completeness': 0.20,
            'validity': 0.25,
            'consistency': 0.25,
            'uniqueness': 0.15,
            'accuracy': 0.15
        }
        
        overall_score = (
            completeness * weights['completeness'] +
            validity * weights['validity'] +
            consistency * weights['consistency'] +
            uniqueness * weights['uniqueness'] +
            accuracy * weights['accuracy']
        )
        
        return {
            'total_records': total,
            'completeness': round(completeness, 2),
            'validity': round(validity, 2),
            'consistency': round(consistency, 2),
            'uniqueness': round(uniqueness, 2),
            'accuracy': round(accuracy, 2),
            'overall_score': round(overall_score, 2),
            'details': details,
            'statistics': {
                'mean': round(df[field].mean(), 3) if not df[field].empty else 0,
                'std': round(df[field].std(), 3) if not df[field].empty else 0,
                'min': round(df[field].min(), 3) if not df[field].empty else 0,
                'max': round(df[field].max(), 3) if not df[field].empty else 0
            }
        }

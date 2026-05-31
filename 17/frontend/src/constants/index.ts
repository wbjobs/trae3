export const FAULT_TYPE_LABELS: Record<string, string> = {
  voltage_abnormal: '电压异常',
  current_abnormal: '电流异常',
  temperature_high: '温度过高',
  offline: '设备离线',
  short_circuit: '短路故障',
};

export const FAULT_SEVERITY_LABELS: Record<string, string> = {
  critical: '致命',
  high: '严重',
  medium: '中等',
  low: '轻微',
};

export const FAULT_SEVERITY_COLORS: Record<string, string> = {
  critical: '#f5222d',
  high: '#ff4d4f',
  medium: '#faad14',
  low: '#52c41a',
};

export const FAULT_STATUS_LABELS: Record<string, string> = {
  active: '处理中',
  resolved: '已解决',
  ignored: '已忽略',
};

export const FAULT_STATUS_COLORS: Record<string, string> = {
  active: '#ff4d4f',
  resolved: '#52c41a',
  ignored: '#8c8c8c',
};

export const REPORT_TYPE_LABELS: Record<string, string> = {
  daily: '日报',
  weekly: '周报',
  monthly: '月报',
  quarterly: '季报',
  yearly: '年报',
  custom: '自定义',
};

export const REPORT_FORMAT_LABELS: Record<string, string> = {
  pdf: 'PDF',
  excel: 'Excel',
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  generating: '生成中',
  completed: '已完成',
  failed: '失败',
};

export const REPORT_STATUS_COLORS: Record<string, string> = {
  generating: '#1890ff',
  completed: '#52c41a',
  failed: '#ff4d4f',
};

export const CHART_COLORS = [
  '#1677ff',
  '#52c41a',
  '#faad14',
  '#ff4d4f',
  '#722ed1',
  '#13c2c2',
  '#eb2f96',
  '#fa8c16',
];

export const HEATMAP_COLORS = [
  '#52c41a',
  '#95de64',
  '#faad14',
  '#ff7a45',
  '#ff4d4f',
];

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
export const API_TIMEOUT = 30000;

export const DEFAULT_TIME_RANGE = {
  hours24: { start: Date.now() - 24 * 60 * 60 * 1000, end: Date.now() },
  days7: { start: Date.now() - 7 * 24 * 60 * 60 * 1000, end: Date.now() },
  days30: { start: Date.now() - 30 * 24 * 60 * 60 * 1000, end: Date.now() },
};

export const DATA_CLEANING_CONFIG = {
  outlierThreshold: 3,
  maxMissingRatio: 0.3,
  interpolationMethod: 'linear',
  minValidPoints: 10,
};

export const LTTB_SAMPLE_SIZE = 500;
export const LARGE_DATA_THRESHOLD = 1000;

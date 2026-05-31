import React from 'react';
import { Card, Statistic, Tag, Tooltip } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { MetricResult, PARAMETER_CONFIG, ParameterKey } from '../types';

interface MetricCardProps {
  metric: MetricResult;
}

const trendIcon = (trend: string) => {
  if (trend === 'rising') return <ArrowUpOutlined style={{ color: '#ff4d4f' }} />;
  if (trend === 'falling') return <ArrowDownOutlined style={{ color: '#1890ff' }} />;
  return <MinusOutlined style={{ color: '#999' }} />;
};

const trendColor = (trend: string) => {
  if (trend === 'rising') return '#ff4d4f';
  if (trend === 'falling') return '#1890ff';
  return '#999';
};

const MetricCard: React.FC<MetricCardProps> = ({ metric }) => {
  const paramConfig = PARAMETER_CONFIG[metric.parameter as ParameterKey];
  const label = paramConfig?.label || metric.parameter;
  const unit = paramConfig?.unit || '';

  return (
    <Card
      size="small"
      style={{ borderRadius: 8 }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: '#666' }}>{label}</span>
        <Tooltip title={`趋势: ${metric.trend === 'rising' ? '上升' : metric.trend === 'falling' ? '下降' : '稳定'}`}>
          <Tag color={metric.trend === 'rising' ? 'red' : metric.trend === 'falling' ? 'blue' : 'default'}>
            {trendIcon(metric.trend)} {metric.trend === 'rising' ? '上升' : metric.trend === 'falling' ? '下降' : '稳定'}
          </Tag>
        </Tooltip>
      </div>
      <Statistic
        value={metric.mean}
        precision={2}
        suffix={unit}
        valueStyle={{ fontSize: 22, fontWeight: 600, color: trendColor(metric.trend) }}
      />
      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: '#999' }}>
        <span>σ: {metric.std.toFixed(2)}</span>
        <span>范围: [{metric.min_val.toFixed(1)}, {metric.max_val.toFixed(1)}]</span>
        {metric.zscore_anomalies > 0 && (
          <span style={{ color: '#ff4d4f' }}>
            <WarningOutlined /> {metric.zscore_anomalies}异常
          </span>
        )}
      </div>
    </Card>
  );
};

export default MetricCard;

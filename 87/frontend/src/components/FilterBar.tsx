import React from 'react';
import { Select, DatePicker, Button, Space, Card } from 'antd';
import { FilterOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Device, ParameterKey, PARAMETER_CONFIG } from '../types';

const { RangePicker } = DatePicker;

interface FilterBarProps {
  devices: Device[];
  selectedDevice: string;
  onDeviceChange: (deviceId: string) => void;
  selectedParams: ParameterKey[];
  onParamsChange: (params: ParameterKey[]) => void;
  timeRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  onTimeRangeChange: (range: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => void;
  onRefresh: () => void;
}

const FilterBar: React.FC<FilterBarProps> = ({
  devices,
  selectedDevice,
  onDeviceChange,
  selectedParams,
  onParamsChange,
  timeRange,
  onTimeRangeChange,
  onRefresh,
}) => {
  return (
    <Card
      size="small"
      style={{ borderRadius: 8, marginBottom: 16 }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <Space wrap size="middle">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FilterOutlined style={{ color: '#1890ff' }} />
          <span style={{ fontSize: 13, color: '#666', whiteSpace: 'nowrap' }}>设备</span>
          <Select
            value={selectedDevice}
            onChange={onDeviceChange}
            style={{ minWidth: 160 }}
            options={devices.map((d) => ({ label: d.name, value: d.id }))}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#666', whiteSpace: 'nowrap' }}>参数</span>
          <Select
            mode="multiple"
            value={selectedParams}
            onChange={(v) => onParamsChange(v as ParameterKey[])}
            style={{ minWidth: 280 }}
            options={Object.entries(PARAMETER_CONFIG).map(([key, cfg]) => ({
              label: `${cfg.label} (${cfg.unit})`,
              value: key,
            }))}
            maxTagCount={3}
          />
        </div>
        <RangePicker
          showTime
          value={timeRange}
          onChange={(range) => onTimeRangeChange(range as any)}
          style={{ minWidth: 280 }}
        />
        <Button icon={<ReloadOutlined />} onClick={onRefresh}>
          刷新
        </Button>
      </Space>
    </Card>
  );
};

export default FilterBar;

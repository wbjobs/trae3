import { Table, Tag, Space, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Eye, MapPin } from 'lucide-react';
import type { FaultRecord } from '@/types';
import dayjs from 'dayjs';

interface FaultListProps {
  data: FaultRecord[];
  loading?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number, pageSize: number) => void;
  onViewDetail?: (record: FaultRecord) => void;
  onLocate?: (record: FaultRecord) => void;
}

const severityColors: Record<string, string> = {
  low: 'success',
  medium: 'warning',
  high: 'orange',
  critical: 'error',
};

const severityLabels: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
};

const faultTypeLabels: Record<string, string> = {
  voltage_abnormal: '电压异常',
  current_abnormal: '电流异常',
  temperature_high: '温度过高',
  offline: '离线',
  short_circuit: '短路',
};

const statusLabels: Record<string, { text: string; color: string }> = {
  active: { text: '待处理', color: 'error' },
  resolved: { text: '已解决', color: 'success' },
  ignored: { text: '已忽略', color: 'default' },
};

export default function FaultList({
  data,
  loading = false,
  total = 0,
  page = 1,
  pageSize = 20,
  onPageChange,
  onViewDetail,
  onLocate,
}: FaultListProps) {
  const columns: ColumnsType<FaultRecord> = [
    {
      title: '故障ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      render: (id: string) => <code className="text-xs text-blue-400">{id.slice(0, 12)}</code>,
    },
    {
      title: '组件ID',
      dataIndex: 'componentId',
      key: 'componentId',
      width: 120,
    },
    {
      title: '故障类型',
      dataIndex: 'faultType',
      key: 'faultType',
      width: 120,
      render: (type: string) => faultTypeLabels[type] || type,
    },
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (severity: string) => (
        <Tag color={severityColors[severity]}>{severityLabels[severity]}</Tag>
      ),
    },
    {
      title: '位置',
      dataIndex: 'location',
      key: 'location',
      width: 100,
      render: (location) =>
        location ? `(${location.row}, ${location.col})` : '-',
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 160,
      render: (time: number) => dayjs(time).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const { text, color } = statusLabels[status] || { text: status, color: 'default' };
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<Eye className="w-4 h-4" />}
            onClick={() => onViewDetail?.(record)}
          >
            详情
          </Button>
          <Button
            type="text"
            size="small"
            icon={<MapPin className="w-4 h-4" />}
            onClick={() => onLocate?.(record)}
          >
            定位
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={data}
      loading={loading}
      rowKey="id"
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total) => `共 ${total} 条记录`,
        onChange: onPageChange,
      }}
      size="small"
      scroll={{ x: 900 }}
    />
  );
}

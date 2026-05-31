import React from 'react';
import { Card, Table, Tag, Button, Badge, Space, message } from 'antd';
import { BellOutlined, CheckCircleOutlined, AlertOutlined } from '@ant-design/icons';
import { FaultAlert } from '../types';
import { acknowledgeFault } from '../api/client';

interface FaultAlertPanelProps {
  alerts: FaultAlert[];
  stats: { total: number; critical: number; warning: number; unacknowledged: number };
  onAcknowledge: (id: string) => void;
}

const severityConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  critical: { color: 'red', icon: <AlertOutlined />, label: '严重' },
  warning: { color: 'orange', icon: <BellOutlined />, label: '警告' },
  info: { color: 'blue', icon: <BellOutlined />, label: '提示' },
};

const faultTypeLabels: Record<string, string> = {
  over_temperature: '温度超限',
  over_vibration: '振动超限',
  over_pressure: '压力超高',
  low_pressure: '压力过低',
  rpm_anomaly: '转速异常',
};

const FaultAlertPanel: React.FC<FaultAlertPanelProps> = ({ alerts, stats, onAcknowledge }) => {
  const handleAck = async (id: string) => {
    try {
      await acknowledgeFault(id);
      message.success('已确认告警');
      onAcknowledge(id);
    } catch {
      message.error('确认失败');
    }
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 160,
      render: (v: string) => new Date(v).toLocaleTimeString(),
    },
    {
      title: '设备',
      dataIndex: 'device_id',
      key: 'device_id',
      width: 120,
    },
    {
      title: '故障类型',
      dataIndex: 'fault_type',
      key: 'fault_type',
      width: 110,
      render: (v: string) => faultTypeLabels[v] || v,
    },
    {
      title: '参数',
      dataIndex: 'parameter',
      key: 'parameter',
      width: 80,
    },
    {
      title: '当前值',
      dataIndex: 'value',
      key: 'value',
      width: 90,
      render: (v: number) => v?.toFixed(2),
    },
    {
      title: '阈值',
      dataIndex: 'threshold',
      key: 'threshold',
      width: 80,
      render: (v: number) => v?.toFixed(1),
    },
    {
      title: '级别',
      dataIndex: 'severity',
      key: 'severity',
      width: 80,
      render: (v: string) => {
        const cfg = severityConfig[v] || severityConfig.info;
        return (
          <Tag color={cfg.color} icon={cfg.icon}>
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: '描述',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'acknowledged',
      key: 'acknowledged',
      width: 100,
      render: (v: boolean, record: FaultAlert) =>
        v ? (
          <Tag color="green" icon={<CheckCircleOutlined />}>已确认</Tag>
        ) : (
          <Button size="small" type="link" onClick={() => handleAck(record.id)}>
            确认
          </Button>
        ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <BellOutlined />
          <span>故障告警</span>
          <Badge count={stats.unacknowledged} />
          {stats.critical > 0 && <Tag color="red">严重 {stats.critical}</Tag>}
          {stats.warning > 0 && <Tag color="orange">警告 {stats.warning}</Tag>}
        </Space>
      }
      size="small"
      style={{ borderRadius: 8 }}
      styles={{ body: { padding: 0 } }}
    >
      <Table
        dataSource={alerts}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 8, size: 'small' }}
        scroll={{ y: 360 }}
        rowClassName={(record) => (record.acknowledged ? '' : 'fault-unacknowledged')}
      />
    </Card>
  );
};

export default FaultAlertPanel;

import React from 'react';
import { Table, Tag, Space, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Log } from '../services/api';

interface LogTableProps {
  data: Log[];
  loading?: boolean;
  pagination: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, pageSize: number) => void;
  };
}

const LogTable: React.FC<LogTableProps> = ({ data, loading, pagination }) => {
  const getLevelColor = (level: string) => {
    const colors: Record<string, string> = {
      debug: 'default',
      info: 'blue',
      warning: 'orange',
      error: 'red',
      critical: 'red',
    };
    return colors[level] || 'default';
  };

  const columns: ColumnsType<Log> = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '终端',
      dataIndex: 'terminal_id',
      key: 'terminal_id',
      width: 150,
      render: (text: string, record) => (
        <Tooltip title={record.vehicle_number}>
          {record.terminal_name || text}
        </Tooltip>
      ),
    },
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      width: 100,
      render: (level: string) => (
        <Tag color={getLevelColor(level)} className={`log-level-${level}`}>
          {level.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 120,
    },
    {
      title: '消息',
      dataIndex: 'message',
      key: 'message',
      className: 'log-message',
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <span className="log-message">{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '元数据',
      dataIndex: 'metadata',
      key: 'metadata',
      width: 100,
      render: (metadata) =>
        metadata ? (
          <Tooltip title={JSON.stringify(metadata, null, 2)}>
            <Tag>详情</Tag>
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <div className="log-table-container">
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: pagination.onChange,
        }}
        scroll={{ x: 1000 }}
        size="small"
      />
    </div>
  );
};

export default LogTable;
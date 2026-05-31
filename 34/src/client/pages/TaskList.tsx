import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  Row,
  Col,
  Popconfirm,
  message,
  Progress,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  StopOutlined,
  EyeOutlined,
  DownloadOutlined,
  FileExcelOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { taskAPI } from '../services/api';
import socketService from '../services/socket';
import { TaskStatus } from '../types';

const { Search } = Input;
const { Option } = Select;

const TaskList: React.FC = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [filters, setFilters] = useState({
    status: undefined as string | undefined,
    search: '',
  });

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await taskAPI.list({
        page: pagination.current,
        limit: pagination.pageSize,
        status: filters.status,
      });
      setTasks(res.data.tasks);
      setPagination((prev) => ({
        ...prev,
        total: res.data.pagination.total,
      }));
    } catch (error) {
      message.error('加载任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();

    const handleTaskUpdate = () => {
      loadTasks();
    };

    socketService.on('task:submitted', handleTaskUpdate);
    socketService.on('task:complete', handleTaskUpdate);
    socketService.on('task:progress', handleTaskUpdate);
    socketService.on('task:cancelled', handleTaskUpdate);

    return () => {
      socketService.off('task:submitted', handleTaskUpdate);
      socketService.off('task:complete', handleTaskUpdate);
      socketService.off('task:progress', handleTaskUpdate);
      socketService.off('task:cancelled', handleTaskUpdate);
    };
  }, [pagination.current, pagination.pageSize, filters]);

  const handleCancelTask = async (taskId: string) => {
    try {
      await taskAPI.cancel(taskId);
      message.success('任务取消成功');
      loadTasks();
    } catch (error) {
      message.error('任务取消失败');
    }
  };

  const handleDownload = async (taskId: string) => {
    try {
      const res = await taskAPI.downloadResults(taskId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${taskId}_results.zip`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error('下载失败');
    }
  };

  const handleExportCSV = async (taskId: string) => {
    try {
      const res = await taskAPI.exportCSV(taskId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${taskId}_summary.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error('导出失败');
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      pending: { color: 'gold', text: '等待中' },
      queued: { color: 'blue', text: '队列中' },
      dispatched: { color: 'cyan', text: '已分发' },
      running: { color: 'processing', text: '运行中' },
      completed: { color: 'success', text: '已完成' },
      failed: { color: 'error', text: '失败' },
      cancelled: { color: 'default', text: '已取消' },
    };
    const config = statusMap[status] || statusMap.pending;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <a onClick={() => navigate(`/tasks/${record.id}`)}>{text}</a>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
      filters: [
        { text: '等待中', value: 'pending' },
        { text: '队列中', value: 'queued' },
        { text: '运行中', value: 'running' },
        { text: '已完成', value: 'completed' },
        { text: '失败', value: 'failed' },
        { text: '已取消', value: 'cancelled' },
      ],
    },
    {
      title: '进度',
      key: 'progress',
      render: (_: any, record: any) => {
        const progress =
          record.totalChunks > 0
            ? Math.round((record.completedChunks / record.totalChunks) * 100)
            : 0;
        return (
          <Progress
            percent={progress}
            size="small"
            status={record.status === 'failed' ? 'exception' : undefined}
          />
        );
      },
    },
    {
      title: '分片',
      key: 'chunks',
      render: (_: any, record: any) => (
        <span>
          {record.completedChunks}/{record.totalChunks}
        </span>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: number) => (
        <Tag color={priority >= 8 ? 'red' : priority >= 5 ? 'orange' : 'green'}>
          P{priority}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
      sorter: true,
    },
    {
      title: '预计/实际耗时',
      key: 'duration',
      render: (_: any, record: any) => {
        const estimated = record.estimatedDuration
          ? `${Math.round(record.estimatedDuration / 60)}分钟`
          : '-';
        const actual = record.actualDuration
          ? `${Math.round(record.actualDuration / 60)}分钟`
          : '-';
        return (
          <div>
            <div>预估: {estimated}</div>
            <div>实际: {actual}</div>
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/tasks/${record.id}`)}
            />
          </Tooltip>
          {['running', 'queued', 'pending'].includes(record.status) && (
            <Popconfirm
              title="确定要取消此任务吗？"
              onConfirm={() => handleCancelTask(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Tooltip title="取消任务">
                <Button type="text" danger icon={<StopOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
          {record.status === 'completed' && (
            <>
              <Tooltip title="下载结果">
                <Button
                  type="text"
                  icon={<DownloadOutlined />}
                  onClick={() => handleDownload(record.id)}
                />
              </Tooltip>
              <Tooltip title="导出CSV">
                <Button
                  type="text"
                  icon={<FileExcelOutlined />}
                  onClick={() => handleExportCSV(record.id)}
                />
              </Tooltip>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <h2>任务列表</h2>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadTasks}
            loading={loading}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/tasks/new')}
          >
            新建任务
          </Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Search
            placeholder="搜索任务名称"
            allowClear
            onSearch={(value) => setFilters((prev) => ({ ...prev, search: value }))}
          />
        </Col>
        <Col span={8}>
          <Select
            style={{ width: '100%' }}
            placeholder="筛选状态"
            allowClear
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
          >
            <Option value="pending">等待中</Option>
            <Option value="queued">队列中</Option>
            <Option value="running">运行中</Option>
            <Option value="completed">已完成</Option>
            <Option value="failed">失败</Option>
            <Option value="cancelled">已取消</Option>
          </Select>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条记录`,
          onChange: (page, pageSize) =>
            setPagination((prev) => ({ ...prev, current: page, pageSize })),
        }}
      />
    </div>
  );
};

export default TaskList;

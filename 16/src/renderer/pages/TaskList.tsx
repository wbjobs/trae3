import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Select,
  Input,
  message,
  Popconfirm,
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Tooltip,
  Empty
} from 'antd';
import {
  PlusOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined,
  CloudUploadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/apiClient';
import type { UpgradeTask, TaskStatus, Firmware, Terminal } from '@shared/types';
import { TaskStatus as TaskStatusEnum } from '@shared/types';

const { Option } = Select;

const statusMap: Record<TaskStatus, { color: string; text: string; icon: React.ReactNode }> = {
  [TaskStatusEnum.PENDING]: { color: 'default', text: '待执行', icon: <ClockCircleOutlined /> },
  [TaskStatusEnum.RUNNING]: { color: 'processing', text: '执行中', icon: <PlayCircleOutlined spin /> },
  [TaskStatusEnum.COMPLETED]: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
  [TaskStatusEnum.FAILED]: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
  [TaskStatusEnum.CANCELLED]: { color: 'warning', text: '已取消', icon: <StopOutlined /> }
};

const TaskList: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<UpgradeTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | undefined>();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [firmwares, setFirmwares] = useState<Firmware[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    running: 0,
    completed: 0,
    failed: 0
  });

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiService.getTasks({
        page,
        pageSize,
        status: statusFilter
      });
      if (result.success && result.data) {
        setTasks(result.data.items);
        setTotal(result.data.total);
      }
    } catch (error) {
      message.error('加载任务列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter]);

  const loadStats = useCallback(async () => {
    try {
      const result = await apiService.getTasks();
      if (result.success && result.data) {
        const allTasks = result.data.items;
        setStats({
          total: result.data.total,
          running: allTasks.filter(t => t.status === TaskStatusEnum.RUNNING).length,
          completed: allTasks.filter(t => t.status === TaskStatusEnum.COMPLETED).length,
          failed: allTasks.filter(t => t.status === TaskStatusEnum.FAILED).length
        });
      }
    } catch (error) {
      console.error('加载统计数据失败', error);
    }
  }, []);

  const loadFirmwares = useCallback(async () => {
    try {
      const result = await apiService.getFirmwares({ page: 1, pageSize: 100 });
      if (result.success && result.data) {
        setFirmwares(result.data.items);
      }
    } catch (error) {
      message.error('加载固件列表失败');
    }
  }, []);

  const loadTerminals = useCallback(async () => {
    try {
      const result = await apiService.getTerminals({ page: 1, pageSize: 100 });
      if (result.success && result.data) {
        setTerminals(result.data.items);
      }
    } catch (error) {
      message.error('加载终端列表失败');
    }
  }, []);

  useEffect(() => {
    loadTasks();
    loadStats();
  }, [loadTasks, loadStats]);

  useEffect(() => {
    if (createModalVisible) {
      loadFirmwares();
      loadTerminals();
    }
  }, [createModalVisible, loadFirmwares, loadTerminals]);

  const handleCreate = async (values: { name: string; firmwareId: string; terminalIds: string[] }) => {
    try {
      const result = await apiService.createTask(values);
      if (result.success) {
        message.success('任务创建成功');
        setCreateModalVisible(false);
        form.resetFields();
        loadTasks();
        loadStats();
      } else {
        message.error(result.error || '任务创建失败');
      }
    } catch (error) {
      message.error('任务创建失败');
    }
  };

  const handleStart = async (task: UpgradeTask) => {
    try {
      const firmwareResult = await apiService.getFirmware(task.firmwareId);
      const terminalsResult = await apiService.getTerminals({ page: 1, pageSize: 100 });
      
      if (!firmwareResult.success || !firmwareResult.data) {
        message.error('获取固件信息失败');
        return;
      }
      
      const taskTerminals = terminalsResult.success && terminalsResult.data
        ? terminalsResult.data.items.filter(t => task.terminalIds.includes(t.id))
        : [];

      const result = await apiService.startTask(task.id, firmwareResult.data, taskTerminals);
      if (result.success) {
        message.success('任务已启动');
        loadTasks();
        loadStats();
      } else {
        message.error(result.error || '启动任务失败');
      }
    } catch (error) {
      message.error('启动任务失败');
    }
  };

  const handleCancel = async (id: string) => {
    try {
      const result = await apiService.cancelTask(id);
      if (result.success) {
        message.success('任务已取消');
        loadTasks();
        loadStats();
      } else {
        message.error(result.error || '取消任务失败');
      }
    } catch (error) {
      message.error('取消任务失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const result = await apiService.deleteTask(id);
      if (result.success) {
        message.success('任务已删除');
        loadTasks();
        loadStats();
      } else {
        message.error(result.error || '删除任务失败');
      }
    } catch (error) {
      message.error('删除任务失败');
    }
  };

  const columns: ColumnsType<UpgradeTask> = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text: string) => <span style={{ fontWeight: 500 }}>{text}</span>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: TaskStatus) => {
        const config = statusMap[status];
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.text}
          </Tag>
        );
      }
    },
    {
      title: '升级进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 180,
      render: (progress: number, record) => (
        <Progress
          percent={progress}
          size="small"
          status={record.status === TaskStatusEnum.FAILED ? 'exception' : record.status === TaskStatusEnum.COMPLETED ? 'success' : 'active'}
        />
      )
    },
    {
      title: '完成情况',
      key: 'completion',
      width: 120,
      render: (_, record) => (
        <span>
          {record.completedCount} / {record.totalCount}
        </span>
      )
    },
    {
      title: '终端数量',
      dataIndex: 'totalCount',
      key: 'totalCount',
      width: 100
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: Date) => new Date(date).toLocaleString('zh-CN')
    },
    {
      title: '完成时间',
      dataIndex: 'finishedAt',
      key: 'finishedAt',
      width: 180,
      render: (date: Date | undefined) => date ? new Date(date).toLocaleString('zh-CN') : '-'
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/tasks/${record.id}`)}
            />
          </Tooltip>
          {record.status === TaskStatusEnum.PENDING && (
            <Tooltip title="开始任务">
              <Button
                type="link"
                size="small"
                icon={<PlayCircleOutlined />}
                onClick={() => handleStart(record)}
              />
            </Tooltip>
          )}
          {record.status === TaskStatusEnum.RUNNING && (
            <Tooltip title="取消任务">
              <Button
                type="link"
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => handleCancel(record.id)}
              />
            </Tooltip>
          )}
          {record.status !== TaskStatusEnum.RUNNING && (
            <Popconfirm
              title="确定删除此任务？"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="任务总数"
              value={stats.total}
              prefix={<CloudUploadOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="执行中"
              value={stats.running}
              valueStyle={{ color: '#1890ff' }}
              prefix={<PlayCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="已完成"
              value={stats.completed}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="失败"
              value={stats.failed}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="升级任务"
        extra={
          <Space>
            <Select
              placeholder="状态筛选"
              style={{ width: 140 }}
              allowClear
              value={statusFilter}
              onChange={setStatusFilter}
            >
              <Option value={TaskStatusEnum.PENDING}>待执行</Option>
              <Option value={TaskStatusEnum.RUNNING}>执行中</Option>
              <Option value={TaskStatusEnum.COMPLETED}>已完成</Option>
              <Option value={TaskStatusEnum.FAILED}>失败</Option>
              <Option value={TaskStatusEnum.CANCELLED}>已取消</Option>
            </Select>
            <Button icon={<ReloadOutlined />} onClick={loadTasks}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
              新建任务
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条记录`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            }
          }}
          locale={{
            emptyText: <Empty description="暂无任务" />
          }}
        />
      </Card>

      <Modal
        title="新建升级任务"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
        >
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="请输入任务名称" maxLength={50} />
          </Form.Item>
          <Form.Item
            name="firmwareId"
            label="选择固件"
            rules={[{ required: true, message: '请选择固件' }]}
          >
            <Select
              placeholder="请选择要升级的固件"
              showSearch
              optionFilterProp="children"
            >
              {firmwares.map(fw => (
                <Option key={fw.id} value={fw.id}>
                  {fw.name} - v{fw.version} ({fw.model})
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="terminalIds"
            label="选择终端"
            rules={[{ required: true, message: '请选择至少一个终端' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择要升级的终端"
              showSearch
              optionFilterProp="children"
              maxTagCount={5}
              style={{ width: '100%' }}
            >
              {terminals.map(t => (
                <Option key={t.id} value={t.id}>
                  {t.name} ({t.ip})
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setCreateModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">创建</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TaskList;

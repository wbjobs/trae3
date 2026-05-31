import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Descriptions,
  Table,
  Progress,
  message,
  Row,
  Col,
  Statistic,
  Timeline,
  Empty,
  Divider
} from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  CloudUploadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  SafetyOutlined,
  ToolOutlined,
  SyncOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useParams } from 'react-router-dom';
import apiService from '../services/apiClient';
import type { UpgradeTask, TaskProgress, TaskStatus, TerminalUpgradeStatus, Firmware, Terminal } from '@shared/types';
import { TaskStatus as TaskStatusEnum, TerminalUpgradeStatus as TerminalUpgradeStatusEnum } from '@shared/types';

const statusMap: Record<TaskStatus, { color: string; text: string; icon: React.ReactNode }> = {
  [TaskStatusEnum.PENDING]: { color: 'default', text: '待执行', icon: <ClockCircleOutlined /> },
  [TaskStatusEnum.RUNNING]: { color: 'processing', text: '执行中', icon: <PlayCircleOutlined spin /> },
  [TaskStatusEnum.COMPLETED]: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
  [TaskStatusEnum.FAILED]: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
  [TaskStatusEnum.CANCELLED]: { color: 'warning', text: '已取消', icon: <StopOutlined /> }
};

const terminalStatusMap: Record<TerminalUpgradeStatus, { color: string; text: string; icon: React.ReactNode }> = {
  [TerminalUpgradeStatusEnum.PENDING]: { color: 'default', text: '等待中', icon: <ClockCircleOutlined /> },
  [TerminalUpgradeStatusEnum.DOWNLOADING]: { color: 'processing', text: '下载中', icon: <DownloadOutlined spin /> },
  [TerminalUpgradeStatusEnum.VERIFYING]: { color: 'processing', text: '校验中', icon: <SafetyOutlined spin /> },
  [TerminalUpgradeStatusEnum.INSTALLING]: { color: 'processing', text: '安装中', icon: <ToolOutlined spin /> },
  [TerminalUpgradeStatusEnum.REBOOTING]: { color: 'processing', text: '重启中', icon: <SyncOutlined spin /> },
  [TerminalUpgradeStatusEnum.SUCCESS]: { color: 'success', text: '成功', icon: <CheckCircleOutlined /> },
  [TerminalUpgradeStatusEnum.FAILED]: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> }
};

const upgradeSteps = [
  { status: TerminalUpgradeStatusEnum.PENDING, title: '等待升级' },
  { status: TerminalUpgradeStatusEnum.DOWNLOADING, title: '下载固件' },
  { status: TerminalUpgradeStatusEnum.VERIFYING, title: '校验固件' },
  { status: TerminalUpgradeStatusEnum.INSTALLING, title: '安装固件' },
  { status: TerminalUpgradeStatusEnum.REBOOTING, title: '重启设备' },
  { status: TerminalUpgradeStatusEnum.SUCCESS, title: '升级完成' }
];

const TaskDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [task, setTask] = useState<UpgradeTask | null>(null);
  const [progressList, setProgressList] = useState<TaskProgress[]>([]);
  const [firmware, setFirmware] = useState<Firmware | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<TaskProgress | null>(null);

  const loadTask = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const taskResult = await apiService.getTask(id);
      if (taskResult.success && taskResult.data) {
        setTask(taskResult.data);
        
        const firmwareResult = await apiService.getFirmware(taskResult.data.firmwareId);
        if (firmwareResult.success && firmwareResult.data) {
          setFirmware(firmwareResult.data);
        }

        const terminalsResult = await apiService.getTerminals({ page: 1, pageSize: 100 });
        if (terminalsResult.success && terminalsResult.data) {
          setTerminals(terminalsResult.data.items.filter(t => 
            taskResult.data?.terminalIds.includes(t.id)
          ));
        }
      }
    } catch (error) {
      message.error('加载任务详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadProgress = useCallback(async () => {
    if (!id) return;
    try {
      const result = await apiService.getTaskProgress(id);
      if (result.success && result.data) {
        setProgressList(result.data);
        if (!selectedTerminal && result.data.length > 0) {
          setSelectedTerminal(result.data[0]);
        }
      }
    } catch (error) {
      console.error('加载进度失败', error);
    }
  }, [id, selectedTerminal]);

  useEffect(() => {
    loadTask();
    loadProgress();
  }, [loadTask, loadProgress]);

  useEffect(() => {
    if (task?.status === TaskStatusEnum.RUNNING) {
      const interval = setInterval(() => {
        loadProgress();
        loadTask();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [task?.status, loadProgress, loadTask]);

  const handleStart = async () => {
    if (!task || !firmware) return;
    try {
      const result = await apiService.startTask(task.id, firmware, terminals);
      if (result.success) {
        message.success('任务已启动');
        loadTask();
      } else {
        message.error(result.error || '启动任务失败');
      }
    } catch (error) {
      message.error('启动任务失败');
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    try {
      const result = await apiService.cancelTask(id);
      if (result.success) {
        message.success('任务已取消');
        loadTask();
      } else {
        message.error(result.error || '取消任务失败');
      }
    } catch (error) {
      message.error('取消任务失败');
    }
  };

  const getTerminalInfo = (terminalId: string) => {
    return terminals.find(t => t.id === terminalId);
  };

  const getTerminalProgress = (terminalId: string) => {
    return progressList.find(p => p.terminalId === terminalId);
  };

  const getCurrentStepIndex = (status: TerminalUpgradeStatus) => {
    return upgradeSteps.findIndex(step => step.status === status);
  };

  const columns: ColumnsType<Terminal> = [
    {
      title: '终端名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (text: string, record) => (
        <Button
          type="link"
          onClick={() => {
            const p = getTerminalProgress(record.id);
            if (p) setSelectedTerminal(p);
          }}
        >
          {text}
        </Button>
      )
    },
    {
      title: 'IP地址',
      dataIndex: 'ip',
      key: 'ip',
      width: 130
    },
    {
      title: '型号',
      dataIndex: 'model',
      key: 'model',
      width: 120
    },
    {
      title: '当前版本',
      dataIndex: 'firmwareVersion',
      key: 'firmwareVersion',
      width: 120
    },
    {
      title: '升级状态',
      key: 'status',
      width: 120,
      render: (_, record) => {
        const progress = getTerminalProgress(record.id);
        const status = progress?.status || TerminalUpgradeStatusEnum.PENDING;
        const config = terminalStatusMap[status];
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.text}
          </Tag>
        );
      }
    },
    {
      title: '升级进度',
      key: 'progress',
      width: 200,
      render: (_, record) => {
        const progress = getTerminalProgress(record.id);
        const percent = progress?.progress || 0;
        const status = progress?.status || TerminalUpgradeStatusEnum.PENDING;
        return (
          <Progress
            percent={percent}
            size="small"
            status={
              status === TerminalUpgradeStatusEnum.FAILED ? 'exception' :
              status === TerminalUpgradeStatusEnum.SUCCESS ? 'success' : 'active'
            }
          />
        );
      }
    },
    {
      title: '最后更新',
      key: 'updatedAt',
      width: 180,
      render: (_, record) => {
        const progress = getTerminalProgress(record.id);
        return progress?.updatedAt 
          ? new Date(progress.updatedAt).toLocaleString('zh-CN')
          : '-';
      }
    },
    {
      title: '说明',
      key: 'message',
      render: (_, record) => {
        const progress = getTerminalProgress(record.id);
        return progress?.message || '-';
      }
    }
  ];

  const stats = {
    total: terminals.length,
    success: progressList.filter(p => p.status === TerminalUpgradeStatusEnum.SUCCESS).length,
    failed: progressList.filter(p => p.status === TerminalUpgradeStatusEnum.FAILED).length,
    running: progressList.filter(p => 
      [TerminalUpgradeStatusEnum.DOWNLOADING, TerminalUpgradeStatusEnum.VERIFYING, 
       TerminalUpgradeStatusEnum.INSTALLING, TerminalUpgradeStatusEnum.REBOOTING].includes(p.status)
    ).length,
    pending: progressList.filter(p => p.status === TerminalUpgradeStatusEnum.PENDING).length
  };

  if (!task) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="任务不存在" />
      </div>
    );
  }

  const taskStatus = statusMap[task.status];

  return (
    <div style={{ padding: 24 }}>
      <Card
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tasks')}>
              返回
            </Button>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{task.name}</span>
            <Tag color={taskStatus.color} icon={taskStatus.icon} style={{ marginLeft: 12 }}>
              {taskStatus.text}
            </Tag>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadTask}>刷新</Button>
            {task.status === TaskStatusEnum.PENDING && (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart}>
                开始升级
              </Button>
            )}
            {task.status === TaskStatusEnum.RUNNING && (
              <Button danger icon={<StopOutlined />} onClick={handleCancel}>
                取消任务
              </Button>
            )}
          </Space>
        }
      >
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={4}>
            <Card size="small">
              <Statistic title="总终端数" value={stats.total} />
            </Card>
          </Col>
          <Col xs={12} sm={4}>
            <Card size="small">
              <Statistic title="等待升级" value={stats.pending} valueStyle={{ color: '#faad14' }} />
            </Card>
          </Col>
          <Col xs={12} sm={4}>
            <Card size="small">
              <Statistic title="升级中" value={stats.running} valueStyle={{ color: '#1890ff' }} />
            </Card>
          </Col>
          <Col xs={12} sm={4}>
            <Card size="small">
              <Statistic title="成功" value={stats.success} valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
          <Col xs={12} sm={4}>
            <Card size="small">
              <Statistic title="失败" value={stats.failed} valueStyle={{ color: '#ff4d4f' }} />
            </Card>
          </Col>
          <Col xs={12} sm={4}>
            <Card size="small">
              <Statistic 
                title="总进度" 
                value={task.progress} 
                suffix="%"
                prefix={<CloudUploadOutlined />}
              />
            </Card>
          </Col>
        </Row>

        <Descriptions bordered size="small" column={3}>
          <Descriptions.Item label="任务ID">{task.id}</Descriptions.Item>
          <Descriptions.Item label="固件信息">
            {firmware ? `${firmware.name} v${firmware.version}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="固件MD5">
            {firmware ? (
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{firmware.md5}</span>
            ) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {new Date(task.createdAt).toLocaleString('zh-CN')}
          </Descriptions.Item>
          <Descriptions.Item label="开始时间">
            {task.startedAt ? new Date(task.startedAt).toLocaleString('zh-CN') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="完成时间">
            {task.finishedAt ? new Date(task.finishedAt).toLocaleString('zh-CN') : '-'}
          </Descriptions.Item>
          {task.errorMessage && (
            <Descriptions.Item label="错误信息" span={3}>
              <span style={{ color: '#ff4d4f' }}>{task.errorMessage}</span>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={selectedTerminal ? 14 : 24}>
          <Card
            title="终端升级列表"
            loading={loading}
          >
            <Table
              columns={columns}
              dataSource={terminals}
              rowKey="id"
              pagination={false}
              scroll={{ y: 400 }}
              rowClassName={(record) => 
                selectedTerminal?.terminalId === record.id ? 'table-row-selected' : ''
              }
              locale={{
                emptyText: <Empty description="暂无终端" />
              }}
            />
          </Card>
        </Col>

        {selectedTerminal && (
          <Col xs={24} lg={10}>
            <Card
              title={
                <Space>
                  <InfoCircleOutlined />
                  <span>升级详情 - {getTerminalInfo(selectedTerminal.terminalId)?.name || selectedTerminal.terminalId}</span>
                </Space>
              }
              extra={
                <Button size="small" onClick={() => setSelectedTerminal(null)}>
                  关闭
                </Button>
              }
            >
              <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="IP地址">
                  {getTerminalInfo(selectedTerminal.terminalId)?.ip || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="当前状态">
                  <Tag 
                    color={terminalStatusMap[selectedTerminal.status].color}
                    icon={terminalStatusMap[selectedTerminal.status].icon}
                  >
                    {terminalStatusMap[selectedTerminal.status].text}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="升级进度">
                  <Progress
                    percent={selectedTerminal.progress}
                    status={
                      selectedTerminal.status === TerminalUpgradeStatusEnum.FAILED ? 'exception' :
                      selectedTerminal.status === TerminalUpgradeStatusEnum.SUCCESS ? 'success' : 'active'
                    }
                  />
                </Descriptions.Item>
                {selectedTerminal.message && (
                  <Descriptions.Item label="详细信息">
                    {selectedTerminal.message}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="最后更新">
                  {new Date(selectedTerminal.updatedAt).toLocaleString('zh-CN')}
                </Descriptions.Item>
              </Descriptions>

              <Divider orientation="left">升级步骤</Divider>
              <Timeline
                items={upgradeSteps.map((step, index) => {
                  const currentIndex = getCurrentStepIndex(selectedTerminal.status);
                  const isFailed = selectedTerminal.status === TerminalUpgradeStatusEnum.FAILED;
                  let color: string;
                  
                  if (isFailed && index === currentIndex) {
                    color = 'red';
                  } else if (index <= currentIndex) {
                    color = 'green';
                  } else {
                    color = 'gray';
                  }

                  return {
                    color,
                    children: step.title,
                    dot: index === currentIndex && !isFailed ? (
                      <SyncOutlined spin />
                    ) : undefined
                  };
                })}
              />
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
};

export default TaskDetail;

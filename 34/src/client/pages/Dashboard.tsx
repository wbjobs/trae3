import React, { useState, useEffect } from 'react';
import { Row, Col, Statistic, Card, List, Tag, Progress, Space } from 'antd';
import {
  CheckCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  HddOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { statsAPI, taskAPI } from '../services/api';
import socketService from '../services/socket';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [statsRes, tasksRes] = await Promise.all([
        statsAPI.get(),
        taskAPI.list({ limit: 5 }),
      ]);
      setStats(statsRes.data);
      setRecentTasks(tasksRes.data.tasks);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleTaskUpdate = () => {
      loadData();
    };

    socketService.on('task:submitted', handleTaskUpdate);
    socketService.on('task:complete', handleTaskUpdate);
    socketService.on('task:progress', handleTaskUpdate);

    const interval = setInterval(loadData, 5000);

    return () => {
      socketService.off('task:submitted', handleTaskUpdate);
      socketService.off('task:complete', handleTaskUpdate);
      socketService.off('task:progress', handleTaskUpdate);
      clearInterval(interval);
    };
  }, []);

  const getTaskStatusConfig = (status: string) => {
    const configs: Record<string, any> = {
      pending: { color: '#faad14', icon: <ClockCircleOutlined /> },
      queued: { color: '#1890ff', icon: <ClockCircleOutlined /> },
      running: { color: '#1890ff', icon: <SyncOutlined spin /> },
      completed: { color: '#52c41a', icon: <CheckCircleOutlined /> },
      failed: { color: '#ff4d4f', icon: <CloseCircleOutlined /> },
      cancelled: { color: '#8c8c8c', icon: <CloseCircleOutlined /> },
    };
    return configs[status] || configs.pending;
  };

  const getTaskChartOption = () => {
    if (!stats) return {};

    return {
      tooltip: {
        trigger: 'item',
      },
      legend: {
        orient: 'vertical',
        right: 'right',
      },
      series: [
        {
          name: '任务状态',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: false,
            position: 'center',
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 16,
              fontWeight: 'bold',
            },
          },
          labelLine: {
            show: false,
          },
          data: [
            { value: stats.pendingTasks, name: '等待中', itemStyle: { color: '#faad14' } },
            { value: stats.runningTasks, name: '运行中', itemStyle: { color: '#1890ff' } },
            { value: stats.completedTasks, name: '已完成', itemStyle: { color: '#52c41a' } },
            { value: stats.failedTasks, name: '失败', itemStyle: { color: '#ff4d4f' } },
          ],
        },
      ],
    };
  };

  const getNodeChartOption = () => {
    if (!stats) return {};

    return {
      tooltip: {
        trigger: 'item',
      },
      legend: {
        orient: 'vertical',
        right: 'right',
      },
      series: [
        {
          name: '节点状态',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: false,
            position: 'center',
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 16,
              fontWeight: 'bold',
            },
          },
          labelLine: {
            show: false,
          },
          data: [
            { value: stats.busyNodes, name: '忙碌', itemStyle: { color: '#faad14' } },
            { value: stats.onlineNodes - stats.busyNodes, name: '空闲', itemStyle: { color: '#52c41a' } },
          ],
        },
      ],
    };
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px' }}>
        <LoadingOutlined style={{ fontSize: 32 }} />
        <p style={{ marginTop: 16 }}>加载中...</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h2 style={{ marginBottom: 24 }}>系统概览</h2>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="等待任务"
              value={stats?.pendingTasks || 0}
              prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="运行任务"
              value={stats?.runningTasks || 0}
              prefix={<SyncOutlined style={{ color: '#1890ff' }} spin />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="完成任务"
              value={stats?.completedTasks || 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="在线节点"
              value={stats?.onlineNodes || 0}
              prefix={<HddOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="任务状态分布">
            <div className="chart-container">
              <ReactECharts option={getTaskChartOption()} style={{ height: '100%' }} />
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="节点状态分布">
            <div className="chart-container">
              <ReactECharts option={getNodeChartOption()} style={{ height: '100%' }} />
            </div>
          </Card>
        </Col>
      </Row>

      <Row style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card title="最近任务">
            <List
              dataSource={recentTasks}
              renderItem={(task: any) => {
                const statusConfig = getTaskStatusConfig(task.status);
                const progress = task.totalChunks > 0
                  ? Math.round((task.completedChunks / task.totalChunks) * 100)
                  : 0;

                return (
                  <List.Item>
                    <List.Item.Meta
                      avatar={statusConfig.icon}
                      title={
                        <Space>
                          <span>{task.name}</span>
                          <Tag color={statusConfig.color}>{task.status}</Tag>
                        </Space>
                      }
                      description={
                        <div>
                          <div>创建时间: {new Date(task.createdAt).toLocaleString()}</div>
                          {task.status === 'running' && (
                            <Progress
                              percent={progress}
                              size="small"
                              className="task-progress"
                            />
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;

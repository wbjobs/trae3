import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Progress, Table, Tag, Button, Space } from 'antd';
import {
  DesktopOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  WarningOutlined,
  ArrowUpOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import apiService from '../services/apiClient';
import { TerminalStatus, TaskStatus, LogLevel } from '@shared/types';
import type { UpgradeTask } from '@shared/types';

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [terminalStats, setTerminalStats] = useState<Record<TerminalStatus, number>>({
    online: 0,
    offline: 0,
    upgrading: 0,
    error: 0
  });
  const [taskStats, setTaskStats] = useState({
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0
  });
  const [recentTasks, setRecentTasks] = useState<UpgradeTask[]>([]);
  const [logChartData, setLogChartData] = useState<{ date: string; count: number }[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [terminalRes, tasksRes, logStatsRes] = await Promise.all([
        apiService.getTerminalStats(),
        apiService.getTasks({ page: 1, pageSize: 10 }),
        apiService.getLogStats(7)
      ]);

      if (terminalRes.success && terminalRes.data) {
        setTerminalStats(terminalRes.data);
      }

      if (tasksRes.success && tasksRes.data) {
        const tasks = tasksRes.data.items;
        setRecentTasks(tasks);
        setTaskStats({
          total: tasksRes.data.total,
          pending: tasks.filter(t => t.status === TaskStatus.PENDING).length,
          running: tasks.filter(t => t.status === TaskStatus.RUNNING).length,
          completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
          failed: tasks.filter(t => t.status === TaskStatus.FAILED).length
        });
      }

      if (logStatsRes.success && logStatsRes.data) {
        setLogChartData(logStatsRes.data.daily);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalTerminals = Object.values(terminalStats).reduce((a, b) => a + b, 0);

  const statusChartOption = {
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: {
        label: { show: true, fontSize: 16, fontWeight: 'bold' }
      },
      data: [
        { value: terminalStats.online, name: '在线', itemStyle: { color: '#52c41a' } },
        { value: terminalStats.offline, name: '离线', itemStyle: { color: '#8c8c8c' } },
        { value: terminalStats.upgrading, name: '升级中', itemStyle: { color: '#1890ff' } },
        { value: terminalStats.error, name: '异常', itemStyle: { color: '#ff4d4f' } }
      ]
    }]
  };

  const taskChartOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['完成', '失败', '进行中'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: ['待处理', '进行中', '已完成', '失败']
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: '数量',
        type: 'bar',
        data: [
          { value: taskStats.pending, itemStyle: { color: '#faad14' } },
          { value: taskStats.running, itemStyle: { color: '#1890ff' } },
          { value: taskStats.completed, itemStyle: { color: '#52c41a' } },
          { value: taskStats.failed, itemStyle: { color: '#ff4d4f' } }
        ],
        barWidth: '50%'
      }
    ]
  };

  const logChartOption = {
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: logChartData.map(d => d.date)
    },
    yAxis: { type: 'value' },
    series: [{
      data: logChartData.map(d => d.count),
      type: 'line',
      smooth: true,
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(24,144,255,0.3)' },
            { offset: 1, color: 'rgba(24,144,255,0.05)' }
          ]
        }
      },
      lineStyle: { color: '#1890ff', width: 2 }
    }]
  };

  const taskColumns = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: TaskStatus) => {
        const statusMap: Record<TaskStatus, { color: string; text: string }> = {
          [TaskStatus.PENDING]: { color: 'orange', text: '待执行' },
          [TaskStatus.RUNNING]: { color: 'blue', text: '进行中' },
          [TaskStatus.COMPLETED]: { color: 'green', text: '已完成' },
          [TaskStatus.FAILED]: { color: 'red', text: '失败' },
          [TaskStatus.CANCELLED]: { color: 'default', text: '已取消' }
        };
        return <Tag color={statusMap[status].color}>{statusMap[status].text}</Tag>;
      }
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      render: (progress: number) => (
        <Progress percent={progress} size="small" />
      )
    },
    {
      title: '完成/总数',
      key: 'count',
      render: (_: unknown, record: UpgradeTask) => (
        <span>{record.completedCount} / {record.totalCount}</span>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: Date) => dayjs(date).format('YYYY-MM-DD HH:mm')
    }
  ];

  const statCards = [
    {
      title: '终端总数',
      value: totalTerminals,
      icon: <DesktopOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
      color: '#1890ff'
    },
    {
      title: '在线终端',
      value: terminalStats.online,
      icon: <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
      color: '#52c41a'
    },
    {
      title: '升级任务',
      value: taskStats.running,
      icon: <CloudUploadOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
      color: '#722ed1'
    },
    {
      title: '异常终端',
      value: terminalStats.error,
      icon: <WarningOutlined style={{ fontSize: 32, color: '#ff4d4f' }} />,
      color: '#ff4d4f'
    }
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title">仪表盘</h2>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={loadData}>
          刷新数据
        </Button>
      </div>

      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        {statCards.map((card, index) => (
          <Col xs={24} sm={12} lg={6} key={index}>
            <Card hoverable>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: 12,
                  background: `${card.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {card.icon}
                </div>
                <div>
                  <Statistic
                    title={card.title}
                    value={card.value}
                    valueStyle={{ color: card.color }}
                  />
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="终端状态分布" extra={<ArrowUpOutlined />}>
            <ReactECharts option={statusChartOption} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="任务状态统计" extra={<ArrowUpOutlined />}>
            <ReactECharts option={taskChartOption} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={14}>
          <Card title="最近任务" extra={<a href="#/tasks">查看全部</a>}>
            <Table
              columns={taskColumns}
              dataSource={recentTasks}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="操作日志趋势">
            <ReactECharts option={logChartOption} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;

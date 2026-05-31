import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Progress } from 'antd';
import {
  CarOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { logApi, terminalApi, Log } from '../services/api';

const Dashboard: React.FC = () => {
  const [terminalStats, setTerminalStats] = useState({ total: 0, online: 0, offline: 0 });
  const [logLevels, setLogLevels] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<Log[]>([]);
  const [statistics, setStatistics] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const [summaryRes, levelsRes, logsRes, statsRes] = await Promise.all([
        terminalApi.getSummary(),
        logApi.getLevels(),
        logApi.getLogs({ pageSize: 10 }),
        logApi.getStatistics(),
      ]);

      setTerminalStats(summaryRes.data);
      setLogLevels(levelsRes.data);
      setRecentLogs(logsRes.data.data);
      setStatistics(statsRes.data);
    } catch (error) {
      console.error('加载仪表盘数据失败:', error);
    }
  };

  const getTrendChartOption = () => {
    const sortedStats = [...statistics].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['总数', '严重', '错误', '警告', '信息'] },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: sortedStats.map(s => s.date.slice(5)),
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: '总数',
          type: 'line',
          data: sortedStats.map(s => s.total_logs),
          smooth: true,
        },
        {
          name: '严重',
          type: 'line',
          data: sortedStats.map(s => s.critical_logs || 0),
          smooth: true,
          itemStyle: { color: '#cf1322' },
        },
        {
          name: '错误',
          type: 'line',
          data: sortedStats.map(s => s.error_logs),
          smooth: true,
          itemStyle: { color: '#ff4d4f' },
        },
        {
          name: '警告',
          type: 'line',
          data: sortedStats.map(s => s.warning_logs),
          smooth: true,
          itemStyle: { color: '#faad14' },
        },
        {
          name: '信息',
          type: 'line',
          data: sortedStats.map(s => s.info_logs),
          smooth: true,
          itemStyle: { color: '#1890ff' },
        },
      ],
    };
  };

  const getLevelPieOption = () => {
    return {
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', left: 'left' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 16, fontWeight: 'bold' },
          },
          labelLine: { show: false },
          data: logLevels.map(item => ({
            value: item.count,
            name: item.level.toUpperCase(),
          })),
        },
      ],
    };
  };

  const levelColumns = [
    {
      title: '级别',
      dataIndex: 'level',
      key: 'level',
      render: (level: string) => (
        <Tag className={`log-level-${level}`}>{level.toUpperCase()}</Tag>
      ),
    },
    {
      title: '数量',
      dataIndex: 'count',
      key: 'count',
    },
    {
      title: '占比',
      key: 'percent',
      render: (_: any, record: any) => {
        const total = logLevels.reduce((sum, item) => sum + item.count, 0);
        const percent = total > 0 ? ((record.count / total) * 100).toFixed(1) : 0;
        return (
          <Progress
            percent={parseFloat(percent)}
            size="small"
            showInfo={false}
            strokeColor={
              record.level === 'error'
                ? '#ff4d4f'
                : record.level === 'warning'
                ? '#faad14'
                : '#1890ff'
            }
          />
        );
      },
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="终端总数"
              value={terminalStats.total}
              prefix={<CarOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="在线终端"
              value={terminalStats.online}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="离线终端"
              value={terminalStats.offline}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="日志总数"
              value={logLevels.reduce((sum, item) => sum + item.count, 0)}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={16}>
          <Card title="日志趋势" extra={<span style={{ color: '#8c8c8c' }}>最近14天</span>}>
            <ReactECharts option={getTrendChartOption()} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="日志级别分布">
            <ReactECharts option={getLevelPieOption()} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="最新日志">
            <Table
              dataSource={recentLogs}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
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
                },
                {
                  title: '级别',
                  dataIndex: 'level',
                  key: 'level',
                  width: 100,
                  render: (level: string) => (
                    <Tag className={`log-level-${level}`}>{level.toUpperCase()}</Tag>
                  ),
                },
                {
                  title: '消息',
                  dataIndex: 'message',
                  key: 'message',
                  ellipsis: true,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
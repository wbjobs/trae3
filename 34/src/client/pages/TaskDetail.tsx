import React, { useState, useEffect } from 'react';
import {
  Descriptions,
  Card,
  Row,
  Col,
  Button,
  Space,
  Tag,
  Progress,
  List,
  message,
  Tabs,
  Statistic,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import { taskAPI } from '../services/api';
import socketService from '../services/socket';

const TaskDetail: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<any>(null);
  const [chunks, setChunks] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!taskId) return;

    setLoading(true);
    try {
      const [taskRes, chunksRes, resultsRes] = await Promise.all([
        taskAPI.get(taskId),
        taskAPI.getChunks(taskId),
        taskAPI.getResults(taskId),
      ]);
      setTask(taskRes.data);
      setChunks(chunksRes.data.chunks);
      setResults(resultsRes.data.results);
    } catch (error) {
      message.error('加载任务详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleUpdate = () => {
      loadData();
    };

    socketService.on('task:progress', handleUpdate);
    socketService.on('task:complete', handleUpdate);
    socketService.on('task:chunk:complete', handleUpdate);

    return () => {
      socketService.off('task:progress', handleUpdate);
      socketService.off('task:complete', handleUpdate);
      socketService.off('task:chunk:complete', handleUpdate);
    };
  }, [taskId]);

  const handleCancelTask = async () => {
    if (!taskId) return;
    try {
      await taskAPI.cancel(taskId);
      message.success('任务取消成功');
      loadData();
    } catch (error) {
      message.error('任务取消失败');
    }
  };

  const handleDownload = async () => {
    if (!taskId) return;
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

  const handleExportCSV = async () => {
    if (!taskId) return;
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

  const getChunkChartOption = () => {
    const statusCounts: Record<string, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };

    chunks.forEach((chunk) => {
      const status = chunk.status === 'dispatched' ? 'running' : chunk.status;
      if (statusCounts[status] !== undefined) {
        statusCounts[status]++;
      } else {
        statusCounts.pending++;
      }
    });

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
          name: '分片状态',
          type: 'pie',
          radius: ['40%', '70%'],
          data: [
            { value: statusCounts.pending, name: '等待中', itemStyle: { color: '#d9d9d9' } },
            { value: statusCounts.running, name: '运行中', itemStyle: { color: '#1890ff' } },
            { value: statusCounts.completed, name: '已完成', itemStyle: { color: '#52c41a' } },
            { value: statusCounts.failed, name: '失败', itemStyle: { color: '#ff4d4f' } },
          ],
        },
      ],
    };
  };

  if (loading || !task) {
    return (
      <div className="page-container">
        <p>加载中...</p>
      </div>
    );
  }

  const progress =
    task.totalChunks > 0
      ? Math.round((task.completedChunks / task.totalChunks) * 100)
      : 0;

  return (
    <div className="page-container">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tasks')}>
            返回列表
          </Button>
          <h2 style={{ margin: 0 }}>{task.name}</h2>
          {getStatusTag(task.status)}
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            刷新
          </Button>
          {['running', 'queued', 'pending'].includes(task.status) && (
            <Button danger icon={<StopOutlined />} onClick={handleCancelTask}>
              取消任务
            </Button>
          )}
          {task.status === 'completed' && (
            <>
              <Button icon={<FileExcelOutlined />} onClick={handleExportCSV}>
                导出CSV
              </Button>
              <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload}>
                下载结果
              </Button>
            </>
          )}
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="总进度"
              value={progress}
              suffix="%"
              valueStyle={{ color: progress === 100 ? '#52c41a' : '#1890ff' }}
            />
            <Progress percent={progress} showInfo={false} />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="分片完成"
              value={task.completedChunks}
              suffix={`/ ${task.totalChunks}`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="预估耗时"
              value={task.estimatedDuration ? Math.round(task.estimatedDuration / 60) : '-'}
              suffix="分钟"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="实际耗时"
              value={task.actualDuration ? Math.round(task.actualDuration / 60) : '-'}
              suffix="分钟"
            />
          </Card>
        </Col>
      </Row>

      <Tabs defaultActiveKey="info">
        <Tabs.TabPane tab="基本信息" key="info">
          <Card>
            <Descriptions column={2} bordered>
              <Descriptions.Item label="任务ID">{task.id}</Descriptions.Item>
              <Descriptions.Item label="创建者">{task.createdBy}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {dayjs(task.createdAt).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="开始时间">
                {task.startedAt
                  ? dayjs(task.startedAt).format('YYYY-MM-DD HH:mm:ss')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="完成时间">
                {task.completedAt
                  ? dayjs(task.completedAt).format('YYYY-MM-DD HH:mm:ss')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="优先级">
                <Tag color={task.priority >= 8 ? 'red' : task.priority >= 5 ? 'orange' : 'green'}>
                  P{task.priority}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="标签" span={2}>
                {task.tags?.map((tag: string) => (
                  <Tag key={tag}>{tag}</Tag>
                )) || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>
                {task.description || '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="计算参数" style={{ marginTop: 16 }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="求解器">
                {task.parameters?.simulation?.solver}
              </Descriptions.Item>
              <Descriptions.Item label="湍流模型">
                {task.parameters?.simulation?.turbulenceModel}
              </Descriptions.Item>
              <Descriptions.Item label="计算域">
                X: [{task.parameters?.domain?.xMin}, {task.parameters?.domain?.xMax}]<br />
                Y: [{task.parameters?.domain?.yMin}, {task.parameters?.domain?.yMax}]<br />
                Z: [{task.parameters?.domain?.zMin}, {task.parameters?.domain?.zMax}]
              </Descriptions.Item>
              <Descriptions.Item label="网格">
                X: {task.parameters?.mesh?.xCells}<br />
                Y: {task.parameters?.mesh?.yCells}<br />
                Z: {task.parameters?.mesh?.zCells}
              </Descriptions.Item>
              <Descriptions.Item label="相数量">
                {task.parameters?.phases?.length || 0}
              </Descriptions.Item>
              <Descriptions.Item label="模拟时长">
                {task.parameters?.simulation?.endTime - task.parameters?.simulation?.startTime}s
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane tab="分片状态" key="chunks">
          <Row gutter={16}>
            <Col span={8}>
              <Card title="分片统计">
                <div className="chart-container">
                  <ReactECharts option={getChunkChartOption()} style={{ height: '100%' }} />
                </div>
              </Card>
            </Col>
            <Col span={16}>
              <Card title="分片列表">
                <div className="chunk-visualization">
                  {chunks.map((chunk, index) => (
                    <div
                      key={chunk.id}
                      className={`chunk-box ${chunk.status === 'dispatched' || chunk.status === 'running' ? 'running' : chunk.status}`}
                      title={`分片 ${index + 1}: ${chunk.status}`}
                    >
                      {index + 1}
                    </div>
                  ))}
                </div>
                <List
                  dataSource={chunks}
                  size="small"
                  style={{ marginTop: 16 }}
                  renderItem={(chunk) => (
                    <List.Item>
                      <List.Item.Meta
                        title={`分片 ${chunk.chunkIndex + 1}`}
                        description={
                          <Space>
                            {getStatusTag(chunk.status)}
                            {chunk.assignedNode && (
                              <span>节点: {chunk.assignedNode.slice(0, 12)}...</span>
                            )}
                            {chunk.startTime && (
                              <span>
                                开始: {dayjs(chunk.startTime).format('HH:mm:ss')}
                              </span>
                            )}
                            {chunk.endTime && (
                              <span>
                                结束: {dayjs(chunk.endTime).format('HH:mm:ss')}
                              </span>
                            )}
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          </Row>
        </Tabs.TabPane>

        <Tabs.TabPane tab="计算结果" key="results">
          <Card title="结果列表">
            {results.length === 0 ? (
              <p style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                暂无计算结果
              </p>
            ) : (
              <List
                dataSource={results}
                renderItem={(result) => (
                  <List.Item
                    actions={[
                      <Button
                        type="link"
                        onClick={() => navigate(`/results/${taskId}`)}
                      >
                        查看详情
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={result.chunkId}
                      description={
                        <Space>
                          <span>文件大小: {(result.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                          <span>变量: {result.variables?.join(', ')}</span>
                          <span>时间步: {result.timesteps?.length} 个</span>
                          <span>
                            创建时间: {dayjs(result.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                          </span>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane tab="错误信息" key="error" disabled={!task.error}>
          <Card type="inner" title="错误详情">
            <pre style={{ background: '#fff1f0', padding: 16, borderRadius: 4 }}>
              {task.error}
            </pre>
          </Card>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default TaskDetail;

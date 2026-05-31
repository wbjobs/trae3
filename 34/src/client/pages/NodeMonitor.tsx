import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  List,
  Tag,
  Button,
  Space,
  Tooltip,
  Popconfirm,
  message,
  Badge,
  Descriptions,
} from 'antd';
import {
  ReloadOutlined,
  DeleteOutlined,
  HddOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  WarningOutlined,
  DashboardOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { nodeAPI } from '../services/api';
import socketService from '../services/socket';

const NodeMonitor: React.FC = () => {
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<any>(null);

  const loadNodes = async () => {
    setLoading(true);
    try {
      const res = await nodeAPI.list();
      setNodes(res.data.nodes);
    } catch (error) {
      message.error('加载节点列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNodes();

    const interval = setInterval(loadNodes, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleRemoveNode = async (nodeId: string) => {
    try {
      await nodeAPI.remove(nodeId);
      message.success('节点已移除');
      loadNodes();
    } catch (error) {
      message.error('移除节点失败');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'idle':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'busy':
        return <LoadingOutlined style={{ color: '#1890ff' }} />;
      case 'offline':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return <WarningOutlined style={{ color: '#faad14' }} />;
    }
  };

  const getStatusText = (status: string) => {
    const map: Record<string, string> = {
      idle: '空闲',
      busy: '忙碌',
      offline: '离线',
      online: '在线',
      error: '错误',
    };
    return map[status] || status;
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      idle: 'success',
      busy: 'processing',
      offline: 'error',
      online: 'success',
      error: 'error',
    };
    return map[status] || 'default';
  };

  const getNodeLoadChartOption = () => {
    return {
      tooltip: {
        trigger: 'axis',
      },
      xAxis: {
        type: 'category',
        data: nodes.map((n) => n.name.slice(0, 8)),
      },
      yAxis: {
        type: 'value',
        max: 100,
        name: '使用率 (%)',
      },
      series: [
        {
          name: 'CPU',
          type: 'bar',
          data: nodes.map((n) => n.currentLoad),
          itemStyle: { color: '#1890ff' },
        },
        {
          name: '内存',
          type: 'bar',
          data: nodes.map((n) => n.memoryUsage),
          itemStyle: { color: '#52c41a' },
        },
      ],
    };
  };

  const getNodeResourceChartOption = () => {
    const totalCores = nodes.reduce((sum, n) => sum + n.cpuCores, 0);
    const totalMemory = nodes.reduce((sum, n) => sum + n.memoryGB, 0);
    const usedMemory = nodes.reduce(
      (sum, n) => sum + (n.memoryUsage / 100) * n.memoryGB,
      0
    );

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
          name: '资源使用',
          type: 'pie',
          radius: ['40%', '70%'],
          data: [
            { value: usedMemory, name: '已用内存 (GB)', itemStyle: { color: '#1890ff' } },
            { value: totalMemory - usedMemory, name: '空闲内存 (GB)', itemStyle: { color: '#d9d9d9' } },
          ],
        },
      ],
    };
  };

  const onlineNodes = nodes.filter((n) => n.status !== 'offline');
  const busyNodes = nodes.filter((n) => n.status === 'busy');
  const totalCores = nodes.reduce((sum, n) => sum + n.cpuCores, 0);
  const totalMemory = nodes.reduce((sum, n) => sum + n.memoryGB, 0);

  return (
    <div className="page-container">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <h2>节点监控</h2>
        <Button icon={<ReloadOutlined />} onClick={loadNodes} loading={loading}>
          刷新
        </Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="总节点数"
              value={nodes.length}
              prefix={<HddOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="在线节点"
              value={onlineNodes.length}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="计算核心"
              value={totalCores}
              prefix={<DashboardOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="stat-card">
            <Statistic
              title="总内存"
              value={totalMemory}
              suffix="GB"
              prefix={<SaveOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={14}>
          <Card title="节点负载情况">
            <div className="chart-container">
              <ReactECharts option={getNodeLoadChartOption()} style={{ height: '100%' }} />
            </div>
          </Card>
        </Col>
        <Col span={10}>
          <Card title="集群资源使用">
            <div className="chart-container">
              <ReactECharts option={getNodeResourceChartOption()} style={{ height: '100%' }} />
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="节点列表">
        <Row gutter={16}>
          {nodes.map((node) => (
            <Col key={node.id} xs={24} sm={12} lg={8} xl={6}>
              <Card
                className="node-card"
                hoverable
                onClick={() => setSelectedNode(node)}
                actions={[
                  <Popconfirm
                    title="确定要移除此节点吗？"
                    onConfirm={() => handleRemoveNode(node.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Tooltip title="移除节点">
                      <DeleteOutlined style={{ color: '#ff4d4f' }} />
                    </Tooltip>
                  </Popconfirm>,
                ]}
              >
                <div className="node-header">
                  <span className="node-name">
                    {getStatusIcon(node.status)} {node.name}
                  </span>
                  <Tag className="node-status" color={getStatusColor(node.status)}>
                    {getStatusText(node.status)}
                  </Tag>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>
                      <DashboardOutlined /> CPU
                    </span>
                    <span>{node.currentLoad}%</span>
                  </div>
                  <Progress percent={node.currentLoad} size="small" showInfo={false} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>
                      <SaveOutlined /> 内存
                    </span>
                    <span>{node.memoryUsage}%</span>
                  </div>
                  <Progress percent={node.memoryUsage} size="small" showInfo={false} />
                </div>

                <div style={{ fontSize: 12, color: '#666' }}>
                  <div>
                    CPU 核心: {node.cpuCores} | 内存: {node.memoryGB} GB
                  </div>
                  {node.gpuCount > 0 && <div>GPU: {node.gpuCount}</div>}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {selectedNode && (
        <Card
          title={`节点详情 - ${selectedNode.name}`}
          style={{ marginTop: 24 }}
          extra={
            <Button onClick={() => setSelectedNode(null)} type="text">
              关闭
            </Button>
          }
        >
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="节点ID">{selectedNode.id}</Descriptions.Item>
            <Descriptions.Item label="主机名">{selectedNode.hostname}</Descriptions.Item>
            <Descriptions.Item label="端口">{selectedNode.port}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={getStatusColor(selectedNode.status)}>
                {getStatusText(selectedNode.status)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="CPU 核心">{selectedNode.cpuCores}</Descriptions.Item>
            <Descriptions.Item label="内存">{selectedNode.memoryGB} GB</Descriptions.Item>
            {selectedNode.gpuCount > 0 && (
              <Descriptions.Item label="GPU 数量">{selectedNode.gpuCount}</Descriptions.Item>
            )}
            <Descriptions.Item label="功能">
              {selectedNode.capabilities?.join(', ')}
            </Descriptions.Item>
            <Descriptions.Item label="当前任务">
              {selectedNode.currentTask || '无'}
            </Descriptions.Item>
            <Descriptions.Item label="最后心跳">
              {new Date(selectedNode.lastHeartbeat).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="注册时间">
              {new Date(selectedNode.registeredAt).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="已完成任务">
              {selectedNode.totalTasksCompleted}
            </Descriptions.Item>
            <Descriptions.Item label="总计算时间">
              {Math.round(selectedNode.totalComputeTime / 60)} 分钟
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </div>
  );
};

export default NodeMonitor;

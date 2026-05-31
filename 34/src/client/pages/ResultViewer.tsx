import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Space,
  Select,
  Slider,
  Tabs,
  List,
  Tag,
  message,
  Empty,
  Table,
} from 'antd';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  ReloadOutlined,
  LineChartOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { taskAPI } from '../services/api';

const { Option } = Select;

const ResultViewer: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<any[]>([]);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [selectedVariable, setSelectedVariable] = useState('U');
  const [selectedTimestep, setSelectedTimestep] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadResults = async () => {
    if (!taskId) return;

    setLoading(true);
    try {
      const res = await taskAPI.getResults(taskId);
      setResults(res.data.results);
      if (res.data.results.length > 0) {
        setSelectedResult(res.data.results[0]);
      }
    } catch (error) {
      message.error('加载结果失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, [taskId]);

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

  const getVelocityChartOption = () => {
    if (!selectedResult) return {};

    const timesteps = selectedResult.timesteps || [0, 1, 2, 3, 4, 5];
    const data = timesteps.map(() => Math.random() * 10 + 5);

    return {
      tooltip: {
        trigger: 'axis',
      },
      xAxis: {
        type: 'category',
        name: '时间步',
        data: timesteps,
      },
      yAxis: {
        type: 'value',
        name: '速度 (m/s)',
      },
      series: [
        {
          name: 'X方向',
          type: 'line',
          data: data,
          smooth: true,
        },
        {
          name: 'Y方向',
          type: 'line',
          data: data.map((v) => v * 0.5),
          smooth: true,
        },
        {
          name: 'Z方向',
          type: 'line',
          data: data.map((v) => v * 0.2),
          smooth: true,
        },
      ],
    };
  };

  const getPressureChartOption = () => {
    if (!selectedResult) return {};

    const timesteps = selectedResult.timesteps || [0, 1, 2, 3, 4, 5];
    const data = timesteps.map(() => Math.random() * 100000 + 100000);

    return {
      tooltip: {
        trigger: 'axis',
      },
      xAxis: {
        type: 'category',
        name: '时间步',
        data: timesteps,
      },
      yAxis: {
        type: 'value',
        name: '压力 (Pa)',
      },
      series: [
        {
          name: '平均压力',
          type: 'line',
          data: data,
          smooth: true,
          areaStyle: {},
        },
      ],
    };
  };

  const getPhaseChartOption = () => {
    if (!selectedResult) return {};

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
          name: '相分布',
          type: 'pie',
          radius: ['40%', '70%'],
          data: [
            { value: 60, name: '水 (water)', itemStyle: { color: '#1890ff' } },
            { value: 30, name: '空气 (air)', itemStyle: { color: '#52c41a' } },
            { value: 10, name: '其他', itemStyle: { color: '#faad14' } },
          ],
        },
      ],
    };
  };

  const getContourChartOption = () => {
    const data: number[][] = [];
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 20; j++) {
        data.push([i, j, Math.sin(i * 0.5) * Math.cos(j * 0.5) * 5 + 5]);
      }
    }

    return {
      tooltip: {
        position: 'top',
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
      },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 20 }, (_, i) => i),
        splitArea: {
          show: true,
        },
      },
      yAxis: {
        type: 'category',
        data: Array.from({ length: 20 }, (_, i) => i),
        splitArea: {
          show: true,
        },
      },
      visualMap: {
        min: 0,
        max: 10,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
      },
      series: [
        {
          name: '速度分布',
          type: 'heatmap',
          data: data,
          label: {
            show: false,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
        },
      ],
    };
  };

  if (loading) {
    return (
      <div className="page-container">
        <p>加载中...</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="page-container">
        <Empty description="暂无计算结果" />
      </div>
    );
  }

  const variables = selectedResult?.variables || ['U', 'p', 'k', 'epsilon'];
  const timesteps = selectedResult?.timesteps || [];

  const columns = [
    {
      title: '变量名',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '维度',
      dataIndex: 'dimension',
      key: 'dimension',
    },
    {
      title: '最小值',
      dataIndex: 'min',
      key: 'min',
      render: (v: number) => v?.toFixed(4),
    },
    {
      title: '最大值',
      dataIndex: 'max',
      key: 'max',
      render: (v: number) => v?.toFixed(4),
    },
    {
      title: '平均值',
      dataIndex: 'avg',
      key: 'avg',
      render: (v: number) => v?.toFixed(4),
    },
  ];

  const statsData = variables.map((v: string, i: number) => ({
    key: v,
    name: v,
    dimension: v === 'U' ? '[m/s]' : v === 'p' ? '[Pa]' : '[-]',
    min: Math.random() * 10,
    max: Math.random() * 100,
    avg: Math.random() * 50,
  }));

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
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/tasks/${taskId}`)}>
            返回任务
          </Button>
          <h2 style={{ margin: 0 }}>计算结果可视化</h2>
          <Tag color="blue">任务: {taskId}</Tag>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadResults}>
            刷新
          </Button>
          <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload}>
            下载全部
          </Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card title="选择结果分片">
            <Select
              style={{ width: '100%' }}
              value={selectedResult?.id}
              onChange={(value) => {
                const result = results.find((r) => r.id === value);
                setSelectedResult(result);
              }}
            >
              {results.map((result) => (
                <Option key={result.id} value={result.id}>
                  {result.chunkId}
                </Option>
              ))}
            </Select>
            {selectedResult && (
              <div style={{ marginTop: 16, fontSize: 12 }}>
                <p>文件大小: {(selectedResult.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                <p>时间步数: {selectedResult.timesteps?.length || 0}</p>
                <p>变量数: {selectedResult.variables?.length || 0}</p>
              </div>
            )}
          </Card>
        </Col>
        <Col span={6}>
          <Card title="选择变量">
            <Select
              style={{ width: '100%' }}
              value={selectedVariable}
              onChange={setSelectedVariable}
            >
              {variables.map((v: string) => (
                <Option key={v} value={v}>
                  {v}
                </Option>
              ))}
            </Select>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="选择时间步">
            <Slider
              min={0}
              max={timesteps.length - 1}
              value={selectedTimestep}
              onChange={setSelectedTimestep}
              marks={timesteps.reduce((acc: any, t: number, i: number) => {
                if (i % Math.ceil(timesteps.length / 5) === 0) {
                  acc[i] = t.toFixed(1);
                }
                return acc;
              }, {})}
            />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              当前时间步: {timesteps[selectedTimestep]?.toFixed(2) || 0}s
            </div>
          </Card>
        </Col>
      </Row>

      <Tabs defaultActiveKey="line">
        <Tabs.TabPane
          tab={
            <span>
              <LineChartOutlined /> 时程曲线
            </span>
          }
          key="line"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Card title="速度时程曲线">
                <div className="large-chart-container">
                  <ReactECharts option={getVelocityChartOption()} style={{ height: '100%' }} />
                </div>
              </Card>
            </Col>
            <Col span={12}>
              <Card title="压力时程曲线">
                <div className="large-chart-container">
                  <ReactECharts option={getPressureChartOption()} style={{ height: '100%' }} />
                </div>
              </Card>
            </Col>
          </Row>
        </Tabs.TabPane>

        <Tabs.TabPane
          tab={
            <span>
              <TableOutlined /> 统计数据
            </span>
          }
          key="stats"
        >
          <Card title="变量统计">
            <Table
              columns={columns}
              dataSource={statsData}
              pagination={false}
              size="small"
            />
          </Card>

          <Row gutter={16} style={{ marginTop: 24 }}>
            <Col span={8}>
              <Card title="相分布">
                <div className="chart-container">
                  <ReactECharts option={getPhaseChartOption()} style={{ height: '100%' }} />
                </div>
              </Card>
            </Col>
            <Col span={16}>
              <Card title="结果列表">
                <List
                  dataSource={results}
                  renderItem={(result) => (
                    <List.Item>
                      <List.Item.Meta
                        title={result.chunkId}
                        description={
                          <Space>
                            <Tag>大小: {(result.fileSize / 1024 / 1024).toFixed(2)} MB</Tag>
                            <Tag>变量: {result.variables?.join(', ')}</Tag>
                            <Tag>时间步: {result.timesteps?.length}</Tag>
                            <span>节点: {result.nodeId}</span>
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

        <Tabs.TabPane tab="云图/等值线" key="contour">
          <Row gutter={16}>
            <Col span={24}>
              <Card title="速度场分布 (切面)">
                <div style={{ height: 500 }}>
                  <ReactECharts option={getContourChartOption()} style={{ height: '100%' }} />
                </div>
              </Card>
            </Col>
          </Row>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default ResultViewer;

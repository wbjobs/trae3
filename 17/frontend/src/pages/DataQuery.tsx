import { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Select,
  DatePicker,
  Space,
  Button,
  Table,
  Tag,
  Tabs,
  Divider,
  Slider,
  Switch,
  Form,
  message,
} from 'antd';
import { Download, RefreshCw, Database, Filter } from 'lucide-react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

import TimeSeriesChart from '@/components/charts/TimeSeriesChart';
import type { TimeSeriesPoint, ComponentData } from '@/types';
import { dataApi, cleaningApi } from '@/services/api';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { TabPane } = Tabs;

export default function DataQuery() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(7, 'day'),
    dayjs(),
  ]);
  const [selectedComponents, setSelectedComponents] = useState<string[]>(['comp_001']);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['voltage', 'current']);
  const [timeSeriesData, setTimeSeriesData] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [rawData, setRawData] = useState<any[]>([]);
  const [componentList, setComponentList] = useState<any[]>([]);
  const [enableCleaning, setEnableCleaning] = useState(false);
  const [outlierThreshold, setOutlierThreshold] = useState(3);

  const componentOptions = Array.from({ length: 50 }, (_, i) => ({
    value: `comp_${String(i + 1).padStart(3, '0')}`,
    label: `组件 ${String(i + 1).padStart(3, '0')}`,
  }));

  const metricOptions = [
    { value: 'voltage', label: '电压 (V)' },
    { value: 'current', label: '电流 (A)' },
    { value: 'temperature', label: '温度 (°C)' },
    { value: 'power', label: '功率 (W)' },
  ];

  const fetchComponentList = async () => {
    try {
      const response = await dataApi.getComponentList();
      setComponentList(response.data || componentOptions);
    } catch (error) {
      console.error('Failed to fetch components:', error);
      setComponentList(componentOptions);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await dataApi.getTimeSeriesData({
        componentIds: selectedComponents,
        metrics: selectedMetrics,
        startTime: timeRange[0].valueOf(),
        endTime: timeRange[1].valueOf(),
        step: '5m',
        downsample: true,
      });

      const data = response.data;
      const formattedData: Record<string, TimeSeriesPoint[]> = {};

      Object.keys(data).forEach((componentId) => {
        selectedMetrics.forEach((metric) => {
          const key = `${componentId}_${metric}`;
          formattedData[key] = data[componentId]?.[metric] || [];
        });
      });

      setTimeSeriesData(formattedData);

      const flatData: any[] = [];
      Object.keys(data).forEach((componentId) => {
        data[componentId]?.voltage?.forEach((point: TimeSeriesPoint, idx: number) => {
          flatData.push({
            key: `${componentId}_${idx}`,
            timestamp: point.timestamp,
            componentId,
            voltage: data[componentId]?.voltage?.[idx]?.value,
            current: data[componentId]?.current?.[idx]?.value,
            temperature: data[componentId]?.temperature?.[idx]?.value,
          });
        });
      });
      setRawData(flatData.slice(0, 1000));
    } catch (error) {
      console.error('Failed to fetch data:', error);
      message.error('数据查询失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCleanData = async () => {
    setLoading(true);
    try {
      const response = await cleaningApi.cleanData({
        componentIds: selectedComponents,
        startTime: timeRange[0].valueOf(),
        endTime: timeRange[1].valueOf(),
        outlierThreshold,
        enableInterpolation: true,
      });
      message.success(`数据清洗完成：处理 ${response.data.processed} 条数据，移除 ${response.data.removedOutliers} 个异常值`);
      fetchData();
    } catch (error) {
      console.error('Failed to clean data:', error);
      message.error('数据清洗失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(rawData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '时序数据');
    XLSX.writeFile(wb, `光伏数据_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
    message.success('导出成功');
  };

  useEffect(() => {
    fetchComponentList();
  }, []);

  const columns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '组件ID',
      dataIndex: 'componentId',
      key: 'componentId',
      width: 100,
      render: (id: string) => <Tag color="blue">{id}</Tag>,
    },
    {
      title: '电压 (V)',
      dataIndex: 'voltage',
      key: 'voltage',
      width: 100,
      render: (v: number) => v?.toFixed(2) || '-',
      sorter: (a: any, b: any) => (a.voltage || 0) - (b.voltage || 0),
    },
    {
      title: '电流 (A)',
      dataIndex: 'current',
      key: 'current',
      width: 100,
      render: (v: number) => v?.toFixed(3) || '-',
      sorter: (a: any, b: any) => (a.current || 0) - (b.current || 0),
    },
    {
      title: '温度 (°C)',
      dataIndex: 'temperature',
      key: 'temperature',
      width: 100,
      render: (v: number) => v?.toFixed(1) || '-',
      sorter: (a: any, b: any) => (a.temperature || 0) - (b.temperature || 0),
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="bg-zinc-900 border-zinc-800">
        <Form form={form} layout="vertical">
          <Row gutter={[16, 16]} align="bottom">
            <Col xs={24} md={8}>
              <Form.Item label="时间范围" className="mb-0">
                <RangePicker
                  showTime
                  value={timeRange}
                  onChange={(dates) => dates && setTimeRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="组件选择" className="mb-0">
                <Select
                  mode="multiple"
                  value={selectedComponents}
                  onChange={setSelectedComponents}
                  options={componentOptions}
                  placeholder="选择组件"
                  style={{ width: '100%' }}
                  maxTagCount={3}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="指标类型" className="mb-0">
                <Select
                  mode="multiple"
                  value={selectedMetrics}
                  onChange={setSelectedMetrics}
                  options={metricOptions}
                  placeholder="选择指标"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider className="my-4 border-zinc-700" />

          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} md={12}>
              <Space>
                <span className="text-zinc-400">数据清洗：</span>
                <Switch checked={enableCleaning} onChange={setEnableCleaning} />
                {enableCleaning && (
                  <>
                    <span className="text-zinc-400">异常阈值 (σ)：</span>
                    <Slider
                      min={1}
                      max={5}
                      step={0.5}
                      value={outlierThreshold}
                      onChange={setOutlierThreshold}
                      style={{ width: 120 }}
                    />
                    <span className="text-white">{outlierThreshold}σ</span>
                  </>
                )}
              </Space>
            </Col>
            <Col xs={24} md={12} style={{ textAlign: 'right' }}>
              <Space>
                <Button
                  icon={<RefreshCw className="w-4 h-4" />}
                  onClick={fetchData}
                  loading={loading}
                >
                  查询数据
                </Button>
                {enableCleaning && (
                  <Button
                    icon={<Filter className="w-4 h-4" />}
                    onClick={handleCleanData}
                    loading={loading}
                  >
                    清洗数据
                  </Button>
                )}
                <Button
                  type="primary"
                  icon={<Download className="w-4 h-4" />}
                  onClick={handleExport}
                  disabled={rawData.length === 0}
                >
                  导出Excel
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Card>

      <Tabs defaultActiveKey="chart" className="bg-zinc-900 rounded-lg p-4">
        <TabPane tab="📈 图表视图" key="chart">
          <Row gutter={[16, 16]}>
            {selectedMetrics.includes('voltage') && (
              <Col xs={24} lg={12}>
                <TimeSeriesChart
                  title="电压趋势"
                  data={Object.fromEntries(
                    Object.entries(timeSeriesData).filter(([k]) => k.includes('voltage'))
                  )}
                  loading={loading}
                  yAxisName="电压 (V)"
                  unit="V"
                  height={320}
                />
              </Col>
            )}
            {selectedMetrics.includes('current') && (
              <Col xs={24} lg={12}>
                <TimeSeriesChart
                  title="电流趋势"
                  data={Object.fromEntries(
                    Object.entries(timeSeriesData).filter(([k]) => k.includes('current'))
                  )}
                  loading={loading}
                  colors={['#52c41a', '#13c2c2', '#eb2f96', '#faad14']}
                  yAxisName="电流 (A)"
                  unit="A"
                  height={320}
                />
              </Col>
            )}
            {selectedMetrics.includes('temperature') && (
              <Col xs={24} lg={12}>
                <TimeSeriesChart
                  title="温度趋势"
                  data={Object.fromEntries(
                    Object.entries(timeSeriesData).filter(([k]) => k.includes('temperature'))
                  )}
                  loading={loading}
                  colors={['#faad14', '#ff4d4f', '#fa8c16', '#f5222d']}
                  yAxisName="温度 (°C)"
                  unit="°C"
                  height={320}
                />
              </Col>
            )}
            {selectedMetrics.includes('power') && (
              <Col xs={24} lg={12}>
                <TimeSeriesChart
                  title="功率趋势"
                  data={Object.fromEntries(
                    Object.entries(timeSeriesData).filter(([k]) => k.includes('power'))
                  )}
                  loading={loading}
                  colors={['#722ed1', '#13c2c2', '#eb2f96', '#fa8c16']}
                  yAxisName="功率 (W)"
                  unit="W"
                  height={320}
                />
              </Col>
            )}
          </Row>
        </TabPane>

        <TabPane tab="📊 数据表格" key="table">
          <Card
            className="bg-zinc-900 border-zinc-800"
            extra={
              <span className="text-zinc-400">
                <Database className="w-4 h-4 inline mr-1" />
                共 {rawData.length} 条记录（显示前1000条）
              </span>
            }
          >
            <Table
              columns={columns}
              dataSource={rawData}
              loading={loading}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              scroll={{ x: 600, y: 500 }}
              size="small"
            />
          </Card>
        </TabPane>
      </Tabs>
    </div>
  );
}

import { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Select,
  DatePicker,
  Space,
  Table,
  Tag,
  Tabs,
  Statistic,
  Progress,
  List,
  Avatar,
  Tooltip,
} from 'antd';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  BarChart3,
  MapPin,
} from 'lucide-react';
import dayjs from 'dayjs';

import StatisticalChart from '@/components/charts/StatisticalChart';
import HeatmapChart from '@/components/charts/HeatmapChart';
import type { FaultRecord } from '@/types';
import { faultApi } from '@/services/api';

const { RangePicker } = DatePicker;
const { TabPane } = Tabs;

export default function FaultAnalysis() {
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);
  const [faultList, setFaultList] = useState<FaultRecord[]>([]);
  const [faultTotal, setFaultTotal] = useState(0);
  const [faultPage, setFaultPage] = useState(1);
  const [faultPageSize, setFaultPageSize] = useState(20);
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [statistics, setStatistics] = useState<any>({
    byType: [],
    bySeverity: [],
    byComponent: [],
    trend: [],
  });

  const faultTypeLabels: Record<string, string> = {
    voltage_abnormal: '电压异常',
    current_abnormal: '电流异常',
    temperature_high: '温度过高',
    offline: '设备离线',
    short_circuit: '短路故障',
  };

  const severityColors: Record<string, string> = {
    critical: '#f5222d',
    high: '#ff4d4f',
    medium: '#faad14',
    low: '#52c41a',
  };

  const severityLabels: Record<string, string> = {
    critical: '致命',
    high: '严重',
    medium: '中等',
    low: '轻微',
  };

  const statusColors: Record<string, string> = {
    active: '#ff4d4f',
    resolved: '#52c41a',
    ignored: '#8c8c8c',
  };

  const statusLabels: Record<string, string> = {
    active: '处理中',
    resolved: '已解决',
    ignored: '已忽略',
  };

  const fetchStatistics = async () => {
    try {
      const response = await faultApi.getFaultStatistics({
        startTime: timeRange[0].valueOf(),
        endTime: timeRange[1].valueOf(),
        groupBy: 'all',
      });
      setStatistics(response.data || {
        byType: [
          { name: '电压异常', value: 45 },
          { name: '电流异常', value: 32 },
          { name: '温度过高', value: 28 },
          { name: '设备离线', value: 15 },
          { name: '短路故障', value: 8 },
        ],
        bySeverity: [
          { name: '致命', value: 5, color: '#f5222d' },
          { name: '严重', value: 23, color: '#ff4d4f' },
          { name: '中等', value: 55, color: '#faad14' },
          { name: '轻微', value: 45, color: '#52c41a' },
        ],
        byComponent: Array.from({ length: 10 }, (_, i) => ({
          name: `comp_${String(i + 1).padStart(3, '0')}`,
          value: Math.floor(Math.random() * 20) + 5,
        })),
        trend: Array.from({ length: 30 }, (_, i) => ({
          date: dayjs().subtract(29 - i, 'day').format('MM-DD'),
          value: Math.floor(Math.random() * 10) + 2,
        })),
      });
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
    }
  };

  const fetchFaultList = async () => {
    setLoading(true);
    try {
      const response = await faultApi.getFaultList({
        startTime: timeRange[0].valueOf(),
        endTime: timeRange[1].valueOf(),
        severity: severityFilter.length > 0 ? severityFilter : undefined,
        status: statusFilter.length > 0 ? statusFilter : undefined,
        page: faultPage,
        pageSize: faultPageSize,
      });
      setFaultList(response.data.list);
      setFaultTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch faults:', error);
      const mockFaults: FaultRecord[] = Array.from({ length: 20 }, (_, i) => ({
        id: `fault_${i + 1}`,
        componentId: `comp_${String(Math.floor(Math.random() * 50) + 1).padStart(3, '0')}`,
        faultType: ['voltage_abnormal', 'current_abnormal', 'temperature_high', 'offline', 'short_circuit'][Math.floor(Math.random() * 5)] as any,
        severity: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)] as any,
        startTime: dayjs().subtract(Math.random() * 30, 'day').valueOf(),
        status: ['active', 'resolved', 'ignored'][Math.floor(Math.random() * 3)] as any,
        description: '检测到异常数据超出阈值范围',
        location: { row: Math.floor(Math.random() * 10), col: Math.floor(Math.random() * 20) },
        thresholdValue: 50,
        actualValue: 55 + Math.random() * 10,
      }));
      setFaultList(mockFaults);
      setFaultTotal(128);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatistics();
    fetchFaultList();
  }, [timeRange, severityFilter, statusFilter, faultPage, faultPageSize]);

  const activeFaults = faultList.filter(f => f.status === 'active').length;
  const resolvedRate = faultTotal > 0 ? ((faultTotal - activeFaults) / faultTotal * 100).toFixed(1) : '0';

  const columns = [
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={statusColors[status]}>
          {statusLabels[status]}
        </Tag>
      ),
    },
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (severity: string) => (
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: severityColors[severity] }}
          />
          <span style={{ color: severityColors[severity] }}>
            {severityLabels[severity]}
          </span>
        </div>
      ),
    },
    {
      title: '故障类型',
      dataIndex: 'faultType',
      key: 'faultType',
      width: 120,
      render: (type: string) => faultTypeLabels[type] || type,
    },
    {
      title: '组件ID',
      dataIndex: 'componentId',
      key: 'componentId',
      width: 100,
      render: (id: string) => <Tag color="blue">{id}</Tag>,
    },
    {
      title: '位置',
      dataIndex: 'location',
      key: 'location',
      width: 100,
      render: (loc: { row: number; col: number }) => loc && (
        <Tooltip title={`第${loc.row + 1}行，第${loc.col + 1}列`}>
          <span className="flex items-center gap-1 text-zinc-400">
            <MapPin className="w-3 h-3" />
            ({loc.row}, {loc.col})
          </span>
        </Tooltip>
      ),
    },
    {
      title: '发生时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 160,
      render: (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
  ];

  const heatmapData = Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 20 }, (_, col) => {
      const hasFault = Math.random() > 0.85;
      return {
        row,
        col,
        value: hasFault ? Math.floor(Math.random() * 5) : 0,
        componentId: `comp_${row * 20 + col + 1}`,
        faultTypes: hasFault ? ['temperature_high'] : [],
      };
    })
  ).flat();

  return (
    <div className="space-y-6">
      <Card className="bg-zinc-900 border-zinc-800">
        <Space wrap>
          <RangePicker
            showTime
            value={timeRange}
            onChange={(dates) => dates && setTimeRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
            style={{ width: 320 }}
          />
          <Select
            mode="multiple"
            value={severityFilter}
            onChange={setSeverityFilter}
            placeholder="严重程度"
            style={{ width: 200 }}
          >
            {Object.entries(severityLabels).map(([value, label]) => (
              <Select.Option key={value} value={value}>
                <span style={{ color: severityColors[value] }}>{label}</span>
              </Select.Option>
            ))}
          </Select>
          <Select
            mode="multiple"
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="处理状态"
            style={{ width: 160 }}
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <Select.Option key={value} value={value}>
                <span style={{ color: statusColors[value] }}>{label}</span>
              </Select.Option>
            ))}
          </Select>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="bg-zinc-900 border-zinc-800 h-full">
            <Statistic
              title={<span className="text-zinc-400">故障总数</span>}
              value={faultTotal}
              prefix={<AlertTriangle className="w-5 h-5 text-red-500" />}
              valueStyle={{ color: '#fff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="bg-zinc-900 border-zinc-800 h-full">
            <Statistic
              title={<span className="text-zinc-400">待处理</span>}
              value={activeFaults}
              prefix={<Clock className="w-5 h-5 text-yellow-500" />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="bg-zinc-900 border-zinc-800 h-full">
            <Statistic
              title={<span className="text-zinc-400">已解决</span>}
              value={faultTotal - activeFaults}
              prefix={<CheckCircle className="w-5 h-5 text-green-500" />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="bg-zinc-900 border-zinc-800 h-full">
            <div className="text-zinc-400 mb-2">解决率</div>
            <Progress
              percent={parseFloat(resolvedRate)}
              strokeColor="#52c41a"
              trailColor="#3f3f46"
              size="default"
            />
          </Card>
        </Col>
      </Row>

      <Tabs defaultActiveKey="overview" className="bg-zinc-900 rounded-lg p-4">
        <TabPane tab="📊 统计概览" key="overview">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <StatisticalChart
                title="故障类型分布"
                pieData={statistics.byType}
                height={350}
              />
            </Col>
            <Col xs={24} lg={12}>
              <StatisticalChart
                title="严重程度分布"
                pieData={statistics.bySeverity}
                height={350}
              />
            </Col>
            <Col xs={24} lg={12}>
              <Card
                title="故障趋势（近30天）"
                className="bg-zinc-900 border-zinc-800"
                extra={<TrendingUp className="w-5 h-5 text-zinc-400" />}
              >
                <StatisticalChart
                  barData={statistics.trend}
                  height={250}
                  showLegend={false}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card
                title="故障组件TOP10"
                className="bg-zinc-900 border-zinc-800"
                extra={<BarChart3 className="w-5 h-5 text-zinc-400" />}
              >
                <List
                  dataSource={statistics.byComponent?.slice(0, 10) || []}
                  renderItem={(item: any) => (
                    <List.Item className="border-0 py-2">
                      <List.Item.Meta
                        avatar={
                          <Avatar className="bg-gradient-to-br from-red-500 to-orange-500">
                            {item.name.split('_')[1]}
                          </Avatar>
                        }
                        title={<span className="text-white">{item.name}</span>}
                        description={
                          <Progress
                            percent={(item.value / 25) * 100}
                            showInfo={false}
                            strokeColor="#ff4d4f"
                            trailColor="#3f3f46"
                            size="small"
                          />
                        }
                      />
                      <span className="text-red-400 font-semibold">{item.value} 次</span>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          </Row>
        </TabPane>

        <TabPane tab="🗺️ 故障点位" key="heatmap">
          <HeatmapChart
            title="故障点位热力图（全阵列）"
            data={heatmapData}
            rows={10}
            cols={20}
            height={400}
          />
          <Card
            className="bg-zinc-900 border-zinc-800 mt-4"
            title="图例说明"
          >
            <Row gutter={[16, 16]}>
              {[
                { color: '#52c41a', label: '正常（无故障）', level: 0 },
                { color: '#95de64', label: '轻微风险', level: 1 },
                { color: '#faad14', label: '中等风险', level: 2 },
                { color: '#ff7a45', label: '高风险', level: 3 },
                { color: '#ff4d4f', label: '故障发生', level: 4 },
              ].map((item) => (
                <Col key={item.level} xs={12} sm={8} md={4}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-zinc-300 text-sm">{item.label}</span>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </TabPane>

        <TabPane tab="📋 故障列表" key="list">
          <Table
            columns={columns}
            dataSource={faultList}
            loading={loading}
            pagination={{
              current: faultPage,
              pageSize: faultPageSize,
              total: faultTotal,
              showSizeChanger: true,
              showQuickJumper: true,
              onChange: (page, pageSize) => {
                setFaultPage(page);
                setFaultPageSize(pageSize);
              },
            }}
            scroll={{ x: 900 }}
            rowKey="id"
          />
        </TabPane>
      </Tabs>
    </div>
  );
}

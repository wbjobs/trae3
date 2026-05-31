import { useState, useEffect } from 'react';
import { Row, Col, Card, Select, DatePicker, Space } from 'antd';
import {
  Zap,
  Gauge,
  Thermometer,
  Activity,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import dayjs from 'dayjs';

import StatCard from '@/components/charts/StatCard';
import TimeSeriesChart from '@/components/charts/TimeSeriesChart';
import HeatmapChart from '@/components/charts/HeatmapChart';
import FaultList from '@/components/charts/FaultList';
import type { KeyMetrics, TimeSeriesPoint, FaultRecord } from '@/types';
import { dataApi, faultApi } from '@/services/api';

const { RangePicker } = DatePicker;

export default function Dashboard() {
  const [keyMetrics, setKeyMetrics] = useState<KeyMetrics | null>(null);
  const [voltageData, setVoltageData] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [currentData, setCurrentData] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [temperatureData, setTemperatureData] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [faultList, setFaultList] = useState<FaultRecord[]>([]);
  const [faultTotal, setFaultTotal] = useState(0);
  const [faultPage, setFaultPage] = useState(1);
  const [faultPageSize, setFaultPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(24, 'hour'),
    dayjs(),
  ]);
  const [selectedComponents, setSelectedComponents] = useState<string[]>(['comp_001', 'comp_002', 'comp_003']);

  const fetchKeyMetrics = async () => {
    try {
      const response = await dataApi.getKeyMetrics();
      setKeyMetrics(response.data);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  const fetchTimeSeriesData = async () => {
    setLoading(true);
    try {
      const startTime = timeRange[0].valueOf();
      const endTime = timeRange[1].valueOf();

      const response = await dataApi.getTimeSeriesData({
        componentIds: selectedComponents,
        metrics: ['voltage', 'current', 'temperature'],
        startTime,
        endTime,
        step: '5m',
        downsample: true,
      });

      const data = response.data;
      const voltage: Record<string, TimeSeriesPoint[]> = {};
      const current: Record<string, TimeSeriesPoint[]> = {};
      const temperature: Record<string, TimeSeriesPoint[]> = {};

      Object.keys(data).forEach((componentId) => {
        voltage[componentId] = data[componentId].voltage;
        current[componentId] = data[componentId].current;
        temperature[componentId] = data[componentId].temperature;
      });

      setVoltageData(voltage);
      setCurrentData(current);
      setTemperatureData(temperature);
    } catch (error) {
      console.error('Failed to fetch time series:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFaultList = async () => {
    try {
      const response = await faultApi.getFaultList({
        startTime: timeRange[0].valueOf(),
        endTime: timeRange[1].valueOf(),
        page: faultPage,
        pageSize: faultPageSize,
      });
      setFaultList(response.data.list);
      setFaultTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch faults:', error);
    }
  };

  useEffect(() => {
    fetchKeyMetrics();
    fetchTimeSeriesData();
    fetchFaultList();

    const interval = setInterval(fetchKeyMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchTimeSeriesData();
  }, [timeRange, selectedComponents]);

  useEffect(() => {
    fetchFaultList();
  }, [faultPage, faultPageSize, timeRange]);

  const heatmapData = Array.from({ length: 10 }, (_, row) =>
    Array.from({ length: 20 }, (_, col) => ({
      row,
      col,
      value: Math.floor(Math.random() * 5),
      componentId: `comp_${row * 20 + col + 1}`,
      faultTypes: Math.random() > 0.7 ? ['temperature_high'] : [],
    }))
  ).flat();

  const componentOptions = Array.from({ length: 20 }, (_, i) => ({
    value: `comp_${String(i + 1).padStart(3, '0')}`,
    label: `组件 ${String(i + 1).padStart(3, '0')}`,
  }));

  return (
    <div className="space-y-6">
      <Card className="bg-zinc-900 border-zinc-800">
        <Space wrap>
          <RangePicker
            showTime
            value={timeRange}
            onChange={(dates) => dates && setTimeRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
            style={{ width: 400 }}
          />
          <Select
            mode="multiple"
            value={selectedComponents}
            onChange={setSelectedComponents}
            options={componentOptions}
            placeholder="选择组件"
            style={{ minWidth: 300, maxWidth: 500 }}
            maxTagCount={3}
          />
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={8} lg={4}>
          <StatCard
            title="总发电量"
            value={keyMetrics?.totalGeneration?.toFixed(2) || '0'}
            unit="kWh"
            trend={5.2}
            icon={<Zap className="w-full h-full text-white" />}
            color="blue"
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <StatCard
            title="当前功率"
            value={keyMetrics?.currentPower?.toFixed(2) || '0'}
            unit="kW"
            trend={-1.3}
            icon={<Activity className="w-full h-full text-white" />}
            color="green"
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <StatCard
            title="转换效率"
            value={keyMetrics?.efficiency?.toFixed(1) || '0'}
            unit="%"
            trend={2.1}
            icon={<Gauge className="w-full h-full text-white" />}
            color="purple"
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <StatCard
            title="在线率"
            value={keyMetrics?.onlineRate?.toFixed(1) || '0'}
            unit="%"
            trend={0.5}
            icon={<Clock className="w-full h-full text-white" />}
            color="yellow"
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <StatCard
            title="故障数量"
            value={keyMetrics?.faultCount || 0}
            icon={<AlertTriangle className="w-full h-full text-white" />}
            color="red"
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={4}>
          <StatCard
            title="平均温度"
            value={keyMetrics?.temperatureAvg?.toFixed(1) || '0'}
            unit="°C"
            trend={3.2}
            icon={<Thermometer className="w-full h-full text-white" />}
            color="yellow"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <TimeSeriesChart
            title="电压趋势"
            data={voltageData}
            loading={loading}
            yAxisName="电压 (V)"
            unit="V"
            height={300}
          />
        </Col>
        <Col xs={24} lg={12}>
          <TimeSeriesChart
            title="电流趋势"
            data={currentData}
            loading={loading}
            colors={['#52c41a', '#13c2c2', '#eb2f96']}
            yAxisName="电流 (A)"
            unit="A"
            height={300}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <TimeSeriesChart
            title="温度趋势"
            data={temperatureData}
            loading={loading}
            colors={['#faad14', '#ff4d4f', '#fa8c16']}
            yAxisName="温度 (°C)"
            unit="°C"
            height={300}
          />
        </Col>
        <Col xs={24} lg={12}>
          <HeatmapChart
            title="故障热力图 (A区阵列)"
            data={heatmapData}
            rows={10}
            cols={20}
            height={300}
          />
        </Col>
      </Row>

      <Card
        className="bg-zinc-900 border-zinc-800"
        title="近期故障告警"
        styles={{ body: { padding: 0 } }}
      >
        <FaultList
          data={faultList}
          total={faultTotal}
          page={faultPage}
          pageSize={faultPageSize}
          onPageChange={(page, pageSize) => {
            setFaultPage(page);
            setFaultPageSize(pageSize);
          }}
        />
      </Card>
    </div>
  );
}

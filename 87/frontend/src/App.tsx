import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Layout, Select, Row, Col, Badge, Space, Typography, Tag } from 'antd';
import {
  DashboardOutlined,
  WifiOutlined,
  DisconnectOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

import ChartPanel from './components/ChartPanel';
import MetricCard from './components/MetricCard';
import FilterBar from './components/FilterBar';
import FaultAlertPanel from './components/FaultAlertPanel';
import { useWebSocket } from './hooks/useWebSocket';
import { getDevices, getFaultStats, queryFaults } from './api/client';
import {
  SensorData,
  MetricResult,
  FaultAlert,
  Device,
  ParameterKey,
  WSMessage,
} from './types';

const { Header, Content } = Layout;
const { Title } = Typography;

const MAX_CHART_POINTS = 120;
const DATA_UPDATE_THROTTLE = 500;
const METRICS_UPDATE_THROTTLE = 1500;

const App: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('pump-001');
  const [selectedParams, setSelectedParams] = useState<ParameterKey[]>([
    'temperature', 'vibration', 'pressure',
  ]);
  const [timeRange, setTimeRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [metrics, setMetrics] = useState<MetricResult[]>([]);
  const [alerts, setAlerts] = useState<FaultAlert[]>([]);
  const [faultStats, setFaultStats] = useState({ total: 0, critical: 0, warning: 0, unacknowledged: 0 });
  const [connected, setConnected] = useState(false);

  const dataBufferRef = useRef<Map<string, SensorData[]>>(new Map());
  const lastDataUpdateRef = useRef<number>(0);
  const lastMetricsUpdateRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const sendRef = useRef<((data: unknown) => void) | null>(null);

  const currentData = useMemo(() => {
    return dataBufferRef.current.get(selectedDevice) || [];
  }, [selectedDevice, renderTick]);

  useEffect(() => {
    getDevices().then((res) => {
      setDevices(res.data || []);
    }).catch(console.error);
  }, []);

  const loadFaults = useCallback(async () => {
    try {
      const [faultRes, statsRes] = await Promise.all([
        queryFaults({ device_id: selectedDevice }),
        getFaultStats(),
      ]);
      setAlerts(faultRes.data || []);
      setFaultStats(statsRes.data || { total: 0, critical: 0, warning: 0, unacknowledged: 0 });
    } catch (e) {
      console.error(e);
    }
  }, [selectedDevice]);

  useEffect(() => {
    loadFaults();
    const timer = setInterval(loadFaults, 15000);
    return () => clearInterval(timer);
  }, [loadFaults]);

  const scheduleDataRender = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      const now = Date.now();
      if (now - lastDataUpdateRef.current >= DATA_UPDATE_THROTTLE) {
        lastDataUpdateRef.current = now;
        setRenderTick((t) => (t + 1) % 1000000);
      }
      rafIdRef.current = null;
    });
  }, []);

  const handleWSMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'realtime_data') {
      const data = msg.data as SensorData;
      const key = data.device_id;
      const buffer = dataBufferRef.current.get(key) || [];
      buffer.push(data);
      if (buffer.length > MAX_CHART_POINTS * 2) {
        buffer.splice(0, buffer.length - MAX_CHART_POINTS * 2);
      }
      dataBufferRef.current.set(key, buffer);
      if (key === selectedDevice) {
        scheduleDataRender();
      }
    } else if (msg.type === 'metrics_update') {
      const payload = msg.data as any;
      const now = Date.now();
      if (now - lastMetricsUpdateRef.current < METRICS_UPDATE_THROTTLE) return;
      lastMetricsUpdateRef.current = now;
      if (payload.device_id === selectedDevice && Array.isArray(payload.metrics)) {
        setMetrics(payload.metrics);
      } else if (Array.isArray(payload)) {
        setMetrics(payload);
      }
    } else if (msg.type === 'fault_alert') {
      const alert = msg.data as FaultAlert;
      setAlerts((prev) => [alert, ...prev].slice(0, 200));
      setFaultStats((prev) => ({
        ...prev,
        total: prev.total + 1,
        [alert.severity]: (prev[alert.severity] as number) + 1,
        unacknowledged: prev.unacknowledged + 1,
      }));
    }
  }, [selectedDevice, scheduleDataRender]);

  const wsHandlers = useMemo(() => ({
    onMessage: handleWSMessage,
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
    directPort: 8001,
  }), [handleWSMessage]);

  const { send } = useWebSocket(wsHandlers);
  sendRef.current = send;

  useEffect(() => {
    if (connected && sendRef.current) {
      sendRef.current({ type: 'subscribe', device_id: selectedDevice });
    }
  }, [connected, selectedDevice]);

  const handleRefresh = useCallback(() => {
    dataBufferRef.current.clear();
    setRenderTick((t) => t + 1);
    loadFaults();
  }, [loadFaults]);

  const handleAcknowledge = useCallback((id: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
    setFaultStats((prev) => ({ ...prev, unacknowledged: Math.max(0, prev.unacknowledged - 1) }));
  }, []);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <Space>
          <DashboardOutlined style={{ fontSize: 22, color: '#4fc3f7' }} />
          <Title level={4} style={{ margin: 0, color: '#fff' }}>
            工业数据监控平台
          </Title>
        </Space>
        <Space>
          <Select
            value={selectedDevice}
            onChange={setSelectedDevice}
            style={{ width: 180 }}
            options={devices.map((d) => ({ label: d.name, value: d.id }))}
          />
          <Tag color={connected ? 'green' : 'red'} icon={connected ? <WifiOutlined /> : <DisconnectOutlined />}>
            {connected ? '已连接' : '断开'}
          </Tag>
          <Badge count={faultStats.unacknowledged}>
            <Tag color={faultStats.critical > 0 ? 'red' : 'green'}>
              告警 {faultStats.critical}/{faultStats.total}
            </Tag>
          </Badge>
        </Space>
      </Header>

      <Content style={{ padding: 16 }}>
        <FilterBar
          devices={devices}
          selectedDevice={selectedDevice}
          onDeviceChange={setSelectedDevice}
          selectedParams={selectedParams}
          onParamsChange={setSelectedParams}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          onRefresh={handleRefresh}
        />

        {metrics.length > 0 && (
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {metrics.map((m) => (
              <Col xs={24} sm={12} md={8} lg={4} key={m.parameter}>
                <MetricCard metric={m} />
              </Col>
            ))}
          </Row>
        )}

        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {selectedParams.map((param) => (
            <Col xs={24} md={12} xl={8} key={param}>
              <ChartPanel
                deviceId={selectedDevice}
                parameter={param}
                data={currentData}
              />
            </Col>
          ))}
        </Row>

        <FaultAlertPanel
          alerts={alerts}
          stats={faultStats}
          onAcknowledge={handleAcknowledge}
        />
      </Content>
    </Layout>
  );
};

export default App;

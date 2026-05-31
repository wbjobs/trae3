import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Database, BarChart3, History, AlertTriangle } from 'lucide-react';
import { StatCard } from '../components/Dashboard/StatCard';
import { ConsumptionChart, StatusDistributionChart } from '../components/Dashboard/Charts';
import { ConsumptionTrendChart } from '../components/Dashboard/ConsumptionTrendChart';
import { TrendReplay } from '../components/Dashboard/TrendReplay';
import { AnomalyAlertPanel } from '../components/Dashboard/AnomalyAlertPanel';
import { AlertList } from '../components/Dashboard/AlertList';
import { DeviceTable } from '../components/Dashboard/DeviceTable';
import { DataFilterPanel } from '../components/DataFilter/DataFilterPanel';
import { ErrorBoundary } from '../components/Common/ErrorBoundary';
import {
  StatCardSkeleton,
  ChartSkeleton,
  AlertListSkeleton,
  TableSkeleton
} from '../components/Common/Skeleton';
import { useDashboardStore } from '../stores/dashboardStore';
import type { StatCardData, DataFilter, AreaInfo } from '../types';
import { deviceApi } from '../services/api';
import { usePolling } from '../hooks/useDebounce';

type ActiveTab = 'overview' | 'trend' | 'replay' | 'anomalies';

export default function Dashboard() {
  const { overview, devices, alerts, loading, fetchOverview, fetchDevices, fetchAlerts, handleAlert, initMockData } =
    useDashboardStore();
  const [areas, setAreas] = useState<AreaInfo[]>([]);
  const [deviceFilter, setDeviceFilter] = useState<DataFilter>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const deviceFilterRef = useRef<DataFilter>({});

  useEffect(() => {
    deviceFilterRef.current = deviceFilter;
  }, [deviceFilter]);

  const loadAllData = useCallback(async () => {
    try {
      await Promise.all([
        fetchOverview(),
        fetchDevices(deviceFilterRef.current),
        fetchAlerts()
      ]);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }, [fetchOverview, fetchDevices, fetchAlerts]);

  const loadAreas = useCallback(async () => {
    try {
      const response = await deviceApi.getAreas();
      setAreas(response.data);
    } catch (error) {
      console.error('Failed to load areas:', error);
    }
  }, []);

  useEffect(() => {
    loadAreas();
  }, [loadAreas]);

  const { isPolling, refreshNow } = usePolling(loadAllData, {
    interval: 15000,
    enabled: true
  });

  const handleDeviceFilterChange = useCallback((filter: DataFilter) => {
    setDeviceFilter(filter);
    fetchDevices(filter);
  }, [fetchDevices]);

  const handleDevicePageChange = useCallback((page: number) => {
    const newFilter = { ...deviceFilterRef.current, page };
    setDeviceFilter(newFilter);
    fetchDevices(newFilter);
  }, [fetchDevices]);

  const handleInitMockData = async () => {
    try {
      await initMockData();
      await loadAreas();
    } catch (error) {
      console.error('Failed to initialize mock data:', error);
    }
  };

  const handleReset = useCallback(() => {
    loadAllData();
  }, [loadAllData]);

  const statCards: StatCardData[] = overview
    ? [
        {
          title: '设备总数',
          value: overview.totalDevices,
          unit: '台',
          icon: 'gauge',
          color: 'bg-blue-500',
          trend: 5.2
        },
        {
          title: '在线设备',
          value: overview.onlineDevices,
          unit: '台',
          icon: 'activity',
          color: 'bg-green-500',
          trend: 2.8
        },
        {
          title: '今日告警',
          value: overview.todayAlerts,
          unit: '条',
          icon: 'alert',
          color: 'bg-orange-500',
          trend: -15.3
        },
        {
          title: '今日用水量',
          value: overview.todayConsumption.toFixed(2),
          unit: 'm³',
          icon: 'droplets',
          color: 'bg-cyan-500',
          trend: 8.1
        }
      ]
    : [];

  const tabOptions: Array<{ value: ActiveTab; label: string; icon: React.ReactNode }> = [
    { value: 'overview', label: '实时概览', icon: <BarChart3 className="w-4 h-4" /> },
    { value: 'trend', label: '趋势分析', icon: <BarChart3 className="w-4 h-4" /> },
    { value: 'replay', label: '历史回放', icon: <History className="w-4 h-4" /> },
    { value: 'anomalies', label: '异常告警', icon: <AlertTriangle className="w-4 h-4" /> }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <>
            <ErrorBoundary onReset={handleReset}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {loading || !overview
                  ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
                  : statCards.map((card, index) => (
                      <ErrorBoundary key={index} onReset={handleReset}>
                        <StatCard data={card} />
                      </ErrorBoundary>
                    ))}
              </div>
            </ErrorBoundary>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <ErrorBoundary onReset={handleReset}>
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">24小时用水量趋势</h3>
                  {loading || !overview?.hourlyConsumption ? (
                    <ChartSkeleton />
                  ) : (
                    <ErrorBoundary onReset={handleReset}>
                      <ConsumptionChart data={overview.hourlyConsumption} />
                    </ErrorBoundary>
                  )}
                </div>
              </ErrorBoundary>

              <ErrorBoundary onReset={handleReset}>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">设备状态分布</h3>
                  {loading || !overview?.deviceStatusDistribution ? (
                    <ChartSkeleton />
                  ) : (
                    <ErrorBoundary onReset={handleReset}>
                      <StatusDistributionChart distribution={overview.deviceStatusDistribution} />
                    </ErrorBoundary>
                  )}
                </div>
              </ErrorBoundary>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ErrorBoundary onReset={handleReset}>
                {loading || !alerts ? (
                  <AlertListSkeleton />
                ) : (
                  <ErrorBoundary onReset={handleReset}>
                    <AlertList alerts={alerts.list.slice(0, 5)} onHandle={handleAlert} />
                  </ErrorBoundary>
                )}
              </ErrorBoundary>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">系统说明</h3>
                <div className="space-y-4 text-sm text-gray-600">
                  <p>
                    <strong className="text-gray-800">数据接收服务：</strong>
                    支持海量水表终端实时上报用水数据，支持单条和批量上报
                  </p>
                  <p>
                    <strong className="text-gray-800">幂等性保障：</strong>
                    通过nonce和唯一索引防止重复数据，确保数据一致性
                  </p>
                  <p>
                    <strong className="text-gray-800">聚合计算：</strong>
                    多级缓存机制，小时用水量聚合查询从24次优化为1次
                  </p>
                  <p>
                    <strong className="text-gray-800">异常检测：</strong>
                    6种用水异常智能识别：流量突增/骤降、管道泄漏、无流量、用水异常、逆向流
                  </p>
                  <p>
                    <strong className="text-gray-800">趋势回放：</strong>
                    支持多时间跨度历史数据动态回放，自动标记异常时段
                  </p>
                </div>
              </div>
            </div>

            <ErrorBoundary onReset={handleReset}>
              <DataFilterPanel areas={areas} onFilterChange={handleDeviceFilterChange} />
            </ErrorBoundary>

            <ErrorBoundary onReset={handleReset}>
              {loading || !devices ? (
                <TableSkeleton rows={5} />
              ) : (
                <ErrorBoundary onReset={handleReset}>
                  <DeviceTable data={devices} onPageChange={handleDevicePageChange} />
                </ErrorBoundary>
              )}
            </ErrorBoundary>
          </>
        );

      case 'trend':
        return <ConsumptionTrendChart areas={areas} />;

      case 'replay':
        return <TrendReplay areas={areas} />;

      case 'anomalies':
        return <AnomalyAlertPanel areas={areas} onAlertHandled={handleAlertHandled} />;
    }
  };

  const handleAlertHandled = useCallback(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={refreshNow}
            disabled={isPolling || loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${(isPolling || loading) ? 'animate-spin' : ''}`} />
            {isPolling ? '刷新中...' : '刷新数据'}
          </button>
          <button
            onClick={handleInitMockData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            <Database className="w-4 h-4" />
            初始化模拟数据
          </button>
        </div>
        {isPolling && (
          <span className="text-sm text-gray-500 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            实时同步中
          </span>
        )}
      </div>

      <div className="flex bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {tabOptions.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
              activeTab === tab.value
                ? 'bg-white text-cyan-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[600px]">
        {renderTabContent()}
      </div>
    </div>
  );
}

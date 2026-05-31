import { useState, useEffect, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { RefreshCw, Cpu, Server, Activity, HardDrive, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store/useStore';
import { api } from '../utils/api';
import StatCard, { StatCardGrid } from '../components/StatCard';
import { ResourceGaugeCard } from '../components/ResourceGauge';
import { AlertList } from '../components/AlertItem';
import type { TaskStatus, NodeMetrics, DashboardStats } from '../../shared/types';

export default function Dashboard() {
  const { dashboardStats, alerts, nodeMetrics, setDashboardStats, setAlerts, setLoading, setError, loading, error } = useAppStore();
  const [resourceData, setResourceData] = useState<{ timestamps: string[]; cpu: number[]; memory: number[]; disk: number[] }>({
    timestamps: [],
    cpu: [],
    memory: [],
    disk: [],
  });
  const [taskTrend, setTaskTrend] = useState<{ dates: string[]; completed: number[]; running: number[]; failed: number[] }>({
    dates: [],
    completed: [],
    running: [],
    failed: [],
  });
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, alertsRes, trendRes, usageRes] = await Promise.all([
        api.getDashboardStats(),
        api.getAlerts({ pageSize: 10, resolved: false }),
        api.getTaskTrend(7),
        api.getResourceUsage(),
      ]);

      if (statsRes.success && statsRes.data) {
        setDashboardStats(statsRes.data as DashboardStats);
      }

      if (alertsRes.success && alertsRes.data) {
        setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : []);
      }

      if (trendRes.success && trendRes.data) {
        const trendData = trendRes.data as { dates: string[]; completed: number[]; running: number[]; failed: number[] };
        setTaskTrend(trendData);
      }

      if (usageRes.success && usageRes.data) {
        const usage = usageRes.data as { timestamps: string[]; cpu: number[]; memory: number[]; disk: number[] };
        setResourceData(usage);
      }

      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [setDashboardStats, setAlerts, setLoading, setError]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const taskStatusOption = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: '#94a3b8' },
    },
    series: [
      {
        name: '任务状态',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#0f172a',
          borderWidth: 2,
        },
        label: {
          show: false,
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold',
            color: '#fff',
          },
        },
        labelLine: {
          show: false,
        },
        data: [
          { value: dashboardStats?.pendingTasks ?? 0, name: '等待中', itemStyle: { color: '#64748b' } },
          { value: dashboardStats?.runningTasks ?? 0, name: '运行中', itemStyle: { color: '#14b8a6' } },
          { value: dashboardStats?.completedTasks ?? 0, name: '已完成', itemStyle: { color: '#22c55e' } },
          { value: dashboardStats?.failedTasks ?? 0, name: '失败', itemStyle: { color: '#ef4444' } },
        ],
      },
    ],
  };

  const taskTrendOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
    },
    legend: {
      data: ['已完成', '运行中', '失败'],
      textStyle: { color: '#94a3b8' },
      top: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: taskTrend.dates,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b' },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      {
        name: '已完成',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#22c55e', width: 2 },
        itemStyle: { color: '#22c55e' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(34, 197, 94, 0.3)' },
              { offset: 1, color: 'rgba(34, 197, 94, 0)' },
            ],
          },
        },
        data: taskTrend.completed,
      },
      {
        name: '运行中',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#14b8a6', width: 2 },
        itemStyle: { color: '#14b8a6' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(20, 184, 166, 0.3)' },
              { offset: 1, color: 'rgba(20, 184, 166, 0)' },
            ],
          },
        },
        data: taskTrend.running,
      },
      {
        name: '失败',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: '#ef4444', width: 2 },
        itemStyle: { color: '#ef4444' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(239, 68, 68, 0.3)' },
              { offset: 1, color: 'rgba(239, 68, 68, 0)' },
            ],
          },
        },
        data: taskTrend.failed,
      },
    ],
  };

  const resourceUsageOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
    },
    legend: {
      data: ['CPU', '内存', '磁盘'],
      textStyle: { color: '#94a3b8' },
      top: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: resourceData.timestamps,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b', formatter: (value: string) => value.slice(11, 19) },
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b', formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      {
        name: 'CPU',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#14b8a6', width: 2 },
        itemStyle: { color: '#14b8a6' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(20, 184, 166, 0.2)' },
              { offset: 1, color: 'rgba(20, 184, 166, 0)' },
            ],
          },
        },
        data: resourceData.cpu,
      },
      {
        name: '内存',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#3b82f6', width: 2 },
        itemStyle: { color: '#3b82f6' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.2)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0)' },
            ],
          },
        },
        data: resourceData.memory,
      },
      {
        name: '磁盘',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#f59e0b', width: 2 },
        itemStyle: { color: '#f59e0b' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(245, 158, 11, 0.2)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0)' },
            ],
          },
        },
        data: resourceData.disk,
      },
    ],
  };

  const avgCpu = dashboardStats?.avgCpuUsage ?? 0;
  const avgMemory = dashboardStats?.avgMemoryUsage ?? 0;
  const onlineRate = dashboardStats?.totalNodes ? ((dashboardStats.onlineNodes / dashboardStats.totalNodes) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">系统仪表盘</h2>
          <p className="text-sm text-industrial-400 mt-1">
            实时监控系统运行状态 · 最后更新: {lastUpdate.toLocaleTimeString('zh-CN')}
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-space-700 hover:bg-space-600 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新数据
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-lg text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      <StatCardGrid stats={dashboardStats ?? {}} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="平均CPU使用率"
          value={`${avgCpu.toFixed(1)}%`}
          icon={<Cpu className="w-5 h-5" />}
          colorVariant={avgCpu >= 90 ? 'error' : avgCpu >= 70 ? 'warning' : 'cyber'}
          trend={avgCpu - 65}
          trendLabel="较基准"
        />
        <StatCard
          title="平均内存使用率"
          value={`${avgMemory.toFixed(1)}%`}
          icon={<Server className="w-5 h-5" />}
          colorVariant={avgMemory >= 90 ? 'error' : avgMemory >= 70 ? 'warning' : 'cyber'}
          trend={avgMemory - 60}
          trendLabel="较基准"
        />
        <StatCard
          title="节点在线率"
          value={`${onlineRate}%`}
          icon={<Activity className="w-5 h-5" />}
          colorVariant={Number(onlineRate) >= 95 ? 'success' : Number(onlineRate) >= 80 ? 'warning' : 'error'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-space-700 bg-space-900/50 backdrop-blur-sm p-5">
          <h3 className="text-sm font-semibold text-industrial-200 mb-4">任务状态分布</h3>
          <div className="h-72">
            <ReactECharts option={taskStatusOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        <div className="rounded-xl border border-space-700 bg-space-900/50 backdrop-blur-sm p-5">
          <h3 className="text-sm font-semibold text-industrial-200 mb-4">任务趋势（近7天）</h3>
          <div className="h-72">
            <ReactECharts option={taskTrendOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-space-700 bg-space-900/50 backdrop-blur-sm p-5">
          <h3 className="text-sm font-semibold text-industrial-200 mb-4">资源使用率趋势</h3>
          <div className="h-72">
            <ReactECharts option={resourceUsageOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        <ResourceGaugeCard
          cpu={avgCpu}
          memory={avgMemory}
          disk={65}
          title="集群资源概览"
          subtitle="全集群平均资源使用情况"
        />
      </div>

      <div className="rounded-xl border border-space-700 bg-space-900/50 backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-industrial-200">实时告警</h3>
          <span className="text-xs text-industrial-400">共 {alerts.filter(a => !a.resolved).length} 条未处理</span>
        </div>
        <AlertList alerts={alerts.slice(0, 5)} maxItems={5} />
      </div>
    </div>
  );
}

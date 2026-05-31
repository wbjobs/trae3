import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useMemo } from 'react';
import { useMonitorStore } from '../store/monitorStore';
import type { MetricPoint } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend);

interface MetricsChartProps {
  nodeId: string;
  title: string;
  customData?: MetricPoint[];
}

export function MetricsChart({ nodeId, title, customData }: MetricsChartProps) {
  const { realtimeMetrics, history, isHistoryMode, historyCursor } = useMonitorStore();

  const dataPoints = useMemo(() => {
    if (customData) {
      return customData;
    }
    if (isHistoryMode) {
      const nodeHistory = history[nodeId] || [];
      return nodeHistory.slice(0, historyCursor + 1);
    }
    return realtimeMetrics[nodeId] || [];
  }, [customData, isHistoryMode, history, nodeId, historyCursor, realtimeMetrics]);

  const chartData = useMemo(() => {
    const labels = dataPoints.map((p) => {
      const d = new Date(p.timestamp);
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    });

    return {
      labels,
      datasets: [
        {
          label: 'CPU %',
          data: dataPoints.map((p) => p.cpu_usage),
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0, 212, 255, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: '内存 %',
          data: dataPoints.map((p) => p.memory_usage),
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: '磁盘 %',
          data: dataPoints.map((p) => p.disk_usage),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    };
  }, [dataPoints]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: isHistoryMode ? 0 : 300 },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { color: '#94a3b8', usePointStyle: true, padding: 20 },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        titleColor: '#fff',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(148, 163, 184, 0.2)',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        display: true,
        grid: { color: 'rgba(148, 163, 184, 0.1)' },
        ticks: { color: '#64748b', maxTicksLimit: 10 },
      },
      y: {
        display: true,
        min: 0,
        max: 100,
        grid: { color: 'rgba(148, 163, 184, 0.1)' },
        ticks: { color: '#64748b', callback: (v: number) => `${v}%` },
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
  };

  return (
    <div className="rounded-xl bg-slate-800/50 p-5 backdrop-blur">
      <h3 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
        {title}
        {isHistoryMode && (
          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">
            历史数据
          </span>
        )}
      </h3>
      <div className="h-64">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
}

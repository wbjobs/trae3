import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { AlertStats } from '@/types';

interface AlertStatsChartProps {
  stats: AlertStats;
}

export default function AlertStatsChart({ stats }: AlertStatsChartProps) {
  const pieOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(6, 182, 212, 0.3)',
      textStyle: { color: '#fff' },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#94a3b8', fontSize: 11 },
      itemWidth: 12,
      itemHeight: 12,
    },
    series: [
      {
        name: '告警级别',
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '40%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: '#1e293b',
          borderWidth: 2,
        },
        label: { show: false },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold',
            color: '#fff',
          },
        },
        data: [
          {
            value: stats.by_level.critical || 0,
            name: '严重',
            itemStyle: { color: '#ef4444' },
          },
          {
            value: stats.by_level.warning || 0,
            name: '警告',
            itemStyle: { color: '#f59e0b' },
          },
          {
            value: stats.by_level.info || 0,
            name: '信息',
            itemStyle: { color: '#3b82f6' },
          },
        ],
      },
    ],
  };

  const barOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(6, 182, 212, 0.3)',
      textStyle: { color: '#fff' },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: stats.top_metrics.map((m) => m.metric),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 10, rotate: 30 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      {
        type: 'bar',
        data: stats.top_metrics.map((m, idx) => ({
          value: m.count,
          itemStyle: {
            color: ['#ef4444', '#f59e0b', '#f97316', '#eab308', '#84cc16'][idx] || '#06b6d4',
            borderRadius: [4, 4, 0, 0],
          },
        })),
        barWidth: '50%',
      },
    ],
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
        <h3 className="font-medium mb-4">告警级别分布</h3>
        <ReactECharts option={pieOption} style={{ height: 200 }} />
      </div>
      <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
        <h3 className="font-medium mb-4">Top异常指标</h3>
        <ReactECharts option={barOption} style={{ height: 200 }} />
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { Calendar, Clock, TrendingUp, Activity, BarChart2 } from 'lucide-react';
import { dataApi } from '../../services/api';
import type { ConsumptionStats, AreaInfo } from '../../types';
import { ChartSkeleton } from '../Common/Skeleton';
import { ErrorBoundary } from '../Common/ErrorBoundary';

interface ConsumptionTrendChartProps {
  areas: AreaInfo[];
}

type ViewMode = 'hourly' | 'daily' | 'weekly' | 'monthly';

export const ConsumptionTrendChart: React.FC<ConsumptionTrendChartProps> = ({ areas }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [selectedArea, setSelectedArea] = useState<string>('');
  const [stats, setStats] = useState<ConsumptionStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await dataApi.getConsumptionStats({
        areaId: selectedArea || undefined
      });
      setStats(response.data);
    } catch (err) {
      setError('加载统计数据失败');
      console.error('Failed to load consumption stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [viewMode, selectedArea]);

  const chartData = useMemo(() => {
    if (!stats) return { xAxis: [], series: [] };

    switch (viewMode) {
      case 'hourly':
        return {
          xAxis: stats.hourly.map(d => `${d.hour}:00`),
          series: stats.hourly.map(d => d.consumption)
        };
      case 'daily':
        return {
          xAxis: stats.daily.map(d => d.date.slice(5)),
          series: stats.daily.map(d => d.consumption)
        };
      case 'weekly':
        return {
          xAxis: stats.weekly.map(d => `第${d.week}周`),
          series: stats.weekly.map(d => d.consumption)
        };
      case 'monthly':
        return {
          xAxis: stats.monthly.map(d => d.month),
          series: stats.monthly.map(d => d.consumption)
        };
    }
  }, [stats, viewMode]);

  useEffect(() => {
    if (!chartRef.current || loading || !stats) return;

    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        textStyle: { color: '#374151' },
        formatter: (params: any) => {
          const data = params[0];
          return `<div style="font-weight: 600; margin-bottom: 4px;">${data.name}</div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #06b6d4;"></span>
                    <span>用水量: <strong>${data.value.toFixed(2)}</strong> m³</span>
                  </div>`;
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: chartData.xAxis,
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { 
          color: '#6b7280',
          fontSize: 11,
          rotate: viewMode === 'daily' ? 45 : 0
        }
      },
      yAxis: {
        type: 'value',
        name: 'm³',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f3f4f6', type: 'dashed' } },
        axisLabel: { color: '#6b7280', fontSize: 11 }
      },
      series: [
        {
          type: 'bar',
          data: chartData.series,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#06b6d4' },
              { offset: 1, color: '#0891b2' }
            ]),
            borderRadius: [4, 4, 0, 0]
          },
          emphasis: {
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#0891b2' },
                { offset: 1, color: '#0e7490' }
              ])
            }
          },
          barMaxWidth: 30
        }
      ]
    };

    chartInstanceRef.current.setOption(option);

    const handleResize = () => {
      chartInstanceRef.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [chartData, loading, stats, viewMode]);

  useEffect(() => {
    return () => {
      chartInstanceRef.current?.dispose();
      chartInstanceRef.current = null;
    };
  }, []);

  const viewModeOptions: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
    { value: 'hourly', label: '24小时', icon: <Clock className="w-4 h-4" /> },
    { value: 'daily', label: '30天', icon: <Calendar className="w-4 h-4" /> },
    { value: 'weekly', label: '12周', icon: <BarChart2 className="w-4 h-4" /> },
    { value: 'monthly', label: '12月', icon: <TrendingUp className="w-4 h-4" /> }
  ];

  const totalConsumption = useMemo(() => {
    if (!stats) return 0;
    const series = {
      hourly: stats.hourly,
      daily: stats.daily,
      weekly: stats.weekly,
      monthly: stats.monthly
    }[viewMode];
    return series.reduce((sum, d) => sum + d.consumption, 0);
  }, [stats, viewMode]);

  const maxConsumption = useMemo(() => {
    if (!stats) return 0;
    const series = {
      hourly: stats.hourly,
      daily: stats.daily,
      weekly: stats.weekly,
      monthly: stats.monthly
    }[viewMode];
    return Math.max(...series.map(d => d.consumption));
  }, [stats, viewMode]);

  return (
    <ErrorBoundary>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">用水趋势分析</h3>
            <p className="text-sm text-gray-500">多维度用水量统计与趋势分析</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">全部区域</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>

            <div className="flex bg-gray-100 rounded-lg p-1">
              {viewModeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setViewMode(option.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    viewMode === option.value
                      ? 'bg-white text-cyan-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-cyan-600 text-sm font-medium mb-1">
              <Activity className="w-4 h-4" />
              总用水量
            </div>
            <div className="text-2xl font-bold text-gray-800">
              {totalConsumption.toFixed(1)}
              <span className="text-sm font-normal text-gray-500 ml-1">m³</span>
            </div>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-orange-600 text-sm font-medium mb-1">
              <TrendingUp className="w-4 h-4" />
              峰值用量
            </div>
            <div className="text-2xl font-bold text-gray-800">
              {maxConsumption.toFixed(1)}
              <span className="text-sm font-normal text-gray-500 ml-1">m³</span>
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-600 text-sm font-medium mb-1">
              <BarChart2 className="w-4 h-4" />
              平均用量
            </div>
            <div className="text-2xl font-bold text-gray-800">
              {(totalConsumption / Math.max(chartData.series.length, 1)).toFixed(1)}
              <span className="text-sm font-normal text-gray-500 ml-1">m³</span>
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-purple-600 text-sm font-medium mb-1">
              <Calendar className="w-4 h-4" />
              数据点数
            </div>
            <div className="text-2xl font-bold text-gray-800">
              {chartData.series.length}
              <span className="text-sm font-normal text-gray-500 ml-1">个</span>
            </div>
          </div>
        </div>

        {loading ? (
          <ChartSkeleton />
        ) : error ? (
          <div className="flex items-center justify-center h-80 text-red-500">
            {error}
          </div>
        ) : (
          <div ref={chartRef} className="w-full h-80" />
        )}
      </div>
    </ErrorBoundary>
  );
};

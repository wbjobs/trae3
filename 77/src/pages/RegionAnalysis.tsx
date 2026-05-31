import { useEffect, useState, useCallback, useRef } from 'react';
import { Map, TrendingUp, TrendingDown, BarChart3, RefreshCw, Layers, GitCompare, Activity } from 'lucide-react';
import * as echarts from 'echarts';
import { api } from '@/services/api';
import type { RegionData, HeatmapPoint, CorrelationResult } from '@/types';
import { formatTime } from '@/utils/time';

export default function RegionAnalysis() {
  const [regions, setRegions] = useState<RegionData[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);
  const [correlation, setCorrelation] = useState<CorrelationResult | null>(null);
  const [selectedRegionA, setSelectedRegionA] = useState<string>('东区');
  const [selectedRegionB, setSelectedRegionB] = useState<string>('西区');
  const [selectedMetric, setSelectedMetric] = useState<string>('pressure');
  const [loading, setLoading] = useState(false);
  const [compareChartType, setCompareChartType] = useState<'bar' | 'line'>('bar');

  const heatmapRef = useRef<HTMLDivElement>(null);
  const compareChartRef = useRef<HTMLDivElement>(null);
  const heatmapInstance = useRef<echarts.ECharts | null>(null);
  const compareChartInstance = useRef<echarts.ECharts | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [regionsData, heatmapDataResult] = await Promise.all([
        api.getRegions(),
        api.getHeatmap(selectedMetric),
      ]);
      setRegions(regionsData);
      setHeatmapData(heatmapDataResult);
    } catch (error) {
      console.error('Failed to load region data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMetric]);

  const loadCorrelation = useCallback(async () => {
    try {
      const result = await api.getCorrelation(
        selectedRegionA,
        selectedRegionB
      );
      setCorrelation(result);
    } catch (error) {
      console.error('Failed to load correlation:', error);
    }
  }, [selectedRegionA, selectedRegionB]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    loadCorrelation();
  }, [loadCorrelation]);

  useEffect(() => {
    if (!heatmapRef.current || !heatmapData.length) return;

    if (!heatmapInstance.current) {
      heatmapInstance.current = echarts.init(heatmapRef.current);
    }

    const xAxis = [...new Set(heatmapData.map(d => d.x))].sort();
    const yAxis = [...new Set(heatmapData.map(d => d.y))].sort();
    const data = heatmapData.map(d => [xAxis.indexOf(d.x), yAxis.indexOf(d.y), d.value]);

    const option: echarts.EChartsOption = {
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          const d = heatmapData[params.dataIndex];
          return `${d.x} - ${d.y}<br/>${selectedMetric}: ${d.value.toFixed(3)}`;
        }
      },
      grid: {
        left: 60,
        right: 20,
        top: 10,
        bottom: 40,
      },
      xAxis: {
        type: 'category',
        data: xAxis,
        axisLabel: { fontSize: 11, color: '#9ca3af' },
        axisLine: { lineStyle: { color: 'rgba(115, 243, 255, 0.3)' } },
      },
      yAxis: {
        type: 'category',
        data: yAxis,
        axisLabel: { fontSize: 11, color: '#9ca3af' },
        axisLine: { lineStyle: { color: 'rgba(115, 243, 255, 0.3)' } },
      },
      visualMap: {
        min: Math.min(...heatmapData.map(d => d.value)),
        max: Math.max(...heatmapData.map(d => d.value)),
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        inRange: {
          color: ['#1e3a5f', '#1e4d6b', '#2563eb', '#3b82f6', '#73f3ff', '#22d3ee']
        },
        textStyle: { color: '#9ca3af', fontSize: 10 },
      },
      series: [{
        name: selectedMetric,
        type: 'heatmap',
        data: data,
        label: { show: false },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(115, 243, 255, 0.5)'
          }
        }
      }]
    };

    heatmapInstance.current.setOption(option);

    const handleResize = () => heatmapInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      heatmapInstance.current?.dispose();
      heatmapInstance.current = null;
    };
  }, [heatmapData, selectedMetric]);

  useEffect(() => {
    if (!compareChartRef.current || regions.length < 2) return;

    if (!compareChartInstance.current) {
      compareChartInstance.current = echarts.init(compareChartRef.current);
    }

    const metrics = ['pressure', 'flow_rate', 'avg_pressure', 'alert_count'];
    const metricLabels = ['压力 (MPa)', '流量 (m³/h)', '平均压力 (MPa)', '告警数'];
    const regionA = regions.find(r => r.name === selectedRegionA);
    const regionB = regions.find(r => r.name === selectedRegionB);

    if (!regionA || !regionB) return;

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: 'rgba(115, 243, 255, 0.3)',
        textStyle: { color: '#e5e7eb' }
      },
      legend: {
        data: [selectedRegionA, selectedRegionB],
        top: 0,
        textStyle: { color: '#9ca3af', fontSize: 11 },
      },
      grid: {
        left: 60,
        right: 20,
        top: 35,
        bottom: 30,
      },
      xAxis: {
        type: 'category',
        data: metricLabels,
        axisLabel: { fontSize: 11, color: '#9ca3af' },
        axisLine: { lineStyle: { color: 'rgba(115, 243, 255, 0.3)' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 11, color: '#9ca3af' },
        splitLine: { lineStyle: { color: 'rgba(115, 243, 255, 0.1)' } },
      },
      series: [
        {
          name: selectedRegionA,
          type: compareChartType,
          data: [regionA.avg_pressure, regionA.avg_flow_rate, regionA.avg_pressure, regionA.alert_count],
          itemStyle: { color: '#22d3ee', borderRadius: [4, 4, 0, 0] },
          lineStyle: { width: 3, color: '#22d3ee' },
          areaStyle: compareChartType === 'line' ? {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(34, 211, 238, 0.3)' },
              { offset: 1, color: 'rgba(34, 211, 238, 0.05)' }
            ])
          } : undefined,
          barWidth: '35%',
        },
        {
          name: selectedRegionB,
          type: compareChartType,
          data: [regionB.avg_pressure, regionB.avg_flow_rate, regionB.avg_pressure, regionB.alert_count],
          itemStyle: { color: '#8b5cf6', borderRadius: [4, 4, 0, 0] },
          lineStyle: { width: 3, color: '#8b5cf6' },
          areaStyle: compareChartType === 'line' ? {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(139, 92, 246, 0.3)' },
              { offset: 1, color: 'rgba(139, 92, 246, 0.05)' }
            ])
          } : undefined,
          barWidth: '35%',
        }
      ]
    };

    compareChartInstance.current.setOption(option);

    const handleResize = () => compareChartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      compareChartInstance.current?.dispose();
      compareChartInstance.current = null;
    };
  }, [regions, selectedRegionA, selectedRegionB, compareChartType]);

  const getRegionStatus = (region: RegionData) => {
    if (region.alert_count > 3) return 'critical';
    if (region.alert_count > 0) return 'warning';
    return 'normal';
  };

  const statusColors = {
    normal: 'border-status-success/50 bg-status-success/10',
    warning: 'border-status-warning/50 bg-status-warning/10',
    critical: 'border-status-error/50 bg-status-error/10',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">区域联动分析</h1>
          <p className="text-gray-400">多区域数据关联、热力图可视化、联动对比分析</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="px-3 py-2 rounded-lg bg-bg-secondary border border-border-glow text-sm focus:outline-none focus:border-accent-cyan/50"
          >
            <option value="pressure">压力分布</option>
            <option value="flow_rate">流量分布</option>
            <option value="alert_count">告警分布</option>
          </select>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/50 hover:bg-accent-cyan/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {regions.map(region => (
          <div
            key={region.name}
            className={`bg-bg-secondary/60 backdrop-blur-sm rounded-xl border ${statusColors[getRegionStatus(region) as keyof typeof statusColors]} p-4`}
          >
            <div className="flex items-center gap-2 mb-3">
              <Map className="w-4 h-4 text-accent-cyan" />
              <span className="font-medium">{region.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-gray-500 text-xs">平均压力</div>
                <div className="font-mono">{region.avg_pressure.toFixed(3)}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">平均流量</div>
                <div className="font-mono">{region.avg_flow_rate.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">管线数量</div>
                <div className="font-mono">{region.pipeline_count}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">活跃告警</div>
                <div className={`font-mono ${region.alert_count > 0 ? 'text-status-error' : 'text-status-success'}`}>
                  {region.alert_count}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
          <h2 className="font-medium mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent-cyan" />
            热力图 - {selectedMetric === 'pressure' ? '压力分布' : selectedMetric === 'flow_rate' ? '流量分布' : '告警分布'}
          </h2>
          <div ref={heatmapRef} className="h-[350px] w-full" />
        </div>

        <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-accent-purple" />
              区域对比分析
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={selectedRegionA}
                onChange={(e) => setSelectedRegionA(e.target.value)}
                className="px-2 py-1 rounded bg-bg-tertiary border border-border-glow text-xs focus:outline-none focus:border-accent-cyan/50"
              >
                {regions.map(r => (
                  <option key={r.name} value={r.name}>{r.name}</option>
                ))}
              </select>
              <span className="text-gray-500">vs</span>
              <select
                value={selectedRegionB}
                onChange={(e) => setSelectedRegionB(e.target.value)}
                className="px-2 py-1 rounded bg-bg-tertiary border border-border-glow text-xs focus:outline-none focus:border-accent-cyan/50"
              >
                {regions.map(r => (
                  <option key={r.name} value={r.name}>{r.name}</option>
                ))}
              </select>
              <button
                onClick={() => setCompareChartType(compareChartType === 'bar' ? 'line' : 'bar')}
                className="p-1 rounded hover:bg-bg-tertiary transition-colors"
                title="切换图表类型"
              >
                <BarChart3 className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
          <div ref={compareChartRef} className="h-[300px] w-full" />

          {correlation && (
            <div className="mt-4 p-3 rounded-lg bg-bg-tertiary/50 border border-border-glow/50">
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                <Activity className="w-4 h-4 text-accent-cyan" />
                相关性分析结果
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 text-xs">相关系数</div>
                  <div className={`font-mono font-bold ${
                    correlation.correlation >= 0.7 ? 'text-status-success' :
                    correlation.correlation >= 0.4 ? 'text-status-warning' :
                    'text-status-error'
                  }`}>
                    {correlation.correlation.toFixed(3)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">滞后时间</div>
                  <div className="font-mono">{correlation.lag_minutes.toFixed(1)} 分钟</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">p值</div>
                  <div className="font-mono">{correlation.p_value.toFixed(4)}</div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">{correlation.interpretation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { ArrowLeft, Download, FileText, AlertCircle, TrendingDown, Activity, Target, Clock, Server } from 'lucide-react';
import { useAppStore } from '../store/useStore';
import { api } from '../utils/api';
import { cn } from '../lib/utils';
import type { CalculationResult } from '../../shared/types';

export default function ResultDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedResult, setSelectedResult, setLoading, setError, loading, error } = useAppStore();
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'settlement' | 'stress' | 'displacement' | 'stats'>('settlement');

  const fetchResult = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api.getResultById(id);
      if (res.success && res.data) {
        const data = res.data as CalculationResult;
        setResult(data);
        setSelectedResult(data);
      } else {
        setError(res.message || '加载失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [id, setLoading, setError, setSelectedResult]);

  useEffect(() => {
    if (selectedResult && selectedResult.id === id) {
      setResult(selectedResult);
    } else {
      fetchResult();
    }
  }, [id, selectedResult, fetchResult]);

  const handleExport = async (format: 'json' | 'csv') => {
    if (!id) return;
    try {
      const res = await api.downloadResult(id, format);
      if (res.success && res.data) {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `result_${id}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    }
  };

  const handleGenerateReport = async () => {
    if (!result) return;
    try {
      const res = await api.getResultReport(result.taskId);
      if (res.success && res.data) {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${result.taskId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成报告失败');
    }
  };

  if (loading && !result) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-space-600 border-t-cyber-400 rounded-full animate-spin" />
          <p className="text-industrial-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (error && !result) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <p className="text-xl text-white mb-2">加载失败</p>
          <p className="text-industrial-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/results')}
            className="px-6 py-2 bg-space-700 hover:bg-space-600 text-white rounded-lg transition-colors"
          >
            返回列表
          </button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-16 h-16 text-industrial-600 mx-auto mb-4" />
          <p className="text-industrial-400">未找到结果数据</p>
          <button
            onClick={() => navigate('/results')}
            className="mt-4 px-6 py-2 bg-space-700 hover:bg-space-600 text-white rounded-lg transition-colors"
          >
            返回列表
          </button>
        </div>
      </div>
    );
  }

  const settlementTimeseriesOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
    },
    legend: {
      data: ['位置 A', '位置 B', '位置 C', '位置 D'],
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
      name: '时间步',
      nameTextStyle: { color: '#64748b' },
      data: Array.from({ length: Math.min(result.settlementData.length, 100) }, (_, i) => i.toString()),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b' },
    },
    yAxis: {
      type: 'value',
      name: '沉降 (m)',
      nameTextStyle: { color: '#64748b' },
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b', formatter: (value: number) => value.toExponential(1) },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      {
        name: '位置 A',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#14b8a6', width: 2 },
        data: result.settlementData.map(row => row[Math.floor(row.length * 0.25)] || 0).slice(0, 100),
      },
      {
        name: '位置 B',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#3b82f6', width: 2 },
        data: result.settlementData.map(row => row[Math.floor(row.length * 0.5)] || 0).slice(0, 100),
      },
      {
        name: '位置 C',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#8b5cf6', width: 2 },
        data: result.settlementData.map(row => row[Math.floor(row.length * 0.75)] || 0).slice(0, 100),
      },
      {
        name: '位置 D',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#f59e0b', width: 2 },
        data: result.settlementData.map(row => row[row.length - 1] || 0).slice(0, 100),
      },
    ],
  };

  const stressHeatmapOption = {
    tooltip: {
      position: 'top',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
      formatter: (params: { data: [number, number, number] }) => {
        return `位置: (${params.data[0]}, ${params.data[1]})<br/>应力: ${params.data[2].toExponential(2)} Pa`;
      },
    },
    grid: {
      left: '10%',
      right: '10%',
      top: '5%',
      bottom: '15%',
    },
    xAxis: {
      type: 'category',
      data: Array.from({ length: result.stressData[0]?.length || 10 }, (_, i) => i.toString()),
      splitArea: { show: true, areaStyle: { color: ['rgba(30, 41, 59, 0.3)', 'rgba(15, 23, 42, 0.3)'] } },
      axisLabel: { color: '#64748b', fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: Array.from({ length: result.stressData.length || 10 }, (_, i) => i.toString()),
      splitArea: { show: true, areaStyle: { color: ['rgba(30, 41, 59, 0.3)', 'rgba(15, 23, 42, 0.3)'] } },
      axisLabel: { color: '#64748b', fontSize: 10 },
    },
    visualMap: {
      min: Math.min(...result.stressData.flat()),
      max: Math.max(...result.stressData.flat()),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%',
      textStyle: { color: '#94a3b8', fontSize: 10 },
      inRange: {
        color: ['#0f172a', '#1e3a8a', '#3b82f6', '#60a5fa', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308'],
      },
    },
    series: [
      {
        name: '应力数据',
        type: 'heatmap',
        data: result.stressData.flatMap((row, y) =>
          row.map((value, x) => [x, y, value])
        ),
        label: { show: false },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ],
  };

  const stressContourOption = {
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
    },
    grid: {
      left: '10%',
      right: '10%',
      top: '5%',
      bottom: '15%',
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: (result.stressData[0]?.length || 10) - 1,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: (result.stressData.length || 10) - 1,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    visualMap: {
      min: Math.min(...result.stressData.flat()),
      max: Math.max(...result.stressData.flat()),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%',
      textStyle: { color: '#94a3b8', fontSize: 10 },
      inRange: {
        color: ['#0f172a', '#1e3a8a', '#3b82f6', '#60a5fa', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308'],
      },
    },
    series: [
      {
        name: '应力等值线',
        type: 'contour',
        data: result.stressData.flatMap((row, y) =>
          row.map((value, x) => [x, y, value])
        ),
        contourStyle: {
          color: '#ffffff',
          width: 0.5,
          opacity: 0.3,
        },
        label: {
          show: true,
          color: '#ffffff',
          fontSize: 10,
          formatter: (params: { value: number }) => params.value.toExponential(1),
        },
      },
    ],
  };

  const displacementFieldOption = {
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
      formatter: (params: { data: { value: [number, number]; displacement: number } }) => {
        return `位置: (${params.data.value[0]}, ${params.data.value[1]})<br/>位移: ${params.data.displacement.toExponential(2)} m`;
      },
    },
    grid: {
      left: '10%',
      right: '10%',
      top: '5%',
      bottom: '10%',
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: (result.displacementData[0]?.length || 10) - 1,
      name: 'X',
      nameTextStyle: { color: '#64748b' },
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: (result.displacementData.length || 10) - 1,
      name: 'Y',
      nameTextStyle: { color: '#64748b' },
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      {
        type: 'scatter',
        data: result.displacementData.flatMap((row, y) =>
          row.map((value, x) => ({
            value: [x, y],
            displacement: value,
            symbolSize: Math.min(Math.abs(value) * 2000 + 8, 25),
            itemStyle: {
              color: value > 0 ? '#14b8a6' : '#f59e0b',
              opacity: 0.8,
            },
          }))
        ),
      },
    ],
  };

  const settlementHeatmapOption = {
    tooltip: {
      position: 'top',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
      formatter: (params: { data: [number, number, number] }) => {
        return `位置: (${params.data[0]}, ${params.data[1]})<br/>沉降: ${params.data[2].toExponential(2)} m`;
      },
    },
    grid: {
      left: '10%',
      right: '10%',
      top: '5%',
      bottom: '15%',
    },
    xAxis: {
      type: 'category',
      data: Array.from({ length: result.settlementData[0]?.length || 10 }, (_, i) => i.toString()),
      splitArea: { show: true, areaStyle: { color: ['rgba(30, 41, 59, 0.3)', 'rgba(15, 23, 42, 0.3)'] } },
      axisLabel: { color: '#64748b', fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: Array.from({ length: result.settlementData.length || 10 }, (_, i) => i.toString()),
      splitArea: { show: true, areaStyle: { color: ['rgba(30, 41, 59, 0.3)', 'rgba(15, 23, 42, 0.3)'] } },
      axisLabel: { color: '#64748b', fontSize: 10 },
    },
    visualMap: {
      min: Math.min(...result.settlementData.flat()),
      max: Math.max(...result.settlementData.flat()),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%',
      textStyle: { color: '#94a3b8', fontSize: 10 },
      inRange: {
        color: ['#1e3a5f', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#fbbf24', '#f59e0b', '#ef4444'],
      },
    },
    series: [
      {
        name: '沉降数据',
        type: 'heatmap',
        data: result.settlementData.flatMap((row, y) =>
          row.map((value, x) => [x, y, value])
        ),
        label: { show: false },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ],
  };

  const tabs = [
    { key: 'settlement', label: '沉降曲线' },
    { key: 'stress', label: '应力云图' },
    { key: 'displacement', label: '位移场' },
    { key: 'stats', label: '数据统计' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/results')}
            className="p-2 rounded-lg hover:bg-space-800 text-industrial-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-white">计算结果详情</h2>
            <p className="text-xs text-industrial-500 font-mono mt-1">ID: {result.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('json')}
            className="flex items-center gap-2 px-4 py-2 bg-space-800 hover:bg-space-700 text-industrial-300 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            导出 JSON
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 px-4 py-2 bg-space-800 hover:bg-space-700 text-industrial-300 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            导出 CSV
          </button>
          <button
            onClick={handleGenerateReport}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-space-500 to-cyber-500 hover:from-space-400 hover:to-cyber-400 text-white rounded-lg transition-all"
          >
            <FileText className="w-4 h-4" />
            生成报告
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-lg text-red-400 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-space-800/30 rounded-xl border border-space-700 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-5 h-5 text-cyber-400" />
            <span className="text-xs text-industrial-500">最大沉降</span>
          </div>
          <p className="text-3xl font-bold text-white">
            {result.metadata.maxSettlement.toExponential(2)}
          </p>
          <p className="text-xs text-industrial-500 mt-1">米 (m)</p>
        </div>

        <div className="bg-space-800/30 rounded-xl border border-space-700 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-yellow-400" />
            <span className="text-xs text-industrial-500">最大应力</span>
          </div>
          <p className="text-3xl font-bold text-white">
            {result.metadata.maxStress.toExponential(2)}
          </p>
          <p className="text-xs text-industrial-500 mt-1">帕斯卡 (Pa)</p>
        </div>

        <div className="bg-space-800/30 rounded-xl border border-space-700 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-5 h-5 text-green-400" />
            <span className="text-xs text-industrial-500">收敛性</span>
          </div>
          <p className={cn(
            'text-3xl font-bold',
            result.metadata.convergence ? 'text-green-400' : 'text-red-400'
          )}>
            {result.metadata.convergence ? '已收敛' : '未收敛'}
          </p>
          <p className="text-xs text-industrial-500 mt-1">计算稳定性</p>
        </div>

        <div className="bg-space-800/30 rounded-xl border border-space-700 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-purple-400" />
            <span className="text-xs text-industrial-500">计算时间</span>
          </div>
          <p className="text-3xl font-bold text-white">
            {result.metadata.computeTime.toFixed(1)}
          </p>
          <p className="text-xs text-industrial-500 mt-1">秒 (s)</p>
        </div>
      </div>

      <div className="rounded-xl border border-space-700 bg-space-900/50 backdrop-blur-sm p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-industrial-500 mb-1">任务ID</p>
            <p className="text-white font-mono">{result.taskId.slice(0, 16)}</p>
          </div>
          <div>
            <p className="text-xs text-industrial-500 mb-1">分片ID</p>
            <p className="text-white font-mono">{result.shardId.slice(0, 16)}</p>
          </div>
          <div>
            <p className="text-xs text-industrial-500 mb-1">计算节点</p>
            <div className="flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-cyber-400" />
              <p className="text-white font-mono">{result.nodeId.slice(0, 12)}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-industrial-500 mb-1">创建时间</p>
            <p className="text-white">
              {new Date(result.createdAt).toLocaleString('zh-CN')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-space-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={cn(
              'px-6 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.key
                ? 'text-cyber-400 border-cyber-400'
                : 'text-industrial-400 border-transparent hover:text-white'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[500px]">
        {activeTab === 'settlement' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-space-700 bg-space-900/50 backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold text-industrial-200 mb-4">沉降随时间变化曲线</h3>
              <div className="h-80">
                <ReactECharts option={settlementTimeseriesOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </div>

            <div className="rounded-xl border border-space-700 bg-space-900/50 backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold text-industrial-200 mb-4">最终沉降热力图</h3>
              <div className="h-80">
                <ReactECharts option={settlementHeatmapOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stress' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-space-700 bg-space-900/50 backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold text-industrial-200 mb-4">应力分布云图</h3>
              <div className="h-80">
                <ReactECharts option={stressHeatmapOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </div>

            <div className="rounded-xl border border-space-700 bg-space-900/50 backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold text-industrial-200 mb-4">应力等值线图</h3>
              <div className="h-80">
                <ReactECharts option={stressContourOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'displacement' && (
          <div className="rounded-xl border border-space-700 bg-space-900/50 backdrop-blur-sm p-5">
            <h3 className="text-sm font-semibold text-industrial-200 mb-4">位移场可视化</h3>
            <div className="h-96">
              <ReactECharts option={displacementFieldOption} style={{ height: '100%', width: '100%' }} />
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-industrial-400">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-cyber-500" />
                <span>正位移</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-500" />
                <span>负位移</span>
              </div>
              <span>点大小表示位移量级</span>
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-space-800/30 rounded-xl border border-space-700 p-5">
                <h4 className="text-sm font-semibold text-industrial-200 mb-4">沉降统计</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-industrial-400">最小值</span>
                    <span className="text-white font-mono">
                      {Math.min(...result.settlementData.flat()).toExponential(3)} m
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-industrial-400">最大值</span>
                    <span className="text-white font-mono">
                      {Math.max(...result.settlementData.flat()).toExponential(3)} m
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-industrial-400">平均值</span>
                    <span className="text-white font-mono">
                      {(result.settlementData.flat().reduce((a, b) => a + b, 0) / result.settlementData.flat().length).toExponential(3)} m
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-industrial-400">数据点数</span>
                    <span className="text-white font-mono">
                      {result.settlementData.length * (result.settlementData[0]?.length || 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-space-800/30 rounded-xl border border-space-700 p-5">
                <h4 className="text-sm font-semibold text-industrial-200 mb-4">应力统计</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-industrial-400">最小值</span>
                    <span className="text-white font-mono">
                      {Math.min(...result.stressData.flat()).toExponential(3)} Pa
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-industrial-400">最大值</span>
                    <span className="text-white font-mono">
                      {Math.max(...result.stressData.flat()).toExponential(3)} Pa
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-industrial-400">平均值</span>
                    <span className="text-white font-mono">
                      {(result.stressData.flat().reduce((a, b) => a + b, 0) / result.stressData.flat().length).toExponential(3)} Pa
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-industrial-400">数据点数</span>
                    <span className="text-white font-mono">
                      {result.stressData.length * (result.stressData[0]?.length || 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-space-800/30 rounded-xl border border-space-700 p-5">
                <h4 className="text-sm font-semibold text-industrial-200 mb-4">位移统计</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-industrial-400">最小值</span>
                    <span className="text-white font-mono">
                      {Math.min(...result.displacementData.flat()).toExponential(3)} m
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-industrial-400">最大值</span>
                    <span className="text-white font-mono">
                      {Math.max(...result.displacementData.flat()).toExponential(3)} m
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-industrial-400">平均值</span>
                    <span className="text-white font-mono">
                      {(result.displacementData.flat().reduce((a, b) => a + b, 0) / result.displacementData.flat().length).toExponential(3)} m
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-industrial-400">数据点数</span>
                    <span className="text-white font-mono">
                      {result.displacementData.length * (result.displacementData[0]?.length || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-space-800/30 rounded-xl border border-space-700 p-5">
              <h4 className="text-sm font-semibold text-industrial-200 mb-4">元数据</h4>
              <pre className="text-xs text-industrial-300 bg-space-950 rounded-lg p-4 overflow-auto max-h-60">
                {JSON.stringify(result.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

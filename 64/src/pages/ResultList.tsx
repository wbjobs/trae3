import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { Search, Filter, X, Eye, Download, FileText, Calendar, AlertCircle, ChevronDown, TrendingDown, Activity, Target } from 'lucide-react';
import { useAppStore } from '../store/useStore';
import { api } from '../utils/api';
import DataTable, { type Column } from '../components/DataTable';
import Empty from '../components/Empty';
import { cn } from '../lib/utils';
import type { CalculationResult, Task } from '../../shared/types';

export default function ResultList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { results, selectedResult, tasks, setResults, setSelectedResult, setLoading, setError, loading, error } = useAppStore();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [taskFilter, setTaskFilter] = useState<string>(searchParams.get('taskId') || '');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showTaskDropdown, setShowTaskDropdown] = useState(false);
  const pageSize = 10;

  useEffect(() => {
    if (searchParams.get('taskId')) {
      setTaskFilter(searchParams.get('taskId') || '');
    }
  }, [searchParams]);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getResults({
        page: currentPage,
        pageSize,
        taskId: taskFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      if (res.success && res.data) {
        const data = Array.isArray(res.data)
          ? { items: res.data, total: res.data.length }
          : (res.data as { items: CalculationResult[]; total: number });
        setResults(data.items || []);
        setTotal(data.total || 0);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [taskFilter, startDate, endDate, currentPage, setResults, setLoading, setError]);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await api.getTasks({ pageSize: 100 });
      if (res.success && res.data) {
        const data = Array.isArray(res.data)
          ? res.data
          : (res.data as { items: Task[] }).items || [];
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchResults();
    fetchTasks();
  }, [fetchResults, fetchTasks]);

  const filteredResults = useMemo(() => {
    return results.filter(result =>
      result.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      result.taskId.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [results, searchQuery]);

  const handleRowClick = (result: CalculationResult) => {
    setSelectedResult(result);
  };

  const handleExport = async (resultId: string, format: 'json' | 'csv') => {
    try {
      const res = await api.downloadResult(resultId, format);
      if (res.success && res.data) {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `result_${resultId}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    }
  };

  const handleGenerateReport = async (taskId: string) => {
    try {
      const res = await api.getResultReport(taskId);
      if (res.success && res.data) {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${taskId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成报告失败');
    }
  };

  const getTaskName = (taskId: string): string => {
    const task = tasks.find(t => t.id === taskId);
    return task?.name || taskId.slice(0, 8);
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const columns: Column<CalculationResult>[] = [
    {
      key: 'id',
      title: '结果ID',
      sortable: true,
      render: (value) => (
        <span className="font-mono text-sm text-cyber-400">{String(value).slice(0, 12)}</span>
      ),
    },
    {
      key: 'taskId',
      title: '任务名称',
      sortable: true,
      render: (value) => (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-space-400" />
          <span className="text-white">{getTaskName(String(value))}</span>
        </div>
      ),
    },
    {
      key: 'createdAt',
      title: '创建时间',
      sortable: true,
      render: (value) => {
        const date = value instanceof Date ? value : new Date(String(value));
        return date.toLocaleString('zh-CN');
      },
    },
    {
      key: 'dataSize',
      title: '数据大小',
      sortable: true,
      align: 'right',
      render: (_, row) => {
        const size = JSON.stringify(row.settlementData).length + JSON.stringify(row.stressData).length + JSON.stringify(row.displacementData).length;
        return formatSize(size);
      },
    },
    {
      key: 'actions',
      title: '操作',
      width: '180px',
      align: 'center',
      render: (_, row) => (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/results/${row.id}`);
            }}
            className="p-1.5 rounded-lg hover:bg-space-700 text-industrial-400 hover:text-white transition-colors"
            title="查看详情"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleExport(row.id, 'json');
            }}
            className="p-1.5 rounded-lg hover:bg-cyber-900/30 text-industrial-400 hover:text-cyber-400 transition-colors"
            title="导出JSON"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleGenerateReport(row.taskId);
            }}
            className="p-1.5 rounded-lg hover:bg-green-900/30 text-industrial-400 hover:text-green-400 transition-colors"
            title="生成报告"
          >
            <FileText className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const settlementHeatmapOption = selectedResult ? {
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
      data: Array.from({ length: selectedResult.settlementData[0]?.length || 10 }, (_, i) => i.toString()),
      splitArea: { show: true },
      axisLabel: { color: '#64748b', fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: Array.from({ length: selectedResult.settlementData.length || 10 }, (_, i) => i.toString()),
      splitArea: { show: true },
      axisLabel: { color: '#64748b', fontSize: 10 },
    },
    visualMap: {
      min: Math.min(...selectedResult.settlementData.flat()),
      max: Math.max(...selectedResult.settlementData.flat()),
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
        data: selectedResult.settlementData.flatMap((row, y) =>
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
  } : {};

  const stressHeatmapOption = selectedResult ? {
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
      data: Array.from({ length: selectedResult.stressData[0]?.length || 10 }, (_, i) => i.toString()),
      splitArea: { show: true },
      axisLabel: { color: '#64748b', fontSize: 10 },
    },
    yAxis: {
      type: 'category',
      data: Array.from({ length: selectedResult.stressData.length || 10 }, (_, i) => i.toString()),
      splitArea: { show: true },
      axisLabel: { color: '#64748b', fontSize: 10 },
    },
    visualMap: {
      min: Math.min(...selectedResult.stressData.flat()),
      max: Math.max(...selectedResult.stressData.flat()),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%',
      textStyle: { color: '#94a3b8', fontSize: 10 },
      inRange: {
        color: ['#0f172a', '#1e3a8a', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308'],
      },
    },
    series: [
      {
        name: '应力数据',
        type: 'heatmap',
        data: selectedResult.stressData.flatMap((row, y) =>
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
  } : {};

  const displacementVectorOption = selectedResult ? {
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
    },
    grid: {
      left: '10%',
      right: '10%',
      top: '5%',
      bottom: '5%',
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: (selectedResult.displacementData[0]?.length || 10) - 1,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: (selectedResult.displacementData.length || 10) - 1,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      {
        type: 'scatter',
        data: selectedResult.displacementData.flatMap((row, y) =>
          row.map((value, x) => ({
            value: [x, y],
            symbolSize: Math.min(Math.abs(value) * 1000 + 5, 20),
            itemStyle: {
              color: value > 0 ? '#14b8a6' : '#f59e0b',
            },
          }))
        ),
      },
    ],
  } : {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">结果查询</h2>
          <p className="text-sm text-industrial-400 mt-1">共 {total} 条计算结果</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-lg text-red-400 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-industrial-500" />
          <input
            type="text"
            placeholder="搜索结果ID或任务ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 bg-space-800/50 border border-space-700 rounded-lg text-white placeholder-industrial-500 focus:outline-none focus:border-cyber-500 focus:ring-1 focus:ring-cyber-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-industrial-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-industrial-400" />

          <div className="relative">
            <button
              onClick={() => setShowTaskDropdown(!showTaskDropdown)}
              className="flex items-center gap-2 px-3 py-2.5 bg-space-800/50 border border-space-700 rounded-lg text-industrial-300 hover:bg-space-700 transition-colors min-w-[180px]"
            >
              <span className={cn(!taskFilter && 'text-industrial-500')}>
                {taskFilter ? getTaskName(taskFilter) : '选择任务'}
              </span>
              <ChevronDown className="w-4 h-4" />
            </button>
            {showTaskDropdown && (
              <div className="absolute top-full left-0 mt-1 w-full bg-space-800 border border-space-700 rounded-lg shadow-xl z-10 max-h-60 overflow-y-auto">
                <button
                  onClick={() => {
                    setTaskFilter('');
                    setShowTaskDropdown(false);
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm transition-colors hover:bg-space-700',
                    !taskFilter ? 'text-cyber-400' : 'text-industrial-300'
                  )}
                >
                  全部任务
                </button>
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => {
                      setTaskFilter(task.id);
                      setShowTaskDropdown(false);
                      setCurrentPage(1);
                    }}
                    className={cn(
                      'w-full px-3 py-2 text-left text-sm transition-colors hover:bg-space-700',
                      taskFilter === task.id ? 'text-cyber-400' : 'text-industrial-300'
                    )}
                  >
                    {task.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-industrial-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2.5 bg-space-800/50 border border-space-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyber-500"
            />
            <span className="text-industrial-500">至</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2.5 bg-space-800/50 border border-space-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyber-500"
            />
          </div>

          {(taskFilter || startDate || endDate) && (
            <button
              onClick={() => {
                setTaskFilter('');
                setStartDate('');
                setEndDate('');
                setCurrentPage(1);
              }}
              className="flex items-center gap-1 px-3 py-2 text-sm text-industrial-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
              清除筛选
            </button>
          )}
        </div>
      </div>

      <DataTable<CalculationResult>
        data={filteredResults}
        columns={columns}
        onRowClick={handleRowClick}
        loading={loading}
        emptyMessage="暂无结果数据"
        pageSize={pageSize}
      />

      {selectedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedResult(null)}
          />
          <div className="relative w-full max-w-5xl max-h-[90vh] bg-space-900 border border-space-700 rounded-xl shadow-2xl overflow-hidden animate-fade-in">
            <div className="sticky top-0 z-10 bg-space-900/95 backdrop-blur-sm border-b border-space-700 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">结果详情预览</h3>
                <p className="text-xs text-industrial-500 font-mono mt-1">ID: {selectedResult.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/results/${selectedResult.id}`)}
                  className="px-4 py-2 bg-cyber-600 hover:bg-cyber-500 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  查看完整详情
                </button>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="p-2 rounded-lg hover:bg-space-800 text-industrial-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-space-800/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-cyber-400" />
                    <span className="text-xs text-industrial-500">最大沉降</span>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {selectedResult.metadata.maxSettlement.toExponential(2)} m
                  </p>
                </div>
                <div className="bg-space-800/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs text-industrial-500">最大应力</span>
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {selectedResult.metadata.maxStress.toExponential(2)} Pa
                  </p>
                </div>
                <div className="bg-space-800/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-industrial-500">收敛性</span>
                  </div>
                  <p className={cn(
                    'text-2xl font-bold',
                    selectedResult.metadata.convergence ? 'text-green-400' : 'text-red-400'
                  )}>
                    {selectedResult.metadata.convergence ? '已收敛' : '未收敛'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-space-700 bg-space-900/50 p-5">
                  <h4 className="text-sm font-semibold text-industrial-200 mb-4">沉降数据热力图</h4>
                  <div className="h-64">
                    <ReactECharts option={settlementHeatmapOption} style={{ height: '100%', width: '100%' }} />
                  </div>
                </div>

                <div className="rounded-xl border border-space-700 bg-space-900/50 p-5">
                  <h4 className="text-sm font-semibold text-industrial-200 mb-4">应力数据云图</h4>
                  <div className="h-64">
                    <ReactECharts option={stressHeatmapOption} style={{ height: '100%', width: '100%' }} />
                  </div>
                </div>

                <div className="rounded-xl border border-space-700 bg-space-900/50 p-5 lg:col-span-2">
                  <h4 className="text-sm font-semibold text-industrial-200 mb-4">位移矢量图</h4>
                  <div className="h-64">
                    <ReactECharts option={displacementVectorOption} style={{ height: '100%', width: '100%' }} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => handleExport(selectedResult.id, 'json')}
                  className="flex items-center gap-2 px-4 py-2 bg-space-800 hover:bg-space-700 text-industrial-300 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  导出 JSON
                </button>
                <button
                  onClick={() => handleExport(selectedResult.id, 'csv')}
                  className="flex items-center gap-2 px-4 py-2 bg-space-800 hover:bg-space-700 text-industrial-300 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  导出 CSV
                </button>
                <button
                  onClick={() => handleGenerateReport(selectedResult.taskId)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-space-500 to-cyber-500 hover:from-space-400 hover:to-cyber-400 text-white rounded-lg transition-all"
                >
                  <FileText className="w-4 h-4" />
                  生成报告
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

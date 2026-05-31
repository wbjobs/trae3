import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { Plus, Search, Filter, X, CheckCircle2, XCircle, Play, Square, Eye, FileText, AlertCircle, Clock } from 'lucide-react';
import { useAppStore } from '../store/useStore';
import { api } from '../utils/api';
import DataTable, { type Column } from '../components/DataTable';
import { TaskStatusBadge } from '../components/StatusBadge';
import { TaskProgress } from '../components/ProgressBar';
import Empty from '../components/Empty';
import { cn } from '../lib/utils';
import type { Task, TaskStatus as TaskStatusType, TaskShard } from '../../shared/types';

const statusFilters = [
  { value: '', label: '全部', icon: null },
  { value: 'pending', label: '待处理', icon: Clock },
  { value: 'queued', label: '队列中', icon: Clock },
  { value: 'running', label: '运行中', icon: Play },
  { value: 'completed', label: '已完成', icon: CheckCircle2 },
  { value: 'failed', label: '失败', icon: XCircle },
  { value: 'cancelled', label: '已取消', icon: Square },
];

export default function TaskList() {
  const navigate = useNavigate();
  const { tasks, selectedTask, setTasks, setSelectedTask, setLoading, setError, loading, error } = useAppStore();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRows, setSelectedRows] = useState<Task[]>([]);
  const [detailTab, setDetailTab] = useState<'info' | 'shards' | 'logs' | 'result'>('info');
  const [taskShards, setTaskShards] = useState<TaskShard[]>([]);
  const [taskLogs, setTaskLogs] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getTasks({
        page: currentPage,
        pageSize,
        status: statusFilter || undefined,
      });

      if (res.success && res.data) {
        const data = res.data as { items: Task[]; total: number };
        setTasks(data.items);
        setTotal(data.total);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, currentPage, setTasks, setLoading, setError]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const filteredTasks = tasks.filter(task =>
    task.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRowClick = async (task: Task) => {
    setSelectedTask(task);
    try {
      const [shardsRes, logsRes] = await Promise.all([
        api.getTaskShards(task.id),
        api.getTaskLogs(task.id),
      ]);
      if (shardsRes.success && shardsRes.data) {
        setTaskShards(Array.isArray(shardsRes.data) ? shardsRes.data : []);
      }
      if (logsRes.success && logsRes.data) {
        setTaskLogs(Array.isArray(logsRes.data) ? logsRes.data : []);
      }
    } catch {
      setTaskShards([]);
      setTaskLogs([]);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    try {
      await api.cancelTask(taskId);
      fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消失败');
    }
  };

  const handleBatchCancel = async () => {
    try {
      await Promise.all(
        selectedRows
          .filter(t => t.status === 'running' || t.status === 'queued' || t.status === 'pending')
          .map(t => api.cancelTask(t.id))
      );
      setSelectedRows([]);
      fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量取消失败');
    }
  };

  const columns: Column<Task>[] = [
    {
      key: 'name',
      title: '任务名称',
      sortable: true,
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-space-400" />
          <span className="font-medium text-white">{row.name}</span>
        </div>
      ),
    },
    {
      key: 'status',
      title: '状态',
      sortable: true,
      width: '120px',
      render: (value) => <TaskStatusBadge status={value as TaskStatusType} />,
    },
    {
      key: 'progress',
      title: '进度',
      sortable: true,
      width: '200px',
      render: (_, row) => (
        <TaskProgress value={row.progress} max={100} showLabel height="md" />
      ),
    },
    {
      key: 'priority',
      title: '优先级',
      sortable: true,
      width: '100px',
      align: 'center',
      render: (value) => {
        const p = Number(value);
        const colors: Record<number, string> = {
          0: 'bg-gray-700 text-gray-300',
          1: 'bg-blue-900/50 text-blue-400',
          2: 'bg-yellow-900/50 text-yellow-400',
          3: 'bg-red-900/50 text-red-400',
        };
        const labels: Record<number, string> = { 0: '低', 1: '中', 2: '高', 3: '紧急' };
        return (
          <span className={cn('px-2 py-0.5 rounded text-xs font-medium', colors[p] || colors[0])}>
            {labels[p] || '中'}
          </span>
        );
      },
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
      key: 'actions',
      title: '操作',
      width: '150px',
      align: 'center',
      render: (_, row) => (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRowClick(row);
            }}
            className="p-1.5 rounded-lg hover:bg-space-700 text-space-400 hover:text-white transition-colors"
            title="查看详情"
          >
            <Eye className="w-4 h-4" />
          </button>
          {(row.status === 'running' || row.status === 'queued' || row.status === 'pending') && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCancelTask(row.id);
              }}
              className="p-1.5 rounded-lg hover:bg-red-900/30 text-space-400 hover:text-red-400 transition-colors"
              title="取消任务"
            >
              <Square className="w-4 h-4" />
            </button>
          )}
          {row.status === 'completed' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/results?taskId=${row.id}`);
              }}
              className="p-1.5 rounded-lg hover:bg-green-900/30 text-space-400 hover:text-green-400 transition-colors"
              title="查看结果"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const shardChartOption = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
    },
    series: [
      {
        name: '分片状态',
        type: 'pie',
        radius: ['50%', '75%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 6,
          borderColor: '#0f172a',
          borderWidth: 2,
        },
        label: {
          show: true,
          position: 'outside',
          color: '#94a3b8',
          fontSize: 12,
        },
        data: [
          { value: taskShards.filter(s => s.status === 'completed').length, name: '已完成', itemStyle: { color: '#22c55e' } },
          { value: taskShards.filter(s => s.status === 'running').length, name: '运行中', itemStyle: { color: '#14b8a6' } },
          { value: taskShards.filter(s => s.status === 'queued').length, name: '排队中', itemStyle: { color: '#eab308' } },
          { value: taskShards.filter(s => s.status === 'pending').length, name: '等待中', itemStyle: { color: '#64748b' } },
          { value: taskShards.filter(s => s.status === 'failed').length, name: '失败', itemStyle: { color: '#ef4444' } },
        ],
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">任务管理</h2>
          <p className="text-sm text-industrial-400 mt-1">共 {total} 个任务</p>
        </div>
        <button
          onClick={() => navigate('/tasks/create')}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-space-500 to-cyber-500 hover:from-space-400 hover:to-cyber-400 text-white rounded-lg transition-all shadow-lg shadow-space-500/20 hover:shadow-space-500/40"
        >
          <Plus className="w-4 h-4" />
          新建任务
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-lg text-red-400 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-industrial-500" />
          <input
            type="text"
            placeholder="搜索任务名称..."
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
          <div className="flex gap-1 flex-wrap">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => {
                  setStatusFilter(filter.value);
                  setCurrentPage(1);
                }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
                  statusFilter === filter.value
                    ? 'bg-cyber-600 text-white shadow-lg shadow-cyber-500/20'
                    : 'bg-space-800/50 text-industrial-400 hover:bg-space-700 hover:text-white border border-space-700'
                )}
              >
                {filter.icon && <filter.icon className="w-3.5 h-3.5" />}
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedRows.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-space-800/50 border border-space-700 rounded-lg">
          <span className="text-sm text-industrial-300">
            已选择 <span className="text-cyber-400 font-semibold">{selectedRows.length}</span> 个任务
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedRows([])}
              className="px-3 py-1.5 text-sm text-industrial-400 hover:text-white rounded-lg hover:bg-space-700 transition-colors"
            >
              取消选择
            </button>
            <button
              onClick={handleBatchCancel}
              className="px-3 py-1.5 text-sm bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5" />
              批量取消
            </button>
          </div>
        </div>
      )}

      <DataTable<Task>
        data={filteredTasks}
        columns={columns}
        selectable
        selectedRows={selectedRows}
        onSelectionChange={setSelectedRows}
        onRowClick={handleRowClick}
        loading={loading}
        emptyMessage="暂无任务数据"
        pageSize={pageSize}
      />

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedTask(null)}
          />
          <div className="relative w-full max-w-2xl h-full bg-space-900 border-l border-space-700 shadow-2xl overflow-y-auto animate-slide-in">
            <div className="sticky top-0 z-10 bg-space-900/95 backdrop-blur-sm border-b border-space-700 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedTask.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <TaskStatusBadge status={selectedTask.status} />
                  <span className="text-xs text-industrial-500">ID: {selectedTask.id.slice(0, 8)}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-2 rounded-lg hover:bg-space-800 text-industrial-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="flex gap-1 mb-6 border-b border-space-700">
                {[
                  { key: 'info', label: '基本信息' },
                  { key: 'shards', label: '分片状态' },
                  { key: 'logs', label: '计算日志' },
                  { key: 'result', label: '结果预览' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setDetailTab(tab.key as typeof detailTab)}
                    className={cn(
                      'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                      detailTab === tab.key
                        ? 'text-cyber-400 border-cyber-400'
                        : 'text-industrial-400 border-transparent hover:text-white'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {detailTab === 'info' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-space-800/30 rounded-lg p-4">
                      <p className="text-xs text-industrial-500 mb-1">优先级</p>
                      <p className="text-white font-medium">
                        {{ 0: '低', 1: '中', 2: '高', 3: '紧急' }[selectedTask.priority] || '中'}
                      </p>
                    </div>
                    <div className="bg-space-800/30 rounded-lg p-4">
                      <p className="text-xs text-industrial-500 mb-1">进度</p>
                      <p className="text-white font-medium">{selectedTask.progress.toFixed(1)}%</p>
                    </div>
                    <div className="bg-space-800/30 rounded-lg p-4">
                      <p className="text-xs text-industrial-500 mb-1">总分片数</p>
                      <p className="text-white font-medium">{selectedTask.totalShards}</p>
                    </div>
                    <div className="bg-space-800/30 rounded-lg p-4">
                      <p className="text-xs text-industrial-500 mb-1">已完成分片</p>
                      <p className="text-white font-medium">{selectedTask.completedShards}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-industrial-500 mb-1">创建时间</p>
                      <p className="text-sm text-industrial-200">
                        {new Date(selectedTask.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    {selectedTask.startedAt && (
                      <div>
                        <p className="text-xs text-industrial-500 mb-1">开始时间</p>
                        <p className="text-sm text-industrial-200">
                          {new Date(selectedTask.startedAt).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    )}
                    {selectedTask.completedAt && (
                      <div>
                        <p className="text-xs text-industrial-500 mb-1">完成时间</p>
                        <p className="text-sm text-industrial-200">
                          {new Date(selectedTask.completedAt).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs text-industrial-500 mb-2">计算参数</p>
                    <div className="bg-space-800/30 rounded-lg p-4 text-sm text-industrial-300 space-y-2">
                      <div className="flex justify-between">
                        <span>网格大小</span>
                        <span className="text-white">{selectedTask.parameters.gridSize}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>时间步数</span>
                        <span className="text-white">{selectedTask.parameters.timeSteps}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>载荷点数</span>
                        <span className="text-white">{selectedTask.parameters.loadConditions.length}</span>
                      </div>
                    </div>
                  </div>

                  {selectedTask.errorMessage && (
                    <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4">
                      <p className="text-xs text-red-400 mb-1">错误信息</p>
                      <p className="text-sm text-red-300">{selectedTask.errorMessage}</p>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'shards' && (
                <div className="space-y-6">
                  <div className="h-64">
                    <ReactECharts option={shardChartOption} style={{ height: '100%', width: '100%' }} />
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {taskShards.length === 0 ? (
                      <Empty />
                    ) : (
                      taskShards.map((shard) => (
                        <div key={shard.id} className="bg-space-800/30 rounded-lg p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-industrial-500">#{shard.shardIndex + 1}</span>
                            <TaskStatusBadge status={shard.status} />
                            <span className="text-sm text-industrial-300">
                              {shard.nodeId ? `节点: ${shard.nodeId.slice(0, 8)}` : '未分配'}
                            </span>
                          </div>
                          <span className="text-sm text-industrial-400">{shard.progress.toFixed(0)}%</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {detailTab === 'logs' && (
                <div className="bg-space-950 rounded-lg p-4 font-mono text-sm max-h-96 overflow-y-auto">
                  {taskLogs.length === 0 ? (
                    <p className="text-industrial-500">暂无日志</p>
                  ) : (
                    taskLogs.map((log, index) => (
                      <div key={index} className="text-industrial-300 py-0.5">
                        <span className="text-industrial-600">[{new Date().toLocaleTimeString()}]</span> {log}
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'result' && (
                <div>
                  {selectedTask.status === 'completed' ? (
                    <div className="space-y-4">
                      <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-4 text-center">
                        <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-2" />
                        <p className="text-green-300 font-medium">计算已完成</p>
                        <button
                          onClick={() => navigate(`/results?taskId=${selectedTask.id}`)}
                          className="mt-3 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm transition-colors"
                        >
                          查看完整结果
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-industrial-500">
                      <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>任务尚未完成，暂无结果</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

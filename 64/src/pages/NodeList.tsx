import { useState, useEffect, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { Plus, Search, Filter, X, Power, RotateCcw, Wrench, Eye, Server, Cpu, HardDrive, Activity, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store/useStore';
import { api } from '../utils/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { NodeStatusBadge } from '../components/StatusBadge';
import { NodeResourceGauge, ResourceGaugeCard } from '../components/ResourceGauge';
import Empty from '../components/Empty';
import { cn } from '../lib/utils';
import type { Node, NodeStatus as NodeStatusType, NodeMetrics, Task } from '../../shared/types';

const statusFilters = [
  { value: '', label: '全部' },
  { value: 'online', label: '在线' },
  { value: 'offline', label: '离线' },
  { value: 'busy', label: '忙碌' },
  { value: 'error', label: '错误' },
];

export default function NodeList() {
  const { nodes, selectedNode, nodeMetrics, setNodes, setSelectedNode, setNodeMetrics, setLoading, setError, loading, error, updateNode } = useAppStore();
  const { isConnected } = useWebSocket();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [detailTab, setDetailTab] = useState<'info' | 'metrics' | 'history'>('info');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerForm, setRegisterForm] = useState({ name: '', ipAddress: '' });
  const [nodeHistoryTasks, setNodeHistoryTasks] = useState<Task[]>([]);

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNodes({ status: statusFilter || undefined });
      if (res.success && res.data) {
        const data = Array.isArray(res.data) ? res.data : (res.data as { items: Node[] }).items || [];
        setNodes(data);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, setNodes, setLoading, setError]);

  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 10000);
    return () => clearInterval(interval);
  }, [fetchNodes]);

  const filteredNodes = nodes.filter(node =>
    node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    node.ipAddress.includes(searchQuery)
  );

  const handleNodeClick = async (node: Node) => {
    setSelectedNode(node);
    try {
      const metricsRes = await api.getNodeMetrics(node.id);
      if (metricsRes.success && metricsRes.data) {
        setNodeMetrics(node.id, Array.isArray(metricsRes.data) ? metricsRes.data : []);
      }
    } catch {
      setNodeMetrics(node.id, []);
    }
    setNodeHistoryTasks([]);
  };

  const handleRegisterNode = async () => {
    try {
      const res = await api.registerNode(registerForm);
      if (res.success) {
        setShowRegisterModal(false);
        setRegisterForm({ name: '', ipAddress: '' });
        fetchNodes();
      } else {
        setError(res.message || '注册失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    }
  };

  const handleUnregisterNode = async (nodeId: string) => {
    try {
      await api.unregisterNode(nodeId);
      setSelectedNode(null);
      fetchNodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : '注销失败');
    }
  };

  const handleRestartNode = async (nodeId: string) => {
    try {
      await fetch(`/api/v1/nodes/${nodeId}/restart`, { method: 'PUT' });
      fetchNodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : '重启失败');
    }
  };

  const handleMaintenanceMode = async (nodeId: string) => {
    try {
      await fetch(`/api/v1/nodes/${nodeId}/maintenance`, { method: 'PUT' });
      fetchNodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  };

  const metrics = selectedNode ? (nodeMetrics[selectedNode.id] || []) : [];
  const metricsChartData = metrics.slice(-30);

  const metricsChartOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0' },
    },
    legend: {
      data: ['CPU', '内存', '磁盘', '网络'],
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
      data: metricsChartData.map((m: NodeMetrics) => new Date(m.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b' },
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
        areaStyle: { color: 'rgba(20, 184, 166, 0.1)' },
        data: metricsChartData.map((m: NodeMetrics) => m.cpu),
      },
      {
        name: '内存',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#3b82f6', width: 2 },
        areaStyle: { color: 'rgba(59, 130, 246, 0.1)' },
        data: metricsChartData.map((m: NodeMetrics) => m.memory),
      },
      {
        name: '磁盘',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#f59e0b', width: 2 },
        areaStyle: { color: 'rgba(245, 158, 11, 0.1)' },
        data: metricsChartData.map((m: NodeMetrics) => m.disk),
      },
      {
        name: '网络',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#8b5cf6', width: 2 },
        areaStyle: { color: 'rgba(139, 92, 246, 0.1)' },
        data: metricsChartData.map((m: NodeMetrics) => m.network),
      },
    ],
  };

  const getStatusColor = (status: NodeStatusType | string) => {
    const colors: Record<string, string> = {
      online: 'bg-green-500',
      offline: 'bg-red-500',
      busy: 'bg-yellow-500',
      error: 'bg-red-600',
    };
    return colors[status] || 'bg-gray-500';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">节点监控</h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-industrial-400">共 {nodes.length} 个节点</p>
            <div className={cn('flex items-center gap-1.5 text-xs', isConnected ? 'text-green-400' : 'text-red-400')}>
              <span className={cn('w-2 h-2 rounded-full', isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400')} />
              {isConnected ? 'WebSocket 已连接' : 'WebSocket 已断开'}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowRegisterModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-space-500 to-cyber-500 hover:from-space-400 hover:to-cyber-400 text-white rounded-lg transition-all shadow-lg shadow-space-500/20 hover:shadow-space-500/40"
        >
          <Plus className="w-4 h-4" />
          注册新节点
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
            placeholder="搜索节点名称或IP..."
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

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-industrial-400" />
          <div className="flex gap-1">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                  statusFilter === filter.value
                    ? 'bg-cyber-600 text-white shadow-lg shadow-cyber-500/20'
                    : 'bg-space-800/50 text-industrial-400 hover:bg-space-700 hover:text-white border border-space-700'
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && filteredNodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 border-2 border-space-600 border-t-cyber-400 rounded-full animate-spin mb-4" />
          <p className="text-industrial-400">加载中...</p>
        </div>
      ) : filteredNodes.length === 0 ? (
        <div className="text-center py-20">
          <Server className="w-16 h-16 text-industrial-600 mx-auto mb-4" />
          <p className="text-industrial-400">暂无节点数据</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNodes.map((node) => (
            <div
              key={node.id}
              onClick={() => handleNodeClick(node)}
              className={cn(
                'rounded-xl border bg-space-900/50 backdrop-blur-sm p-5 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl',
                selectedNode?.id === node.id
                  ? 'border-cyber-500 shadow-lg shadow-cyber-500/20'
                  : 'border-space-700 hover:border-space-600'
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-2.5 rounded-lg',
                    node.status === 'online' ? 'bg-green-900/30' :
                    node.status === 'busy' ? 'bg-yellow-900/30' :
                    node.status === 'error' ? 'bg-red-900/30' : 'bg-gray-900/30'
                  )}>
                    <Server className={cn(
                      'w-5 h-5',
                      node.status === 'online' ? 'text-green-400' :
                      node.status === 'busy' ? 'text-yellow-400' :
                      node.status === 'error' ? 'text-red-400' : 'text-gray-400'
                    )} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{node.name}</h3>
                    <p className="text-xs text-industrial-500 font-mono">{node.ipAddress}</p>
                  </div>
                </div>
                <span className={cn('w-2.5 h-2.5 rounded-full', getStatusColor(node.status), node.status === 'online' && 'animate-pulse')} />
              </div>

              <NodeResourceGauge node={node} size="sm" showLabels={false} className="mb-4" />

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-industrial-500">运行任务</span>
                  <span className="text-industrial-200 font-mono">{node.runningTasks} / {node.totalTasks}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-industrial-500">最后心跳</span>
                  <span className="text-industrial-200 font-mono">
                    {new Date(node.lastHeartbeat).toLocaleTimeString('zh-CN')}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <NodeStatusBadge status={node.status} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(node);
                  }}
                  className="p-1.5 rounded-lg hover:bg-space-700 text-industrial-400 hover:text-white transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedNode(null)}
          />
          <div className="relative w-full max-w-2xl h-full bg-space-900 border-l border-space-700 shadow-2xl overflow-y-auto animate-slide-in">
            <div className="sticky top-0 z-10 bg-space-900/95 backdrop-blur-sm border-b border-space-700 p-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedNode.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <NodeStatusBadge status={selectedNode.status} />
                  <span className="text-xs text-industrial-500 font-mono">{selectedNode.ipAddress}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-2 rounded-lg hover:bg-space-800 text-industrial-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="flex gap-1 mb-6 border-b border-space-700">
                {[
                  { key: 'info', label: '基本信息' },
                  { key: 'metrics', label: '性能趋势' },
                  { key: 'history', label: '历史任务' },
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
                  <ResourceGaugeCard
                    cpu={selectedNode.cpuUsage}
                    memory={selectedNode.memoryUsage}
                    disk={selectedNode.diskUsage}
                    title="当前资源使用"
                    subtitle="节点实时资源占用情况"
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-space-800/30 rounded-lg p-4">
                      <p className="text-xs text-industrial-500 mb-1">运行任务数</p>
                      <p className="text-2xl font-bold text-white">{selectedNode.runningTasks}</p>
                    </div>
                    <div className="bg-space-800/30 rounded-lg p-4">
                      <p className="text-xs text-industrial-500 mb-1">总任务数</p>
                      <p className="text-2xl font-bold text-white">{selectedNode.totalTasks}</p>
                    </div>
                    <div className="bg-space-800/30 rounded-lg p-4">
                      <p className="text-xs text-industrial-500 mb-1">注册时间</p>
                      <p className="text-sm text-white">
                        {new Date(selectedNode.registeredAt).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                    <div className="bg-space-800/30 rounded-lg p-4">
                      <p className="text-xs text-industrial-500 mb-1">最后心跳</p>
                      <p className="text-sm text-white">
                        {new Date(selectedNode.lastHeartbeat).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    {selectedNode.status !== 'offline' && (
                      <button
                        onClick={() => handleRestartNode(selectedNode.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-400 rounded-lg transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                        重启节点
                      </button>
                    )}
                    {selectedNode.status !== 'offline' && (
                      <button
                        onClick={() => handleMaintenanceMode(selectedNode.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 rounded-lg transition-colors"
                      >
                        <Wrench className="w-4 h-4" />
                        维护模式
                      </button>
                    )}
                    <button
                      onClick={() => handleUnregisterNode(selectedNode.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors"
                    >
                      <Power className="w-4 h-4" />
                      注销节点
                    </button>
                  </div>
                </div>
              )}

              {detailTab === 'metrics' && (
                <div className="space-y-6">
                  <div className="h-72">
                    <ReactECharts option={metricsChartOption} style={{ height: '100%', width: '100%' }} />
                  </div>

                  {metrics.length === 0 && (
                    <div className="text-center py-12 text-industrial-500">
                      <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>暂无性能数据</p>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'history' && (
                <div className="space-y-4">
                  {nodeHistoryTasks.length === 0 ? (
                    <div className="text-center py-12 text-industrial-500">
                      <Cpu className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>暂无历史任务记录</p>
                    </div>
                  ) : (
                    nodeHistoryTasks.map((task) => (
                      <div key={task.id} className="bg-space-800/30 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-white">{task.name}</span>
                          <NodeStatusBadge status={task.status} />
                        </div>
                        <div className="text-xs text-industrial-500">
                          创建于 {new Date(task.createdAt).toLocaleString('zh-CN')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowRegisterModal(false)}
          />
          <div className="relative w-full max-w-md bg-space-900 border border-space-700 rounded-xl shadow-2xl p-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-white mb-4">注册新节点</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-industrial-200 mb-2">节点名称</label>
                <input
                  type="text"
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="请输入节点名称"
                  className="w-full px-4 py-2.5 bg-space-800/50 border border-space-700 rounded-lg text-white placeholder-industrial-500 focus:outline-none focus:border-cyber-500 focus:ring-1 focus:ring-cyber-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-industrial-200 mb-2">IP 地址</label>
                <input
                  type="text"
                  value={registerForm.ipAddress}
                  onChange={(e) => setRegisterForm(prev => ({ ...prev, ipAddress: e.target.value }))}
                  placeholder="例如: 192.168.1.100"
                  className="w-full px-4 py-2.5 bg-space-800/50 border border-space-700 rounded-lg text-white placeholder-industrial-500 focus:outline-none focus:border-cyber-500 focus:ring-1 focus:ring-cyber-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowRegisterModal(false)}
                className="px-4 py-2 bg-space-800 hover:bg-space-700 text-industrial-300 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleRegisterNode}
                disabled={!registerForm.name || !registerForm.ipAddress}
                className="px-4 py-2 bg-gradient-to-r from-space-500 to-cyber-500 hover:from-space-400 hover:to-cyber-400 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                注册
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

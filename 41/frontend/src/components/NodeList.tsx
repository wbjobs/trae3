import { useMonitorStore } from '../store/monitorStore';

const statusColors: Record<string, string> = {
  online: 'bg-emerald-500',
  offline: 'bg-rose-500',
  abnormal: 'bg-amber-500',
};

const statusBgColors: Record<string, string> = {
  online: 'bg-emerald-500/10 border-emerald-500/30',
  offline: 'bg-rose-500/10 border-rose-500/30',
  abnormal: 'bg-amber-500/10 border-amber-500/30 animate-pulse',
};

const priorityColors: Record<number, string> = {
  1: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  2: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  3: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const ProgressBar = ({ value, max = 100, color }: { value: number; max?: number; color: string }) => (
  <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
    <div
      className={`h-full ${color} transition-all duration-300`}
      style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
    />
  </div>
);

export function NodeList() {
  const { nodes, selectedNodeId, setSelectedNode, isHistoryMode } = useMonitorStore();
  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.node_id.localeCompare(b.node_id);
  });

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <span>📋</span>
          节点列表
          {isHistoryMode && (
            <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">
              历史回放模式
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <span className={`w-2 h-2 rounded-full ${statusColors.online}`} /> 在线
          </span>
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <span className={`w-2 h-2 rounded-full ${statusColors.abnormal}`} /> 异常
          </span>
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <span className={`w-2 h-2 rounded-full ${statusColors.offline}`} /> 离线
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-slate-700">
              <th className="text-left py-2 px-3 font-medium">优先级</th>
              <th className="text-left py-2 px-3 font-medium">节点ID</th>
              <th className="text-left py-2 px-3 font-medium">名称</th>
              <th className="text-left py-2 px-3 font-medium">位置</th>
              <th className="text-left py-2 px-3 font-medium">状态</th>
              <th className="text-left py-2 px-3 font-medium">CPU</th>
              <th className="text-left py-2 px-3 font-medium">内存</th>
              <th className="text-left py-2 px-3 font-medium">磁盘</th>
              <th className="text-left py-2 px-3 font-medium">最后上报</th>
            </tr>
          </thead>
          <tbody>
            {sortedNodes.map(node => (
              <tr
                key={node.node_id}
                className={`border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors ${
                  selectedNodeId === node.node_id ? 'bg-slate-700/50' : ''
                }`}
                onClick={() => setSelectedNode(node.node_id)}
              >
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 text-xs rounded border ${priorityColors[node.priority] || priorityColors[2]}`}>
                    P{node.priority}
                  </span>
                </td>
                <td className="py-2 px-3 font-mono text-slate-300">
                  {node.node_id}
                </td>
                <td className="py-2 px-3 text-slate-200">
                  {node.node_name}
                </td>
                <td className="py-2 px-3 text-slate-400">
                  {node.location || '-'}
                </td>
                <td className="py-2 px-3">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border ${statusBgColors[node.status] || statusBgColors.offline}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusColors[node.status] || statusColors.offline}`} />
                    {node.status === 'online' ? '在线' : node.status === 'offline' ? '离线' : '异常'}
                  </span>
                </td>
                <td className="py-2 px-3 w-28">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-10">{node.cpu_usage?.toFixed(0) || 0}%</span>
                    <ProgressBar value={node.cpu_usage || 0} color="bg-blue-500" />
                  </div>
                </td>
                <td className="py-2 px-3 w-28">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-10">{node.memory_usage?.toFixed(0) || 0}%</span>
                    <ProgressBar value={node.memory_usage || 0} color="bg-emerald-500" />
                  </div>
                </td>
                <td className="py-2 px-3 w-28">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-10">{node.disk_usage?.toFixed(0) || 0}%</span>
                    <ProgressBar value={node.disk_usage || 0} color="bg-amber-500" />
                  </div>
                </td>
                <td className="py-2 px-3 text-xs text-slate-400">
                  {node.last_report ? new Date(node.last_report).toLocaleTimeString('zh-CN') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

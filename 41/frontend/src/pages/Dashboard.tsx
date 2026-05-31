import { useEffect, useMemo } from 'react';
import { StatsCards } from '../components/StatsCard';
import { NodeList } from '../components/NodeList';
import { MetricsChart } from '../components/MetricsChart';
import { AlertList } from '../components/AlertList';
import { LogPanel } from '../components/LogPanel';
import { HistoryReplay } from '../components/HistoryReplay';
import { useMonitorStore } from '../store/monitorStore';

export function Dashboard() {
  const { nodes, fetchStats, fetchNodes, fetchAlerts, fetchLogs, fetchRealtimeMetrics, startEventStream } = useMonitorStore();

  useEffect(() => {
    fetchStats();
    fetchNodes();
    fetchAlerts();
    fetchLogs();
    fetchRealtimeMetrics();

    const cleanup = startEventStream();

    const interval = setInterval(() => {
      fetchStats();
      fetchNodes();
      fetchAlerts();
    }, 5000);

    return () => {
      cleanup();
      clearInterval(interval);
    };
  }, [fetchStats, fetchNodes, fetchAlerts, fetchLogs, fetchRealtimeMetrics, startEventStream]);

  const onlineNodes = nodes.filter((n) => n.status !== 'offline');
  const chartNode = useMemo(() => {
    return onlineNodes[0]?.node_id || nodes[0]?.node_id || 'node-001';
  }, [onlineNodes[0]?.node_id, nodes[0]?.node_id]);

  const chartNodeName = useMemo(() => {
    const found = nodes.find((n) => n.node_id === chartNode);
    return found?.node_name || '加载中';
  }, [chartNode, nodes]);

  return (
    <div className="space-y-6">
      <StatsCards />

      <HistoryReplay />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MetricsChart nodeId={chartNode} title={`实时指标 - ${chartNodeName}`} />
        </div>
        <AlertList />
      </div>

      <NodeList />
      <LogPanel />
    </div>
  );
}

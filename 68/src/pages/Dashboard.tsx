import { useEffect } from 'react';
import { useDashboardStore } from '@/stores/dashboardStore';
import StatsCards from '@/components/dashboard/StatsCards';
import TrendChart from '@/components/dashboard/TrendChart';
import FaultDistribution from '@/components/dashboard/FaultDistribution';
import CriticalAlerts from '@/components/dashboard/CriticalAlerts';

export default function Dashboard() {
  const { stats, isLoading, fetchStats } = useDashboardStore();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-thermal-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">仪表盘</h2>
      <StatsCards stats={stats} />
      <div className="grid grid-cols-2 gap-4">
        <TrendChart stats={stats} />
        <FaultDistribution stats={stats} />
      </div>
      <CriticalAlerts stats={stats} />
    </div>
  );
}

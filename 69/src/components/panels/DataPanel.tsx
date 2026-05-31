import { Activity, AlertTriangle, CheckCircle, Cpu, Gauge, Zap } from 'lucide-react';
import { useEquipmentStore } from '@/store/useEquipmentStore';
import { EquipmentStatus } from '@/types';

const statusConfig: Record<EquipmentStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  normal: {
    label: '正常',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  warning: {
    label: '警告',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  alarm: {
    label: '告警',
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
};

export function DataPanel() {
  const { equipments, isConnected } = useEquipmentStore();

  const stats = {
    total: equipments.length,
    normal: equipments.filter((e) => e.status === 'normal').length,
    warning: equipments.filter((e) => e.status === 'warning').length,
    alarm: equipments.filter((e) => e.status === 'alarm').length,
  };

  return (
    <div className="absolute top-4 left-4 w-72 space-y-4 z-10">
      <div className="bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-700/50 shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            <span className="font-medium text-slate-200">系统概览</span>
          </div>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
            isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {isConnected ? '已连接' : '未连接'}
          </div>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <Cpu className="w-3.5 h-3.5" />
              设备总数
            </div>
            <div className="text-2xl font-bold text-slate-100 font-mono">{stats.total}</div>
          </div>
          <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20">
            <div className="flex items-center gap-2 text-emerald-400 text-xs mb-1">
              <CheckCircle className="w-3.5 h-3.5" />
              正常运行
            </div>
            <div className="text-2xl font-bold text-emerald-400 font-mono">{stats.normal}</div>
          </div>
          <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
            <div className="flex items-center gap-2 text-amber-400 text-xs mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              警告
            </div>
            <div className="text-2xl font-bold text-amber-400 font-mono">{stats.warning}</div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20">
            <div className="flex items-center gap-2 text-red-400 text-xs mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              告警
            </div>
            <div className="text-2xl font-bold text-red-400 font-mono">{stats.alarm}</div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-700/50 shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
          <Gauge className="w-5 h-5 text-cyan-400" />
          <span className="font-medium text-slate-200">设备列表</span>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {equipments.map((equipment) => {
            const status = statusConfig[equipment.status];
            return (
              <div
                key={equipment.id}
                className="px-4 py-3 border-b border-slate-700/30 last:border-0 hover:bg-slate-800/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-200 text-sm">{equipment.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{equipment.type}</div>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${status.bgColor} ${status.color}`}>
                    {status.icon}
                    {status.label}
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  {equipment.parameters.slice(0, 2).map((param, idx) => (
                    <div key={idx} className="flex items-center gap-1 text-xs text-slate-400">
                      <Zap className="w-3 h-3" />
                      <span className="font-mono">
                        {param.value.toFixed(1)}{param.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

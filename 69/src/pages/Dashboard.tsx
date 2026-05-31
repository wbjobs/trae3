import { useEffect } from 'react';
import { Scene3D } from '@/components/scene/Scene3D';
import { DataPanel } from '@/components/panels/DataPanel';
import { EquipmentDetail } from '@/components/panels/EquipmentDetail';
import { ClippingPanel } from '@/components/panels/ClippingPanel';
import { MaintenancePanel } from '@/components/panels/MaintenancePanel';
import { wsService } from '@/services/websocket';
import { Cpu, Activity } from 'lucide-react';

export default function Dashboard() {
  useEffect(() => {
    wsService.connect();
    return () => wsService.disconnect();
  }, []);

  return (
    <div className="w-full h-screen bg-slate-950 relative overflow-hidden">
      <header className="absolute top-0 left-0 right-0 z-20 h-14 bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100">3D 机组监控系统</h1>
            <p className="text-xs text-slate-500">Industrial Digital Twin</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-slate-300">实时监控中</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">AD</span>
          </div>
        </div>
      </header>

      <main className="w-full h-full pt-14">
        <Scene3D />
      </main>

      <DataPanel />
      <EquipmentDetail />
      <ClippingPanel />
      <MaintenancePanel />

      <footer className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-4 px-4 py-2 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/50 text-xs text-slate-400">
          <span>拖拽旋转</span>
          <span className="w-px h-4 bg-slate-700" />
          <span>滚轮缩放</span>
          <span className="w-px h-4 bg-slate-700" />
          <span>右键平移</span>
          <span className="w-px h-4 bg-slate-700" />
          <span>点击设备查看详情</span>
        </div>
      </footer>
    </div>
  );
}

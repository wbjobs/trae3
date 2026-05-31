import { useState } from 'react';
import { MapPin, Plus, Trash2, Wrench, Eye, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useEquipmentStore } from '@/store/useEquipmentStore';
import { wsService } from '@/services/websocket';
import { MaintenancePoint } from '@/types';

const typeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  inspection: { label: '巡检', color: '#3B82F6', icon: <Eye className="w-3 h-3" /> },
  repair: { label: '维修', color: '#F59E0B', icon: <Wrench className="w-3 h-3" /> },
  replacement: { label: '更换', color: '#EF4444', icon: <AlertCircle className="w-3 h-3" /> },
  calibration: { label: '校准', color: '#8B5CF6', icon: <CheckCircle className="w-3 h-3" /> },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'text-amber-400 bg-amber-500/20' },
  in_progress: { label: '进行中', color: 'text-blue-400 bg-blue-500/20' },
  completed: { label: '已完成', color: 'text-emerald-400 bg-emerald-500/20' },
};

export function MaintenancePanel() {
  const { maintenancePoints, selectedEquipment, removeMaintenancePoint, updateMaintenancePoint } = useEquipmentStore();
  const [isAdding, setIsAdding] = useState(false);
  const [newPoint, setNewPoint] = useState({
    label: '',
    type: 'inspection' as MaintenancePoint['type'],
    priority: 'medium' as MaintenancePoint['priority'],
    description: '',
  });

  const filteredPoints = selectedEquipment
    ? maintenancePoints.filter((p) => p.equipmentId === selectedEquipment.id)
    : maintenancePoints;

  const handleAdd = () => {
    if (!selectedEquipment || !newPoint.label.trim()) return;

    const point: MaintenancePoint = {
      id: `mp-${Date.now()}`,
      equipmentId: selectedEquipment.id,
      position: {
        x: selectedEquipment.position.x + (Math.random() - 0.5) * 0.5,
        y: 1.0 + Math.random() * 0.5,
        z: selectedEquipment.position.z + (Math.random() - 0.5) * 0.5,
      },
      label: newPoint.label,
      type: newPoint.type,
      description: newPoint.description,
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
      priority: newPoint.priority,
      status: 'pending',
    };

    wsService.addMaintenancePoint(point);
    setIsAdding(false);
    setNewPoint({ label: '', type: 'inspection', priority: 'medium', description: '' });
  };

  const handleRemove = (id: string) => {
    wsService.removeMaintenancePoint(id);
  };

  const handleStatusChange = (id: string, status: MaintenancePoint['status']) => {
    wsService.updateMaintenancePoint(id, { status });
  };

  return (
    <div className="absolute top-4 right-4 w-80 z-10">
      <div className="bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/50 shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-cyan-400" />
            <span className="font-medium text-slate-200 text-sm">运维点位</span>
            <span className="text-xs text-slate-500">({filteredPoints.length})</span>
          </div>
          {selectedEquipment && (
            <button
              onClick={() => setIsAdding(!isAdding)}
              className={`p-1.5 rounded-md transition-colors ${
                isAdding ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {isAdding && selectedEquipment && (
          <div className="p-4 border-b border-slate-700/30 bg-slate-800/30">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="点位名称"
                value={newPoint.label}
                onChange={(e) => setNewPoint({ ...newPoint, label: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newPoint.type}
                  onChange={(e) => setNewPoint({ ...newPoint, type: e.target.value as MaintenancePoint['type'] })}
                  className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
                >
                  {Object.entries(typeConfig).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>

                <select
                  value={newPoint.priority}
                  onChange={(e) => setNewPoint({ ...newPoint, priority: e.target.value as MaintenancePoint['priority'] })}
                  className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="low">低优先级</option>
                  <option value="medium">中优先级</option>
                  <option value="high">高优先级</option>
                </select>
              </div>

              <input
                type="text"
                placeholder="描述信息（可选）"
                value={newPoint.description}
                onChange={(e) => setNewPoint({ ...newPoint, description: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />

              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  className="flex-1 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
                >
                  添加
                </button>
                <button
                  onClick={() => setIsAdding(false)}
                  className="flex-1 py-2 rounded-lg bg-slate-700/50 text-slate-400 text-sm hover:bg-slate-700/70 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="max-h-48 overflow-y-auto">
          {filteredPoints.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">
              {selectedEquipment ? '暂无运维点位，点击 + 添加' : '选中设备以查看运维点位'}
            </div>
          ) : (
            filteredPoints.map((point) => {
              const typeInfo = typeConfig[point.type] || typeConfig.inspection;
              const statusInfo = statusLabels[point.status] || statusLabels.pending;

              return (
                <div
                  key={point.id}
                  className="px-4 py-3 border-b border-slate-700/30 last:border-0 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: `${typeInfo.color}20`, color: typeInfo.color }}>
                        {typeInfo.icon}
                      </div>
                      <div>
                        <div className="text-sm text-slate-200 font-medium">{point.label}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {new Date(point.createdAt).toLocaleDateString('zh-CN')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={point.status}
                        onChange={(e) => handleStatusChange(point.id, e.target.value as MaintenancePoint['status'])}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-medium border-0 ${statusInfo.color}`}
                      >
                        <option value="pending">待处理</option>
                        <option value="in_progress">进行中</option>
                        <option value="completed">已完成</option>
                      </select>
                      <button
                        onClick={() => handleRemove(point.id)}
                        className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {point.description && (
                    <div className="mt-1.5 text-xs text-slate-500 pl-8">{point.description}</div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

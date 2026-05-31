import { useEffect, useState } from 'react';
import { useSensorStore } from '@/stores/sensor-store';
import StatusIndicator from '@/components/StatusIndicator';
import PermissionGuard from '@/components/PermissionGuard';
import { Search, Plus, X, Trash2, Pencil, RefreshCw } from 'lucide-react';
import type { Sensor } from '../../shared/types';

const sensorTypes = ['temperature', 'pressure', 'flow', 'level', 'vibration', 'humidity'];
const sensorProtocols = ['modbus', 'opcua', 'mqtt', 'http'];

const emptyForm: Omit<Sensor, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  type: 'temperature',
  protocol: 'modbus',
  frequency: 1000,
  unit: '',
  rangeMin: 0,
  rangeMax: 100,
  tags: [],
  status: 'offline',
};

export default function Sensors() {
  const { sensors, loading, fetchSensors, createSensor, updateSensor, deleteSensor } = useSensorStore();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [metadataVersion, setMetadataVersion] = useState(0);

  useEffect(() => {
    fetchSensors();
  }, [fetchSensors]);

  useEffect(() => {
    fetch('/api/metadata/version')
      .then((r) => r.json())
      .then((d) => setMetadataVersion(d.version ?? 0))
      .catch(() => {});
  }, [sensors]);

  const filtered = sensors.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType && s.type !== filterType) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    return true;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDrawerOpen(true);
  };

  const openEdit = (s: Sensor) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      type: s.type,
      protocol: s.protocol,
      frequency: s.frequency,
      unit: s.unit,
      rangeMin: s.rangeMin,
      rangeMax: s.rangeMax,
      tags: s.tags,
      status: s.status,
    });
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    if (editingId) {
      await updateSensor(editingId, form);
    } else {
      await createSensor(form);
    }
    setDrawerOpen(false);
  };

  const handleSync = async () => {
    await fetch('/api/metadata/sync', { method: 'POST' }).catch(() => {});
    await fetchSensors();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-status-offline" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索传感器..."
            className="w-full h-9 pl-9 pr-3 rounded border border-dark-border bg-dark-bg text-sm text-white placeholder:text-status-offline focus:outline-none focus:border-accent"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
        >
          <option value="">全部类型</option>
          {sensorTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
        >
          <option value="">全部状态</option>
          <option value="online">在线</option>
          <option value="offline">离线</option>
          <option value="alarm">告警</option>
        </select>
        <div className="flex-1" />
        <PermissionGuard permission="sensor:write">
          <button
            onClick={openCreate}
            className="flex items-center gap-1 h-9 px-4 rounded bg-accent text-dark-bg text-sm font-medium hover:bg-accent/90"
          >
            <Plus size={14} /> 新增
          </button>
        </PermissionGuard>
      </div>

      <div className="rounded border border-dark-border bg-dark-card overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-border text-left text-status-offline">
              <th className="px-4 py-3 font-normal">名称</th>
              <th className="px-4 py-3 font-normal">类型</th>
              <th className="px-4 py-3 font-normal">协议</th>
              <th className="px-4 py-3 font-normal">频率(ms)</th>
              <th className="px-4 py-3 font-normal">单位</th>
              <th className="px-4 py-3 font-normal">量程</th>
              <th className="px-4 py-3 font-normal">状态</th>
              <th className="px-4 py-3 font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-dark-border hover:bg-dark-border/20">
                <td className="px-4 py-3 text-white font-mono">{s.name}</td>
                <td className="px-4 py-3">{s.type}</td>
                <td className="px-4 py-3">{s.protocol}</td>
                <td className="px-4 py-3 font-mono">{s.frequency}</td>
                <td className="px-4 py-3">{s.unit}</td>
                <td className="px-4 py-3 font-mono">{s.rangeMin}~{s.rangeMax}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <StatusIndicator status={s.status} size={6} />
                    <span className={
                      s.status === 'online' ? 'text-status-online' :
                      s.status === 'alarm' ? 'text-status-alarm' : 'text-status-offline'
                    }>{s.status}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <PermissionGuard permission="sensor:write">
                      <button onClick={() => openEdit(s)} className="text-status-offline hover:text-accent">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => deleteSensor(s.id)} className="text-status-offline hover:text-status-alarm">
                        <Trash2 size={14} />
                      </button>
                    </PermissionGuard>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-status-offline">
                  {loading ? '加载中...' : '暂无数据'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 rounded border border-dark-border bg-dark-card p-4">
        <span className="text-xs text-status-offline">元数据版本:</span>
        <span className="font-mono text-sm text-accent">v{metadataVersion}</span>
        <PermissionGuard permission="metadata:write">
          <button
            onClick={handleSync}
            className="flex items-center gap-1 h-7 px-3 rounded border border-dark-border text-xs text-status-offline hover:text-accent hover:border-accent transition-colors"
          >
            <RefreshCw size={12} /> 同步
          </button>
        </PermissionGuard>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-96 bg-dark-card border-l border-dark-border p-6 overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-mono text-white">{editingId ? '编辑传感器' : '新增传感器'}</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-status-offline hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-status-offline mb-1">名称</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-status-offline mb-1">类型</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
                >
                  {sensorTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-status-offline mb-1">协议</label>
                <select
                  value={form.protocol}
                  onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                  className="w-full h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
                >
                  {sensorProtocols.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-status-offline mb-1">采集频率(ms)</label>
                <input
                  type="number"
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: Number(e.target.value) })}
                  className="w-full h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-status-offline mb-1">单位</label>
                <input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-status-offline mb-1">量程下限</label>
                  <input
                    type="number"
                    value={form.rangeMin}
                    onChange={(e) => setForm({ ...form, rangeMin: Number(e.target.value) })}
                    className="w-full h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-status-offline mb-1">量程上限</label>
                  <input
                    type="number"
                    value={form.rangeMax}
                    onChange={(e) => setForm({ ...form, rangeMax: Number(e.target.value) })}
                    className="w-full h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
              <button
                onClick={handleSubmit}
                className="w-full h-9 rounded bg-accent text-dark-bg text-sm font-medium hover:bg-accent/90"
              >
                {editingId ? '保存' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

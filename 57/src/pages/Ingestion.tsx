import { useState, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import type { Station, StationStatus } from '../../shared/types'
import {
  Plus,
  Wifi,
  WifiOff,
  AlertTriangle,
  MapPin,
  Clock,
  Activity,
  Server,
} from 'lucide-react'

const STATUS_CONFIG: Record<StationStatus, { label: string; color: string; icon: typeof Wifi }> = {
  online: { label: '在线', color: '#00D4AA', icon: Wifi },
  offline: { label: '离线', color: '#6B7280', icon: WifiOff },
  warning: { label: '告警', color: '#F59E0B', icon: AlertTriangle },
}

interface NewStationForm {
  name: string
  lat: number
  lng: number
  river: string
  dataFormat: string
  metrics: string[]
}

export default function Ingestion() {
  const { stations, fetchStations, addStation } = useStore()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewStationForm>({
    name: '',
    lat: 0,
    lng: 0,
    river: '',
    dataFormat: 'auto',
    metrics: ['waterLevel', 'flowRate', 'rainfall', 'waterTemp'],
  })

  useEffect(() => {
    fetchStations()
  }, [fetchStations])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await addStation(form)
    setShowForm(false)
    setForm({
      name: '',
      lat: 0,
      lng: 0,
      river: '',
      dataFormat: 'auto',
      metrics: ['waterLevel', 'flowRate', 'rainfall', 'waterTemp'],
    })
    fetchStations()
  }

  const onlineCount = stations.filter((s) => s.status === 'online').length
  const offlineCount = stations.filter((s) => s.status === 'offline').length
  const warningCount = stations.filter((s) => s.status === 'warning').length

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="grid grid-cols-4 gap-4">
        <div className="card-hover p-4 animate-slide-up" style={{ animationDelay: '0ms' }}>
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-accent" />
            <span className="text-xs text-gray-400">总站点</span>
          </div>
          <span className="text-2xl font-mono font-bold text-white">{stations.length}</span>
        </div>
        <div className="card-hover p-4 animate-slide-up" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center gap-2 mb-2">
            <Wifi className="w-4 h-4 text-accent" />
            <span className="text-xs text-gray-400">在线</span>
          </div>
          <span className="text-2xl font-mono font-bold text-accent">{onlineCount}</span>
        </div>
        <div className="card-hover p-4 animate-slide-up" style={{ animationDelay: '160ms' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-alert-yellow" />
            <span className="text-xs text-gray-400">告警</span>
          </div>
          <span className="text-2xl font-mono font-bold text-alert-yellow">{warningCount}</span>
        </div>
        <div className="card-hover p-4 animate-slide-up" style={{ animationDelay: '240ms' }}>
          <div className="flex items-center gap-2 mb-2">
            <WifiOff className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-400">离线</span>
          </div>
          <span className="text-2xl font-mono font-bold text-gray-500">{offlineCount}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">站点管理</h3>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/20 text-accent border border-accent/30 rounded-lg text-xs font-medium hover:bg-accent/30 transition-colors"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="w-3.5 h-3.5" />
          添加站点
        </button>
      </div>

      {showForm && (
        <div className="card p-5 animate-slide-up">
          <h4 className="text-sm font-medium text-gray-300 mb-4">新增站点</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">站点名称</label>
                <input
                  type="text"
                  className="w-full bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">所属河流</label>
                <input
                  type="text"
                  className="w-full bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                  value={form.river}
                  onChange={(e) => setForm({ ...form, river: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">纬度</label>
                <input
                  type="number"
                  step="any"
                  className="w-full bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-accent/50"
                  value={form.lat}
                  onChange={(e) => setForm({ ...form, lat: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">经度</label>
                <input
                  type="number"
                  step="any"
                  className="w-full bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-accent/50"
                  value={form.lng}
                  onChange={(e) => setForm({ ...form, lng: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">数据格式</label>
              <select
                className="bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                value={form.dataFormat}
                onChange={(e) => setForm({ ...form, dataFormat: e.target.value })}
              >
                <option value="auto">自动识别</option>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="xml">XML</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">监测指标</label>
              <div className="flex flex-wrap gap-2">
                {['waterLevel', 'flowRate', 'rainfall', 'waterTemp', 'ph', 'dissolvedOxygen'].map(
                  (metric) => (
                    <label
                      key={metric}
                      className={`px-2.5 py-1 rounded text-xs border cursor-pointer transition-colors ${
                        form.metrics.includes(metric)
                          ? 'bg-accent/20 border-accent/40 text-accent'
                          : 'bg-primary-light/30 border-primary-light/30 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={form.metrics.includes(metric)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            metrics: e.target.checked
                              ? [...form.metrics, metric]
                              : form.metrics.filter((m) => m !== metric),
                          })
                        }
                      />
                      {{
                        waterLevel: '水位',
                        flowRate: '流量',
                        rainfall: '降雨量',
                        waterTemp: '水温',
                        ph: 'pH值',
                        dissolvedOxygen: '溶解氧',
                      }[metric]}
                    </label>
                  )
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-accent/20 text-accent border border-accent/30 rounded-lg text-sm font-medium hover:bg-accent/30 transition-colors"
              >
                提交
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-primary-light/30 text-gray-400 border border-primary-light/20 rounded-lg text-sm hover:text-gray-200 transition-colors"
                onClick={() => setShowForm(false)}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {stations.map((station, i) => {
          const statusCfg = STATUS_CONFIG[station.status]
          const StatusIcon = statusCfg.icon
          return (
            <div
              key={station.id}
              className="card-hover p-4 animate-slide-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity
                    className="w-4 h-4"
                    style={{ color: statusCfg.color }}
                  />
                  <span className="text-sm font-medium text-white">{station.name}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: statusCfg.color }}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {statusCfg.label}
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-gray-400">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {station.river} · {station.lat.toFixed(4)}, {station.lng.toFixed(4)}
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {station.lastReportTime
                    ? new Date(station.lastReportTime).toLocaleString('zh-CN')
                    : '暂无数据上报'}
                </div>
                <div className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5" />
                  数据格式: {station.dataFormat}
                </div>
              </div>

              {station.metrics && station.metrics.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {station.metrics.map((m) => (
                    <span
                      key={m}
                      className="px-1.5 py-0.5 bg-primary-light/30 rounded text-[10px] text-gray-400"
                    >
                      {{
                        waterLevel: '水位',
                        flowRate: '流量',
                        rainfall: '降雨量',
                        waterTemp: '水温',
                        ph: 'pH',
                        dissolvedOxygen: '溶解氧',
                      }[m] || m}
                    </span>
                  ))}
                </div>
              )}

              {station.latestValues && (
                <div className="mt-3 pt-3 border-t border-primary-light/20 grid grid-cols-2 gap-2">
                  {Object.entries(station.latestValues).map(([k, v]) => (
                    <div key={k} className="text-xs">
                      <span className="text-gray-500">
                        {{
                          waterLevel: '水位',
                          flowRate: '流量',
                          rainfall: '降雨量',
                          waterTemp: '水温',
                          ph: 'pH',
                          dissolvedOxygen: '溶解氧',
                        }[k] || k}
                      </span>
                      <span className="ml-1.5 font-mono text-gray-300">{v}</span>
                      <span className="text-gray-600 ml-0.5">
                        {{
                          waterLevel: 'm',
                          flowRate: 'm³/s',
                          rainfall: 'mm',
                          waterTemp: '°C',
                          ph: '',
                          dissolvedOxygen: 'mg/L',
                        }[k] || ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

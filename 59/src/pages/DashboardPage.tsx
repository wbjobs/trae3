import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeviceStore } from '@/stores/deviceStore'
import { useAlertStore } from '@/stores/alertStore'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Wifi, WifiOff, AlertTriangle, Activity, TrendingUp, Clock, ChevronRight, Thermometer, Droplets, Zap, Flame } from 'lucide-react'
import StatusCard from '@/components/dashboard/StatusCard'
import HealthBar from '@/components/dashboard/HealthBar'
import type { TrendPoint } from '../../shared/types'

const PARAM_COLORS = ['#00F0FF', '#00E676', '#FF8C00', '#FF1744', '#A855F7', '#EAB308']

const TYPE_CONFIG = {
  hvac: { label: '暖通空调', icon: Thermometer, color: '#00F0FF' },
  plumbing: { label: '给排水', icon: Droplets, color: '#3B82F6' },
  electrical: { label: '电气', icon: Zap, color: '#EAB308' },
  fire: { label: '消防', icon: Flame, color: '#FF1744' },
} as const

const LEVEL_STYLE = {
  critical: { bg: 'bg-red-alert/20', text: 'text-red-alert', label: '严重' },
  major: { bg: 'bg-amber-warn/20', text: 'text-amber-warn', label: '重要' },
  minor: { bg: 'bg-yellow-500/20', text: 'text-yellow-500', label: '一般' },
} as const

export default function DashboardPage() {
  const navigate = useNavigate()
  const { devices, selectedDevice, stats, fetchDevices, fetchStats, fetchTrend, setSelectedDevice } = useDeviceStore()
  const { alerts, fetchAlerts } = useAlertStore()
  const [trendData, setTrendData] = useState<Record<string, TrendPoint[]>>({})
  const [trendLoading, setTrendLoading] = useState(false)

  useEffect(() => {
    fetchDevices()
    fetchStats()
    fetchAlerts({ status: 'active' })
  }, [])

  useEffect(() => {
    if (!selectedDevice) {
      setTrendData({})
      return
    }
    let cancelled = false
    const load = async () => {
      setTrendLoading(true)
      const results: Record<string, TrendPoint[]> = {}
      for (const param of selectedDevice.params) {
        const data = await fetchTrend(selectedDevice.id, param.key, 24)
        if (cancelled) return
        results[param.key] = data
      }
      if (!cancelled) {
        setTrendData(results)
        setTrendLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedDevice])

  const typeBreakdown = useMemo(() => {
    const types = Object.keys(TYPE_CONFIG) as (keyof typeof TYPE_CONFIG)[]
    return types.map(type => {
      const typeDevices = devices.filter(d => d.type === type)
      return {
        type,
        online: typeDevices.filter(d => d.status === 'online').length,
        alarm: typeDevices.filter(d => d.status === 'alarm').length,
        total: typeDevices.length,
      }
    })
  }, [devices])

  const lowHealthDevices = useMemo(() => {
    return devices
      .filter(d => d.healthScore < 80)
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, 8)
  }, [devices])

  const chartData = useMemo(() => {
    const timeMap = new Map<number, Record<string, number>>()
    for (const [key, points] of Object.entries(trendData)) {
      for (const point of points) {
        const existing = timeMap.get(point.timestamp) || {}
        existing[key] = point.value
        timeMap.set(point.timestamp, existing)
      }
    }
    return Array.from(timeMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([timestamp, values]) => ({
        time: new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        ...values,
      }))
  }, [trendData])

  const recentAlerts = useMemo(() => alerts.slice(0, 10), [alerts])

  const handleDeviceSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const device = devices.find(d => d.id === e.target.value) || null
    setSelectedDevice(device)
  }, [devices, setSelectedDevice])

  return (
    <div className="h-full p-4 overflow-y-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold neon-text flex items-center gap-2">
          <Activity className="w-6 h-6" />
          监控大屏
        </h1>
        <select
          value={selectedDevice?.id || ''}
          onChange={handleDeviceSelect}
          className="bg-steel-gray border border-neon-cyan/20 rounded-lg px-3 py-2 text-sm font-body text-slate-200 focus:outline-none focus:border-neon-cyan/50 transition-colors"
        >
          <option value="">选择设备查看趋势</option>
          {devices.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatusCard title="在线设备" value={stats?.online ?? 0} icon={Wifi} color="green-ok" />
        <StatusCard title="离线设备" value={stats?.offline ?? 0} icon={WifiOff} color="slate" />
        <StatusCard title="告警设备" value={stats?.alarm ?? 0} icon={AlertTriangle} color="red-alert" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel p-4">
          <h2 className="font-display text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-neon-cyan" />
            设备类型分布
          </h2>
          <div className="space-y-3">
            {typeBreakdown.map(({ type, online, alarm, total }) => {
              const config = TYPE_CONFIG[type]
              const Icon = config.icon
              return (
                <div key={type} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-24 shrink-0">
                    <Icon className="w-4 h-4" style={{ color: config.color }} />
                    <span className="text-sm font-body text-slate-300">{config.label}</span>
                  </div>
                  <div className="flex-1 h-6 bg-slate-700/30 rounded overflow-hidden flex">
                    <div
                      className="h-full bg-green-ok/70 transition-all duration-500"
                      style={{ width: total > 0 ? `${(online / total) * 100}%` : '0%' }}
                    />
                    <div
                      className="h-full bg-red-alert/70 transition-all duration-500"
                      style={{ width: total > 0 ? `${(alarm / total) * 100}%` : '0%' }}
                    />
                  </div>
                  <div className="flex items-center gap-2 w-20 justify-end text-xs font-body shrink-0">
                    <span className="text-green-ok">{online}</span>
                    <span className="text-red-alert">{alarm}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="glass-panel p-4">
          <h2 className="font-display text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-neon-cyan" />
            健康评分（低于80）
          </h2>
          {lowHealthDevices.length === 0 ? (
            <p className="text-sm text-slate-500 font-body py-4 text-center">所有设备健康评分正常</p>
          ) : (
            <div className="space-y-1">
              {lowHealthDevices.map(d => (
                <HealthBar key={d.id} deviceName={d.name} healthScore={d.healthScore} status={d.status} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel p-4">
          <h2 className="font-display text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-neon-cyan" />
            参数趋势
            {selectedDevice && (
              <span className="text-sm text-neon-cyan font-body ml-2">— {selectedDevice.name}</span>
            )}
          </h2>
          {!selectedDevice ? (
            <p className="text-sm text-slate-500 font-body py-8 text-center">请选择设备查看趋势数据</p>
          ) : trendLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <p className="text-sm text-slate-500 font-body py-8 text-center">暂无趋势数据</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <defs>
                  {selectedDevice.params.map((param, i) => (
                    <linearGradient key={param.key} id={`grad-${param.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PARAM_COLORS[i % PARAM_COLORS.length]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={PARAM_COLORS[i % PARAM_COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,240,255,0.06)" />
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="rgba(0,240,255,0.1)" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="rgba(0,240,255,0.1)" />
                <Tooltip
                  contentStyle={{
                    background: '#1E293B',
                    border: '1px solid rgba(0,240,255,0.2)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                {selectedDevice.params.map((param, i) => (
                  <Area
                    key={param.key}
                    type="monotone"
                    dataKey={param.key}
                    name={param.label}
                    stroke={PARAM_COLORS[i % PARAM_COLORS.length]}
                    fill={`url(#grad-${param.key})`}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-panel p-4">
          <h2 className="font-display text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-neon-cyan" />
            最近告警
          </h2>
          {recentAlerts.length === 0 ? (
            <p className="text-sm text-slate-500 font-body py-8 text-center">暂无告警</p>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {recentAlerts.map(alert => {
                const style = LEVEL_STYLE[alert.level]
                return (
                  <div
                    key={alert.id}
                    onClick={() => navigate('/alerts')}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-700/50 cursor-pointer transition-colors group"
                  >
                    <span className="text-xs text-slate-500 font-body w-12 shrink-0">
                      {new Date(alert.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-sm text-slate-300 font-body flex-1 truncate">{alert.deviceName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-body ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                    <span className="text-xs text-slate-400 font-body flex-1 truncate">{alert.message}</span>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-neon-cyan transition-colors shrink-0" />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

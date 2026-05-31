import { useEffect, useState } from 'react'
import { useDeviceStore } from '@/stores/deviceStore'
import { useAlertStore } from '@/stores/alertStore'
import { useGroupStore } from '@/stores/groupStore'
import StatCards from '@/components/StatCards'
import DeviceGrid from '@/components/DeviceGrid'
import TrendChart from '@/components/TrendChart'
import { AlertTriangle } from 'lucide-react'
import type { Device } from '../../shared/types'

const levelColors: Record<string, string> = {
  critical: 'bg-inv-fault',
  warning: 'bg-inv-warning',
  info: 'bg-inv-primary',
}

export default function Dashboard() {
  const devices = useDeviceStore((s) => s.devices)
  const stats = useDeviceStore((s) => s.stats)
  const fetchDevices = useDeviceStore((s) => s.fetchDevices)
  const fetchStats = useDeviceStore((s) => s.fetchStats)
  const alerts = useAlertStore((s) => s.alerts)
  const fetchAlerts = useAlertStore((s) => s.fetchAlerts)
  const groups = useGroupStore((s) => s.groups)
  const selectedGroupId = useGroupStore((s) => s.selectedGroupId)
  const fetchGroups = useGroupStore((s) => s.fetchGroups)
  const setSelectedGroup = useGroupStore((s) => s.setSelectedGroup)
  const getGroupDevices = useGroupStore((s) => s.getGroupDevices)
  const [trendData, setTrendData] = useState<{ time: string; power: number }[]>([])

  useEffect(() => {
    fetchDevices()
    fetchStats()
    fetchAlerts()
    fetchGroups()
  }, [fetchDevices, fetchStats, fetchAlerts, fetchGroups])

  useEffect(() => {
    const fetchTrend = async () => {
      try {
        const res = await fetch('/api/devices/trend?range=24h')
        const data = await res.json()
        setTrendData(data.records ?? [])
      } catch {
        const now = Date.now()
        const points = Array.from({ length: 24 }, (_, i) => ({
          time: new Date(now - (23 - i) * 3600000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          power: Math.round((80 + Math.random() * 40) * 10) / 10,
        }))
        setTrendData(points)
      }
    }
    fetchTrend()
  }, [])

  const filteredDevices = getGroupDevices(selectedGroupId, devices)

  const recentAlerts = alerts.slice(0, 5)

  const getGroupDeviceCount = (groupId: string) => {
    return groups.find((g) => g.id === groupId)?.deviceCount || 0
  }

  return (
    <div className="space-y-4">
      <StatCards stats={stats} />

      <div className="bg-inv-card border border-inv-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-medium text-slate-400">设备分组</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedGroup(null)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedGroupId === null
                ? 'bg-inv-primary text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
          >
            全部
            <span className="ml-2 text-xs opacity-70">({devices.length})</span>
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => setSelectedGroup(group.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedGroupId === group.id
                  ? 'text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
              style={selectedGroupId === group.id ? { backgroundColor: group.color } : {}}
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: group.color }}
              />
              {group.name}
              <span className="ml-2 text-xs opacity-70">({getGroupDeviceCount(group.id)})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <h2 className="text-sm font-medium text-slate-400 mb-3">设备状态</h2>
          <DeviceGrid devices={filteredDevices} />
        </div>
        <div>
          <TrendChart data={trendData} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-slate-400 mb-3">最近告警</h2>
        <div className="bg-inv-card border border-inv-border rounded-lg divide-y divide-inv-border">
          {recentAlerts.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">暂无告警</div>
          ) : (
            recentAlerts.map((alert) => (
              <div key={alert.id} className="flex items-center gap-3 px-4 py-3 animate-slide-in">
                <div className={`w-1 h-8 rounded-full ${levelColors[alert.level]}`} />
                <AlertTriangle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm font-medium">{alert.deviceName}</span>
                <span className="text-sm text-slate-400 flex-1 truncate">{alert.message}</span>
                <span className="text-xs text-slate-500 font-mono">
                  {new Date(alert.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

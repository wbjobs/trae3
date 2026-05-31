import { useEffect } from 'react'
import { useMonitorStore } from '@/stores/monitorStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useSSE } from '@/hooks/useSSE'
import FilterPanel from '@/components/FilterPanel'
import HealthCards from '@/components/HealthCards'
import StreamingMetricChart from '@/components/StreamingMetricChart'
import VirtualAnomalyList from '@/components/VirtualAnomalyList'
import ServiceOverview from '@/components/ServiceOverview'
import { Wifi, WifiOff, Radio, ZapOff } from 'lucide-react'

export default function Dashboard() {
  const { updateHealth, updateAnomalies, updateServices } = useMonitorStore()
  const wsConnected = useMonitorStore((s) => s.wsConnected)
  const sseConnected = useMonitorStore((s) => s.sseConnected)
  const streamStats = useMonitorStore((s) => s.streamStats)
  useWebSocket()
  useSSE()

  useEffect(() => {
    fetch('/api/metrics/health')
      .then((res) => res.json())
      .then((data) => updateHealth(data.health ?? []))
      .catch(() => {})

    fetch('/api/anomalies')
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.anomalies ?? []
        updateAnomalies(list)
      })
      .catch(() => {})

    fetch('/api/services')
      .then((res) => res.json())
      .then((data) => updateServices(data.services ?? []))
      .catch(() => {})
  }, [])

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="flex items-center justify-between">
        <FilterPanel />
        <div className="flex items-center gap-4 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            {wsConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-ops-accent" />
                <span className="text-ops-accent font-mono">WS LIVE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-ops-critical" />
                <span className="text-ops-critical font-mono">WS OFFLINE</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {sseConnected ? (
              <>
                <Radio className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-blue-400 font-mono">SSE LIVE</span>
              </>
            ) : (
              <>
                <ZapOff className="w-3.5 h-3.5 text-ops-critical" />
                <span className="text-ops-critical font-mono">SSE OFFLINE</span>
              </>
            )}
          </div>
          {streamStats && (
            <div className="flex items-center gap-3 text-ops-muted font-mono">
              <span>{streamStats.totalPointsProcessed.toLocaleString()} pts</span>
              <span>{streamStats.pointsPerSecond.toFixed(1)}/s</span>
              <span>{streamStats.anomaliesDetected} anomalies</span>
              <span>{streamStats.processingLatencyMs}ms</span>
            </div>
          )}
        </div>
      </div>

      <HealthCards />

      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
        <div className="col-span-2 flex flex-col min-h-0">
          <StreamingMetricChart height="100%" />
        </div>
        <div className="col-span-1 min-h-0">
          <VirtualAnomalyList />
        </div>
      </div>

      <ServiceOverview />
    </div>
  )
}

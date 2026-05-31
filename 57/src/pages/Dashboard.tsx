import { useEffect } from 'react'
import { Droplets, Wind, CloudRain, Thermometer } from 'lucide-react'
import { useStore } from '@/store/useStore'
import MetricCard from '@/components/MetricCard'
import AlertTicker from '@/components/AlertTicker'
import StationMap from '@/components/StationMap'
import MiniChart from '@/components/MiniChart'
import { METRIC_LABELS, METRIC_UNITS } from '../../shared/types'

export default function Dashboard() {
  const { dashboardData, fetchDashboard, fetchAlerts, alerts, setCurrentStation, currentStation, stations, fetchStations } = useStore()

  useEffect(() => {
    fetchDashboard()
    fetchAlerts()
    fetchStations()
  }, [fetchDashboard, fetchAlerts, fetchStations])

  const summary = dashboardData?.summary
  const stationStatuses = dashboardData?.stationStatuses || stations

  const metrics = [
    {
      key: 'waterLevel',
      icon: Droplets,
      label: METRIC_LABELS.waterLevel,
      value: summary?.avgWaterLevel?.toFixed(2) ?? '--',
      unit: METRIC_UNITS.waterLevel,
      trend: 2.3,
    },
    {
      key: 'flowRate',
      icon: Wind,
      label: METRIC_LABELS.flowRate,
      value: '156.8',
      unit: METRIC_UNITS.flowRate,
      trend: -1.2,
    },
    {
      key: 'rainfall',
      icon: CloudRain,
      label: METRIC_LABELS.rainfall,
      value: '24.6',
      unit: METRIC_UNITS.rainfall,
      trend: 5.8,
    },
    {
      key: 'waterTemp',
      icon: Thermometer,
      label: METRIC_LABELS.waterTemp,
      value: '18.3',
      unit: METRIC_UNITS.waterTemp,
      trend: 0.5,
    },
  ]

  const sparkData = {
    waterLevel: [12.1, 12.3, 12.5, 12.4, 12.8, 13.0, 12.9, 13.2, 13.1, 13.3],
    flowRate: [160, 158, 155, 157, 152, 150, 148, 155, 157, 156],
    rainfall: [5, 8, 12, 18, 22, 25, 20, 28, 24, 24],
    waterTemp: [17.5, 17.8, 18.0, 18.1, 18.2, 18.0, 18.3, 18.5, 18.2, 18.3],
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <MetricCard
            key={m.key}
            icon={m.icon}
            label={m.label}
            value={m.value}
            unit={m.unit}
            trend={m.trend}
            sparkData={sparkData[m.key as keyof typeof sparkData]}
            delay={i * 80}
          />
        ))}
      </div>

      <AlertTicker alerts={Array.isArray(alerts) ? alerts.filter((a) => a.status === 'active') : []} />

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <StationMap
            stations={stationStatuses}
            onSelectStation={setCurrentStation}
            selectedStationId={currentStation}
          />
        </div>
        <div className="col-span-2">
          <MiniChart />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card-hover p-5 animate-slide-up" style={{ animationDelay: '400ms' }}>
          <div className="text-sm text-gray-400 mb-2">在线站点</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-accent">
              {summary?.onlineStations ?? '--'}
            </span>
            <span className="text-sm text-gray-500">
              / {summary?.totalStations ?? '--'}
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-primary-light/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent/60 rounded-full transition-all duration-500"
              style={{
                width: summary
                  ? `${(summary.onlineStations / summary.totalStations) * 100}%`
                  : '0%',
              }}
            />
          </div>
        </div>
        <div className="card-hover p-5 animate-slide-up" style={{ animationDelay: '480ms' }}>
          <div className="text-sm text-gray-400 mb-2">活跃预警</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-alert-orange">
              {summary?.activeAlerts ?? '--'}
            </span>
            <span className="text-sm text-gray-500">条</span>
          </div>
        </div>
        <div className="card-hover p-5 animate-slide-up" style={{ animationDelay: '560ms' }}>
          <div className="text-sm text-gray-400 mb-2">平均水位</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-white">
              {summary?.avgWaterLevel?.toFixed(2) ?? '--'}
            </span>
            <span className="text-sm text-gray-500">{METRIC_UNITS.waterLevel}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

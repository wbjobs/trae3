import { useNavigate } from 'react-router-dom'
import type { Device } from '../../shared/types'

interface DeviceGridProps {
  devices: Device[]
}

const statusColors: Record<Device['status'], string> = {
  online: 'bg-inv-online',
  warning: 'bg-inv-warning',
  fault: 'bg-inv-fault',
  offline: 'bg-slate-500',
}

const statusLabels: Record<Device['status'], string> = {
  online: '在线',
  warning: '告警',
  fault: '故障',
  offline: '离线',
}

const pulseClass: Record<Device['status'], string> = {
  online: 'animate-pulse-green',
  fault: 'animate-pulse-red',
  warning: '',
  offline: '',
}

export default function DeviceGrid({ devices }: DeviceGridProps) {
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-4 gap-3">
      {devices.map((device) => (
        <div
          key={device.id}
          onClick={() => navigate(`/device/${device.id}`)}
          className="bg-inv-card border border-inv-border rounded-lg p-3 cursor-pointer hover:border-inv-primary/50 transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium truncate">{device.name}</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${statusColors[device.status]} ${pulseClass[device.status]}`} />
              <span className="text-xs text-slate-400">{statusLabels[device.status]}</span>
            </div>
          </div>
          <div className="text-xs text-slate-500 mb-2">{device.model}</div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">
              功率 <span className="font-mono text-slate-200">{device.params.acPower.toFixed(1)}</span> kW
            </span>
            <span className="text-slate-400">
              温度 <span className="font-mono text-slate-200">{device.params.temperature.toFixed(0)}</span> °C
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-inv-border text-xs text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex justify-between">
              <span>AC电压: <span className="font-mono text-slate-300">{device.params.acVoltage.toFixed(1)}V</span></span>
              <span>DC电压: <span className="font-mono text-slate-300">{device.params.dcVoltage.toFixed(1)}V</span></span>
            </div>
            <div className="flex justify-between mt-1">
              <span>效率: <span className="font-mono text-slate-300">{device.params.efficiency.toFixed(1)}%</span></span>
              <span>日发电: <span className="font-mono text-slate-300">{device.params.dailyEnergy.toFixed(1)}kWh</span></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

import { useRealtimeStore } from '../../store/useRealtimeStore'

const statusMap = {
  online: { dot: 'bg-accent', label: '在线' },
  fault: { dot: 'bg-fault', label: '故障' },
  offline: { dot: 'bg-text-secondary', label: '离线' },
} as const

export default function DevicePanel() {
  const devices = useRealtimeStore((s) => s.devices)

  return (
    <div className="bg-bg-card rounded-xl border border-border-default p-3">
      <h3 className="text-sm font-semibold text-text-primary mb-3 px-1">设备状态</h3>
      <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1">
        {devices.map((device) => {
          const st = statusMap[device.status]
          return (
            <div
              key={device.deviceId}
              className="bg-bg-primary rounded-lg border border-border-default p-2.5 hover:border-accent/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                <span className="text-xs text-text-primary font-medium truncate">
                  {device.deviceId}
                </span>
              </div>
              <div className="text-[10px] text-text-secondary">
                {device.deviceType === 'inverter' ? '逆变器' : '组串'} · {st.label}
              </div>
              <div className="text-[10px] text-text-secondary/60 mt-0.5">
                {new Date(device.lastUpdate).toLocaleTimeString('zh-CN', { hour12: false })}
              </div>
            </div>
          )
        })}
        {devices.length === 0 && (
          <div className="col-span-2 text-center text-text-secondary text-xs py-8">
            暂无设备数据
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useMemo } from 'react'
import {
  Search,
  X,
  Layers,
  Building2,
  Thermometer,
  Droplets,
  Zap,
  Flame,
  Heart,
  Activity,
  Scissors,
  MapPin,
  ChevronDown,
  Plus,
} from 'lucide-react'
import { useDeviceStore } from '@/stores/deviceStore'
import type { Device, MarkerPoint } from '../../../shared/types'

const layerLabels: {
  key: 'hvac' | 'plumbing' | 'electrical' | 'fire'
  label: string
  color: string
  icon: typeof Thermometer
}[] = [
  { key: 'hvac', label: '暖通', color: 'text-red-400', icon: Thermometer },
  { key: 'plumbing', label: '给排水', color: 'text-blue-400', icon: Droplets },
  { key: 'electrical', label: '电气', color: 'text-yellow-400', icon: Zap },
  { key: 'fire', label: '消防', color: 'text-orange-400', icon: Flame },
]

const markerTypeLabels: Record<MarkerPoint['type'], { label: string; color: string; icon: string }> = {
  inspection: { label: '巡检', color: 'text-green-400', icon: '📋' },
  maintenance: { label: '维护', color: 'text-amber-400', icon: '🔧' },
  danger: { label: '危险', color: 'text-red-400', icon: '⚠️' },
  note: { label: '备注', color: 'text-blue-400', icon: '📝' },
}

function SearchBar() {
  const [showDropdown, setShowDropdown] = useState(false)
  const devices = useDeviceStore((s) => s.devices)
  const searchQuery = useDeviceStore((s) => s.searchQuery)
  const setSearchQuery = useDeviceStore((s) => s.setSearchQuery)
  const setSelectedDevice = useDeviceStore((s) => s.setSelectedDevice)

  const filtered = useMemo(() => {
    if (!searchQuery) return []
    return devices
      .filter(
        (d) =>
          d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.code.toLowerCase().includes(searchQuery.toLowerCase()),
      )
      .slice(0, 6)
  }, [devices, searchQuery])

  return (
    <div className="relative">
      <div className="glass-panel neon-border flex items-center gap-2 px-3 py-2 w-80">
        <Search className="w-4 h-4 text-neon-cyan" />
        <input
          type="text"
          placeholder="搜索设备名称/编号..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          className="bg-transparent border-none outline-none text-sm text-slate-200 flex-1 font-body"
        />
      </div>
      {showDropdown && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 glass-panel rounded-lg overflow-hidden z-50">
          {filtered.map((device) => (
            <div
              key={device.id}
              className="px-3 py-2 hover:bg-neon-cyan/10 cursor-pointer text-sm border-b border-neon-cyan/10 last:border-0"
              onClick={() => {
                setSelectedDevice(device)
                setSearchQuery('')
              }}
            >
              <div className="font-body font-medium text-slate-200">{device.name}</div>
              <div className="text-xs text-slate-500">{device.code}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LayerControl() {
  const layers = useDeviceStore((s) => s.layers)
  const toggleLayer = useDeviceStore((s) => s.toggleLayer)

  return (
    <div className="glass-panel p-3 w-44">
      <div className="flex items-center gap-2 mb-2">
        <Layers className="w-4 h-4 text-neon-cyan" />
        <span className="font-display font-semibold text-sm">图层</span>
      </div>
      <div className="space-y-1.5">
        {layerLabels.map(({ key, label, color, icon: Icon }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-neon-cyan/5 px-1 rounded">
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={() => toggleLayer(key)}
              className="w-3.5 h-3.5 accent-cyan-500"
            />
            <Icon className={`w-3.5 h-3.5 ${color}`} />
            <span className="text-xs text-slate-300 font-body">{label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function CutPlaneControl() {
  const cutPlane = useDeviceStore((s) => s.cutPlane)
  const setCutPlane = useDeviceStore((s) => s.setCutPlane)
  const toggleCutPlane = useDeviceStore((s) => s.toggleCutPlane)
  const [expanded, setExpanded] = useState(true)

  const axisRanges = {
    x: { min: -25, max: 25, step: 1 },
    y: { min: -1, max: 12, step: 0.5 },
    z: { min: -20, max: 20, step: 1 },
  }

  return (
    <div className="glass-panel p-3 w-56">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Scissors className="w-4 h-4 text-neon-cyan" />
          <span className="font-display font-semibold text-sm">剖切</span>
        </div>
        <div className="flex items-center gap-1">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={cutPlane.enabled}
              onChange={toggleCutPlane}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-neon-cyan"></div>
          </label>
          <button onClick={() => setExpanded(!expanded)} className="p-0.5 hover:bg-neon-cyan/10 rounded">
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          </button>
        </div>
      </div>

      {expanded && cutPlane.enabled && (
        <div className="space-y-3">
          <div className="flex gap-1">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <button
                key={axis}
                onClick={() => setCutPlane({ axis })}
                className={`flex-1 py-1 text-xs font-mono rounded transition-all ${
                  cutPlane.axis === axis
                    ? 'bg-neon-cyan/20 text-neon-cyan neon-border'
                    : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
                }`}
              >
                {axis.toUpperCase()}
              </button>
            ))}
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>位置</span>
              <span className="text-neon-cyan">{cutPlane.position.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={axisRanges[cutPlane.axis].min}
              max={axisRanges[cutPlane.axis].max}
              step={axisRanges[cutPlane.axis].step}
              value={cutPlane.position}
              onChange={(e) => setCutPlane({ position: Number(e.target.value) })}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-neon-cyan"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cutPlane.inverse}
              onChange={(e) => setCutPlane({ inverse: e.target.checked })}
              className="w-3.5 h-3.5 accent-cyan-500"
            />
            <span className="text-xs text-slate-300 font-body">反向裁剪</span>
          </label>
        </div>
      )}
    </div>
  )
}

function MarkerControl() {
  const markers = useDeviceStore((s) => s.markers)
  const showMarkers = useDeviceStore((s) => s.showMarkers)
  const selectedMarker = useDeviceStore((s) => s.selectedMarker)
  const toggleShowMarkers = useDeviceStore((s) => s.toggleShowMarkers)
  const removeMarker = useDeviceStore((s) => s.removeMarker)
  const setSelectedMarker = useDeviceStore((s) => s.setSelectedMarker)
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="glass-panel p-3 w-56">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-neon-cyan" />
          <span className="font-display font-semibold text-sm">点位 ({markers.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showMarkers}
              onChange={toggleShowMarkers}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-neon-cyan"></div>
          </label>
          <button onClick={() => setExpanded(!expanded)} className="p-0.5 hover:bg-neon-cyan/10 rounded">
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          </button>
        </div>
      </div>

      {expanded && showMarkers && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {markers.map((marker) => {
            const config = markerTypeLabels[marker.type]
            return (
              <div
                key={marker.id}
                className={`p-2 rounded cursor-pointer transition-all ${
                  selectedMarker?.id === marker.id ? 'bg-neon-cyan/20 neon-border' : 'hover:bg-slate-700/50'
                }`}
                onClick={() => setSelectedMarker(marker)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{config.icon}</span>
                    <span className={`text-xs ${config.color} font-body`}>{marker.title}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeMarker(marker.id)
                    }}
                    className="p-0.5 hover:bg-red-500/20 rounded"
                  >
                    <X className="w-3 h-3 text-slate-500 hover:text-red-400" />
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{marker.description}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FloorSwitcher() {
  const currentFloor = useDeviceStore((s) => s.currentFloor)
  const setCurrentFloor = useDeviceStore((s) => s.setCurrentFloor)

  return (
    <div className="glass-panel p-2">
      <div className="flex items-center justify-center mb-2">
        <Building2 className="w-4 h-4 text-neon-cyan" />
      </div>
      <div className="flex flex-col items-center gap-1">
        {[2, 1, -1].map((floor) => (
          <button
            key={floor}
            onClick={() => setCurrentFloor(floor)}
            className={`w-8 h-8 rounded flex items-center justify-center text-xs font-display transition-all ${
              currentFloor === floor
                ? 'bg-neon-cyan/20 text-neon-cyan neon-border'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            {floor === -1 ? 'B1' : `${floor}F`}
          </button>
        ))}
      </div>
      <button
        onClick={() => setCurrentFloor(-1)}
        className="w-full mt-1 pt-1 border-t border-neon-cyan/20 text-[10px] flex justify-center text-slate-500 hover:text-slate-300"
      >
        全部
      </button>
    </div>
  )
}

function DeviceInfoPanel() {
  const device = useDeviceStore((s) => s.selectedDevice)
  const setSelectedDevice = useDeviceStore((s) => s.setSelectedDevice)

  if (!device) return null

  const getStatusText = (status: Device['status']) => {
    switch (status) {
      case 'online':
        return '在线'
      case 'offline':
        return '离线'
      case 'alarm':
        return '告警'
      default:
        return '在线'
    }
  }

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-ok'
    if (score >= 60) return 'text-amber-warn'
    return 'text-red-alert'
  }

  return (
    <div className="glass-panel w-80 h-full animate-slide-in overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b border-neon-cyan/10">
        <div className="font-display font-bold text-lg text-neon-cyan">{device.name}</div>
        <button onClick={() => setSelectedDevice(null)} className="p-1 hover:bg-neon-cyan/10 rounded">
          <X className="w-4 h-4 text-slate-400 hover:text-slate-200" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-500 font-body mb-1">设备编号</div>
            <div className="text-sm text-slate-200 font-body">{device.code}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 font-body mb-1">类型</div>
            <div className="text-sm text-slate-200 font-body">
              {device.type === 'hvac'
                ? '暖通空调'
                : device.type === 'plumbing'
                  ? '给排水'
                  : device.type === 'electrical'
                    ? '电气'
                    : '消防'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-500 font-body mb-1">楼层</div>
            <div className="text-sm text-slate-200 font-body">
              {device.floor === -1 ? 'B1' : `${device.floor}F`}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`status-dot status-${device.status}`}></span>
              <span className="text-sm font-body">{getStatusText(device.status)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Heart className="w-5 h-5 text-slate-400" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-body">健康评分</span>
              <span className={`text-sm font-bold font-display ${getHealthColor(device.healthScore)}`}>
                {device.healthScore}
              </span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-1">
              <div
                className={`h-full transition-all duration-500 ${
                  device.healthScore >= 80
                    ? 'bg-green-ok'
                    : device.healthScore >= 60
                      ? 'bg-amber-warn'
                      : 'bg-red-alert'
                }`}
                style={{ width: `${device.healthScore}%` }}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 font-body mb-2 flex items-center gap-1">
            <Activity className="w-3.5 h-3.5" />
            实时参数
          </div>
          <div className="space-y-2">
            {device.params?.map((param) => (
              <div key={param.key} className="bg-steel-gray/50 rounded p-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400 font-body">{param.label}</span>
                  <span
                    className={`text-sm font-mono ${
                      param.threshold &&
                      (param.value < param.threshold.min || param.value > param.threshold.max)
                        ? 'text-red-alert'
                        : 'text-slate-200'
                    }`}
                  >
                    {param.value} {param.unit}
                  </span>
                </div>
                {param.threshold && (
                  <div className="text-[10px] text-slate-600 font-body mt-0.5">
                    阈值: {param.threshold.min} - {param.threshold.max} {param.unit}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SceneOverlay() {
  return (
    <>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <SearchBar />
      </div>

      <div className="absolute top-4 right-4 z-10 space-y-2">
        <LayerControl />
        <CutPlaneControl />
        <MarkerControl />
      </div>

      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
        <FloorSwitcher />
      </div>

      <div className="absolute right-0 top-0 bottom-0 z-20">
        <DeviceInfoPanel />
      </div>
    </>
  )
}

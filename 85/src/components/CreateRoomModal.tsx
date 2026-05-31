import { useState } from 'react'
import { X, Map, Clock, Users } from 'lucide-react'
import type { GameMode, CreateRoomRequest } from '@shared/types'

const MAP_OPTIONS = [
  { id: 'plains', name: '平原冲突' },
  { id: 'mountain_pass', name: '山口隘道' },
  { id: 'river_crossing', name: '渡河作战' },
  { id: 'urban_warfare', name: '城市巷战' },
  { id: 'island_assault', name: '岛屿突击' },
]

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (req: CreateRoomRequest) => void
}

export default function CreateRoomModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [mapId, setMapId] = useState(MAP_OPTIONS[0].id)
  const [mode, setMode] = useState<GameMode>('turn-based')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [timeLimit, setTimeLimit] = useState(30)

  if (!open) return null

  const handleSubmit = () => {
    onCreate({
      name: name || `${MAP_OPTIONS.find((m) => m.id === mapId)?.name ?? '新房间'}`,
      mapId,
      mode,
      maxPlayers,
      timeLimit,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border rounded-military w-96 p-6 shadow-lg">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-sand">创建房间</h2>
          <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">房间名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入房间名称"
              className="w-full bg-charcoal border border-border rounded-military px-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-sand"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs text-text-muted mb-1">
              <Map className="w-3.5 h-3.5" /> 地图
            </label>
            <select
              value={mapId}
              onChange={(e) => setMapId(e.target.value)}
              className="w-full bg-charcoal border border-border rounded-military px-3 py-2 text-sm text-white focus:outline-none focus:border-sand"
            >
              {MAP_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-2">模式</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('turn-based')}
                className={`flex-1 py-2 text-sm font-bold rounded-military border transition-colors ${
                  mode === 'turn-based'
                    ? 'bg-military-green border-military-green text-white'
                    : 'bg-charcoal border-border text-text-muted hover:border-sand'
                }`}
              >
                回合制
              </button>
              <button
                onClick={() => setMode('realtime')}
                className={`flex-1 py-2 text-sm font-bold rounded-military border transition-colors ${
                  mode === 'realtime'
                    ? 'bg-military-green border-military-green text-white'
                    : 'bg-charcoal border-border text-text-muted hover:border-sand'
                }`}
              >
                实时
              </button>
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between text-xs text-text-muted mb-1">
              <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> 人数</span>
              <span className="font-mono text-sand">{maxPlayers}</span>
            </label>
            <input
              type="range"
              min={2}
              max={8}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full accent-sand"
            />
          </div>

          <div>
            <label className="flex items-center justify-between text-xs text-text-muted mb-1">
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> 时限(分钟)</span>
              <span className="font-mono text-sand">{timeLimit}</span>
            </label>
            <input
              type="number"
              min={5}
              max={120}
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              className="w-full bg-charcoal border border-border rounded-military px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-sand"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          className="w-full mt-5 py-2.5 bg-military-green hover:bg-military-green-light text-white font-bold rounded-military active:shadow-pressed transition-colors"
        >
          创建
        </button>
      </div>
    </div>
  )
}

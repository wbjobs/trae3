import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Swords, Shield, Users, Plus, Clock, Trophy } from 'lucide-react'
import { useGameStore } from '@/store/gameStore'
import CreateRoomModal from '@/components/CreateRoomModal'
import type { RoomStatus, GameMode } from '@shared/types'

const STATUS_LABELS: Record<RoomStatus, string> = {
  waiting: '等待中',
  playing: '进行中',
  finished: '已结束',
}

const STATUS_COLORS: Record<RoomStatus, string> = {
  waiting: 'bg-amber-warn text-charcoal',
  playing: 'bg-military-green text-white',
  finished: 'bg-gray-600 text-white',
}

const MOCK_ROOMS = [
  { roomId: '1', name: '平原冲突 #01', mapId: 'plains', mode: 'turn-based' as GameMode, status: 'waiting' as RoomStatus, players: [{ playerId: 'p1', name: '指挥官A', role: 'commander' as const, faction: 'red' as const }, { playerId: 'p2', name: '指挥官B', role: 'commander' as const, faction: 'blue' as const }], createdAt: '2026-05-31T10:00:00Z' },
  { roomId: '2', name: '山口隘道 #02', mapId: 'mountain_pass', mode: 'turn-based' as GameMode, status: 'playing' as RoomStatus, players: [{ playerId: 'p3', name: '将军X', role: 'commander' as const, faction: 'red' as const }, { playerId: 'p4', name: '将军Y', role: 'commander' as const, faction: 'blue' as const }, { playerId: 'p5', name: '参谋Z', role: 'staff' as const, faction: 'red' as const }], createdAt: '2026-05-31T09:30:00Z' },
  { roomId: '3', name: '渡河作战 #03', mapId: 'river_crossing', mode: 'realtime' as GameMode, status: 'waiting' as RoomStatus, players: [{ playerId: 'p6', name: '指挥官C', role: 'commander' as const, faction: 'none' as const }], createdAt: '2026-05-31T10:15:00Z' },
]

const MOCK_WIN_DATA = [
  { label: '红方', value: 12 },
  { label: '蓝方', value: 8 },
  { label: '平局', value: 2 },
]

export default function Lobby() {
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const rooms = useGameStore((s) => s.rooms)
  const joinRoom = useGameStore((s) => s.joinRoom)

  const displayRooms = rooms.length > 0 ? rooms : MOCK_ROOMS

  const handleJoin = (roomId: string) => {
    const room = displayRooms.find((r) => r.roomId === roomId)
    if (room) {
      joinRoom(room, `player_${Date.now()}`, 'red')
      navigate(`/battle/${roomId}`)
    }
  }

  const handleCreate = () => {
    setModalOpen(false)
    navigate('/battle/new')
  }

  return (
    <div className="min-h-screen bg-charcoal">
      <header className="border-b border-border bg-charcoal-light px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Swords className="w-8 h-8 text-sand" />
            <div>
              <h1 className="text-2xl font-black text-sand tracking-wider">战术推演指挥系统</h1>
              <p className="text-xs text-text-muted">TACTICAL WARGAME SIMULATION</p>
            </div>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-military-green hover:bg-military-green-light text-white font-bold rounded-military active:shadow-pressed transition-colors"
          >
            <Plus className="w-4 h-4" />
            创建房间
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-surface border border-border rounded-military p-4 flex items-center gap-3">
            <div className="p-2 bg-military-green/20 rounded-military">
              <Swords className="w-5 h-5 text-sand" />
            </div>
            <div>
              <div className="text-xs text-text-muted">活跃战场</div>
              <div className="text-xl font-bold font-mono text-white">{displayRooms.filter((r) => r.status === 'playing').length}</div>
            </div>
          </div>
          <div className="bg-surface border border-border rounded-military p-4 flex items-center gap-3">
            <div className="p-2 bg-amber-warn/20 rounded-military">
              <Clock className="w-5 h-5 text-amber-warn" />
            </div>
            <div>
              <div className="text-xs text-text-muted">等待中</div>
              <div className="text-xl font-bold font-mono text-white">{displayRooms.filter((r) => r.status === 'waiting').length}</div>
            </div>
          </div>
          <div className="bg-surface border border-border rounded-military p-4 flex items-center gap-3">
            <div className="p-2 bg-faction-blue/20 rounded-military">
              <Users className="w-5 h-5 text-faction-blue-light" />
            </div>
            <div>
              <div className="text-xs text-text-muted">在线玩家</div>
              <div className="text-xl font-bold font-mono text-white">{displayRooms.reduce((a, r) => a + r.players.length, 0)}</div>
            </div>
          </div>
          <div className="bg-surface border border-border rounded-military p-4 flex items-center gap-3">
            <div className="p-2 bg-faction-red/20 rounded-military">
              <Trophy className="w-5 h-5 text-faction-red-light" />
            </div>
            <div>
              <div className="text-xs text-text-muted">总场次</div>
              <div className="text-xl font-bold font-mono text-white">22</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-bold text-text-muted uppercase tracking-wider">作战房间</h2>
            {displayRooms.map((room) => (
              <div
                key={room.roomId}
                className="bg-surface/80 backdrop-blur border border-border rounded-military p-4 hover:border-sand transition-colors cursor-pointer"
                onClick={() => handleJoin(room.roomId)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-white">{room.name}</h3>
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-military ${STATUS_COLORS[room.status]}`}>
                    {STATUS_LABELS[room.status]}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    {room.mode === 'turn-based' ? '回合制' : '实时'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {room.players.length} 人
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(room.createdAt).toLocaleTimeString('zh-CN')}
                  </span>
                </div>
                <div className="flex gap-2 mt-2">
                  {room.players.map((p) => (
                    <span key={p.playerId} className={`text-xs px-1.5 py-0.5 rounded-military ${
                      p.faction === 'red' ? 'bg-faction-red/20 text-faction-red-light' : p.faction === 'blue' ? 'bg-faction-blue/20 text-faction-blue-light' : 'bg-charcoal text-text-muted'
                    }`}>
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-bold text-text-muted uppercase tracking-wider">战绩统计</h2>
            <div className="bg-surface border border-border rounded-military p-4 space-y-3">
              {MOCK_WIN_DATA.map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className={item.label === '红方' ? 'text-faction-red' : item.label === '蓝方' ? 'text-faction-blue' : 'text-text-muted'}>{item.label}</span>
                    <span className="font-mono text-sand">{item.value}</span>
                  </div>
                  <div className="w-full h-2 bg-charcoal rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(item.value / 22) * 100}%`,
                        backgroundColor: item.label === '红方' ? '#C62828' : item.label === '蓝方' ? '#1565C0' : '#9E9E9E',
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-border text-center">
                <span className="text-xs text-text-muted">胜率</span>
                <div className="flex items-center justify-center gap-3 mt-1">
                  <span className="font-mono text-faction-red text-lg font-bold">54.5%</span>
                  <span className="text-border">vs</span>
                  <span className="font-mono text-faction-blue text-lg font-bold">36.4%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <CreateRoomModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={handleCreate} />
    </div>
  )
}

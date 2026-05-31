import { Wifi, WifiOff, Swords } from 'lucide-react'
import { useGameStore } from '@/store/gameStore'
import type { GamePhase } from '@shared/types'

const PHASE_LABELS: Record<GamePhase, string> = {
  deploy: '部署阶段',
  command: '指令阶段',
  resolving: '推演中',
  finished: '已结束',
}

const PHASE_COLORS: Record<GamePhase, string> = {
  deploy: 'bg-amber-warn text-charcoal',
  command: 'bg-military-green text-white',
  resolving: 'bg-faction-blue text-white',
  finished: 'bg-gray-600 text-white',
}

export default function StatusBar() {
  const gameState = useGameStore((s) => s.gameState)
  const currentRoom = useGameStore((s) => s.currentRoom)
  const connected = useGameStore((s) => s.connected)

  const turn = gameState?.turn ?? 0
  const phase = gameState?.phase ?? 'deploy'
  const redScore = gameState?.redScore ?? 0
  const blueScore = gameState?.blueScore ?? 0

  return (
    <div className="flex items-center justify-between h-10 px-4 bg-charcoal-light border-b border-border">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-sand" />
          <span className="font-mono text-sm text-sand">第 {turn} 回合</span>
        </div>
        <span className={`px-2 py-0.5 text-xs font-bold rounded-military ${PHASE_COLORS[phase]}`}>
          {PHASE_LABELS[phase]}
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-faction-red font-bold">红方</span>
          <span className="font-mono text-sm text-faction-red">{redScore}</span>
        </div>
        <span className="text-border">:</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-faction-blue">{blueScore}</span>
          <span className="text-xs text-faction-blue font-bold">蓝方</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {currentRoom && (
          <span className="text-xs text-sand-dark truncate max-w-32">{currentRoom.name}</span>
        )}
        <div className="flex items-center gap-1">
          {connected ? (
            <Wifi className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-faction-red" />
          )}
          <span className="text-xs text-text-muted">
            {connected ? '已连接' : '断开'}
          </span>
        </div>
      </div>
    </div>
  )
}

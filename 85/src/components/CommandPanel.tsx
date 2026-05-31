import { Move, Crosshair, Shield, Hand, Trash2, Send } from 'lucide-react'
import { useGameStore } from '@/store/gameStore'
import { UNIT_STATS } from '@shared/types'
import type { CommandType, GamePhase, UnitType } from '@shared/types'

const COMMAND_BUTTONS: Array<{ action: CommandType; label: string; icon: typeof Move }> = [
  { action: 'move', label: '移动', icon: Move },
  { action: 'attack', label: '攻击', icon: Crosshair },
  { action: 'defend', label: '防御', icon: Shield },
  { action: 'hold', label: '待命', icon: Hand },
]

const UNIT_LABELS: Record<UnitType, string> = {
  infantry: '步兵',
  armor: '装甲',
  artillery: '炮兵',
  recon: '侦察',
  supply: '补给',
}

const PHASE_LABELS: Record<GamePhase, string> = {
  deploy: '部署阶段',
  command: '指令阶段',
  resolving: '推演中',
  finished: '已结束',
}

export default function CommandPanel() {
  const selectedUnit = useGameStore((s) => s.selectedUnit)
  const commands = useGameStore((s) => s.commands)
  const gameState = useGameStore((s) => s.gameState)
  const addCommand = useGameStore((s) => s.addCommand)
  const removeCommand = useGameStore((s) => s.removeCommand)
  const submitCommands = useGameStore((s) => s.submitCommands)
  const send = useGameStore((s) => s.connected)

  const phase = gameState?.phase ?? 'deploy'
  const turn = gameState?.turn ?? 0

  const handleCommand = (action: CommandType) => {
    if (!selectedUnit) return
    addCommand({
      unitId: selectedUnit.unitId,
      action,
      target: action === 'move' ? { x: selectedUnit.position.x + 1, y: selectedUnit.position.y } : undefined,
    })
  }

  const handleSubmit = () => {
    const cmds = submitCommands()
    if (cmds.length > 0) {
      const wsSend = (window as unknown as { __wsSend?: (msg: unknown) => void }).__wsSend
      wsSend?.({ type: 'command', commands: cmds })
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface border-l border-border">
      <div className="p-3 border-b border-border">
        <span className="text-xs font-bold text-sand uppercase tracking-wider">指挥面板</span>
      </div>

      <div className="p-3 border-b border-border">
        <span className={`inline-block px-2 py-0.5 text-xs font-bold rounded-military ${
          phase === 'command' ? 'bg-military-green text-white' : 'bg-charcoal text-text-muted'
        }`}>
          {PHASE_LABELS[phase]}
        </span>
      </div>

      {selectedUnit ? (
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-bold ${selectedUnit.faction === 'red' ? 'text-faction-red' : 'text-faction-blue'}`}>
              {UNIT_LABELS[selectedUnit.unitType]}
            </span>
            <span className="text-xs font-mono text-text-muted">{selectedUnit.unitId}</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">兵力</span>
              <span className="font-mono text-sand">{selectedUnit.strength}/{selectedUnit.maxStrength}</span>
            </div>
            <div className="w-full h-2 bg-charcoal rounded-full overflow-hidden">
              <div
                className="h-full transition-all"
                style={{
                  width: `${(selectedUnit.strength / selectedUnit.maxStrength) * 100}%`,
                  backgroundColor: selectedUnit.strength / selectedUnit.maxStrength > 0.5 ? '#4CAF50' : selectedUnit.strength / selectedUnit.maxStrength > 0.25 ? '#FF8F00' : '#C62828',
                }}
              />
            </div>
            <div className="grid grid-cols-3 gap-1 text-xs text-center">
              <div className="bg-charcoal p-1 rounded-military">
                <div className="text-text-muted">攻</div>
                <div className="font-mono text-white">{UNIT_STATS[selectedUnit.unitType].attack}</div>
              </div>
              <div className="bg-charcoal p-1 rounded-military">
                <div className="text-text-muted">防</div>
                <div className="font-mono text-white">{UNIT_STATS[selectedUnit.unitType].defense}</div>
              </div>
              <div className="bg-charcoal p-1 rounded-military">
                <div className="text-text-muted">速</div>
                <div className="font-mono text-white">{UNIT_STATS[selectedUnit.unitType].movement}</div>
              </div>
            </div>
            <div className="text-xs text-text-muted">
              位置: <span className="font-mono">({selectedUnit.position.x}, {selectedUnit.position.y})</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 border-b border-border text-xs text-text-muted text-center py-8">
          选择一个单位查看详情
        </div>
      )}

      <div className="p-3 border-b border-border">
        <div className="grid grid-cols-2 gap-2">
          {COMMAND_BUTTONS.map(({ action, label, icon: Icon }) => (
            <button
              key={action}
              onClick={() => handleCommand(action)}
              disabled={!selectedUnit || phase !== 'command'}
              className="flex items-center justify-center gap-1.5 py-2 text-sm font-bold rounded-military border border-border bg-charcoal hover:bg-charcoal-light hover:border-sand text-white disabled:opacity-40 disabled:cursor-not-allowed active:shadow-pressed transition-colors"
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-muted">指令队列</span>
          <span className="text-xs font-mono text-sand">{commands.length}</span>
        </div>
        {commands.length === 0 ? (
          <div className="text-xs text-text-muted text-center py-4">暂无指令</div>
        ) : (
          commands.map((cmd) => {
            const unit = gameState?.units.find((u) => u.unitId === cmd.unitId)
            return (
              <div key={cmd.unitId} className="flex items-center justify-between bg-charcoal px-2 py-1.5 rounded-military text-xs">
                <div className="flex items-center gap-2">
                  <span className={unit?.faction === 'red' ? 'text-faction-red' : 'text-faction-blue'}>
                    {unit ? UNIT_LABELS[unit.unitType] : cmd.unitId}
                  </span>
                  <span className="text-text-muted">→</span>
                  <span className="text-sand">{cmd.action === 'move' ? '移动' : cmd.action === 'attack' ? '攻击' : cmd.action === 'defend' ? '防御' : '待命'}</span>
                </div>
                <button onClick={() => removeCommand(cmd.unitId)} className="text-text-muted hover:text-faction-red transition-colors">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="p-3 border-t border-border">
        <button
          onClick={handleSubmit}
          disabled={commands.length === 0 || phase !== 'command'}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-military-green hover:bg-military-green-light text-white font-bold rounded-military active:shadow-pressed disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-4 h-4" />
          提交指令 <span className="font-mono text-xs opacity-70">T{turn}</span>
        </button>
      </div>
    </div>
  )
}

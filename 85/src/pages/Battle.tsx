import { useEffect, useRef } from 'react'
import { useGameStore } from '@/store/gameStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import StatusBar from '@/components/StatusBar'
import TacticalMap from '@/components/TacticalMap'
import CommandPanel from '@/components/CommandPanel'

export default function Battle() {
  const logs = useGameStore((s) => s.logs)
  const logEndRef = useRef<HTMLDivElement>(null)
  const { send } = useWebSocket()

  useEffect(() => {
    (window as unknown as { __wsSend?: (msg: unknown) => void }).__wsSend = send
    return () => {
      delete (window as unknown as { __wsSend?: (msg: unknown) => void }).__wsSend
    }
  }, [send])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="flex flex-col h-screen bg-charcoal overflow-hidden">
      <StatusBar />

      <div className="flex flex-1 min-h-0">
        <div className="flex-[7] relative">
          <TacticalMap />
        </div>

        <div className="flex-[3] min-w-[280px] max-w-[360px]">
          <CommandPanel />
        </div>
      </div>

      <div className="h-28 border-t border-border bg-charcoal-dark/80 backdrop-blur overflow-y-auto">
        <div className="px-3 py-1.5 border-b border-border/50">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">作战日志</span>
        </div>
        <div className="px-3 py-1 space-y-0.5">
          {logs.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-3">等待作战指令...</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2 text-xs py-0.5">
                <span className="font-mono text-text-muted shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className={`shrink-0 font-bold ${
                  log.faction === 'red' ? 'text-faction-red' : 'text-faction-blue'
                }`}>
                  [{log.faction === 'red' ? '红' : '蓝'}]
                </span>
                <span className="text-text-muted">{log.playerName}:</span>
                <span className="text-white">{log.content}</span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}

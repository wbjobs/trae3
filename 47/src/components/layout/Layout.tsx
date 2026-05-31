import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useRealtimeStore } from '../../store/useRealtimeStore'
import { useWebSocket } from '../../hooks/useWebSocket'
import { Wifi, WifiOff } from 'lucide-react'

export default function Layout() {
  useWebSocket()
  const isConnected = useRealtimeStore((s) => s.isConnected)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex h-screen bg-bg-primary font-body">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center justify-between px-6 border-b border-border-default bg-[#0d1320] shrink-0">
          <h1 className="text-lg font-semibold text-text-primary tracking-wide">
            光伏阵列监控平台
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <Wifi size={14} className="text-accent" />
                  <span className="text-xs text-accent">已连接</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-critical" />
                  <WifiOff size={14} className="text-critical" />
                  <span className="text-xs text-critical">已断开</span>
                </>
              )}
            </div>
            <span className="text-sm text-text-secondary font-display tabular-nums">
              {time.toLocaleString('zh-CN', { hour12: false })}
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

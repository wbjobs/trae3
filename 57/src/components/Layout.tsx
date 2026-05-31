import { Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import { Bell, User } from 'lucide-react'
import { useStore } from '@/store/useStore'

export default function Layout() {
  const [time, setTime] = useState(new Date())
  const alerts = useStore((s) => s.alerts)
  const activeAlerts = Array.isArray(alerts) ? alerts.filter((a) => a.status === 'active') : []

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-primary-dark">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center justify-between px-6 bg-primary/60 border-b border-primary-light/30 backdrop-blur-sm shrink-0">
          <h1 className="font-display font-semibold text-lg text-white">
            流域水文监测分析平台
          </h1>
          <div className="flex items-center gap-5">
            <div className="relative">
              <Bell className="w-5 h-5 text-gray-400 hover:text-accent transition-colors cursor-pointer" />
              {activeAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-alert-red rounded-full text-[10px] text-white flex items-center justify-center">
                  {activeAlerts.length}
                </span>
              )}
            </div>
            <div className="text-sm font-mono text-gray-400">
              {time.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <User className="w-5 h-5" />
              <span className="text-sm">管理员</span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

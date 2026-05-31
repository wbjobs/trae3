import { useState, useEffect } from 'react'
import { NavLink, useLocation, Outlet } from 'react-router-dom'
import { LayoutDashboard, Settings, Bell, Zap, ChevronRight, ChevronLeft } from 'lucide-react'
import { useDeviceStore } from '@/stores/deviceStore'
import { useWebSocket } from '@/hooks/useWebSocket'

const navItems = [
  { path: '/', label: '监控面板', icon: LayoutDashboard },
  { path: '/config', label: '配置管理', icon: Settings },
  { path: '/alerts', label: '告警中心', icon: Bell },
]

const pageTitles: Record<string, string> = {
  '/': '监控面板',
  '/config': '配置管理',
  '/alerts': '告警中心',
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [time, setTime] = useState(new Date())
  const location = useLocation()
  const devices = useDeviceStore((s) => s.devices)
  const fetchStats = useDeviceStore((s) => s.fetchStats)
  useWebSocket()

  useEffect(() => {
    useDeviceStore.getState().fetchDevices()
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const onlineCount = devices.filter((d) => d.status === 'online').length
  const totalCount = devices.length

  const currentTitle = location.pathname.startsWith('/device/')
    ? '设备详情'
    : pageTitles[location.pathname] ?? '监控面板'

  return (
    <div className="flex h-screen bg-inv-bg text-slate-100 overflow-hidden">
      <aside
        className={`flex flex-col bg-slate-900 border-r border-inv-border transition-all duration-300 ${
          collapsed ? 'w-[60px]' : 'w-[220px]'
        }`}
      >
        <div className="flex items-center gap-2 px-4 h-14 border-b border-inv-border">
          <Zap className="w-6 h-6 text-inv-primary flex-shrink-0" />
          {!collapsed && <span className="text-sm font-semibold whitespace-nowrap">逆变器集群监控</span>}
        </div>

        <nav className="flex-1 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-inv-primary/15 text-inv-primary'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                } ${collapsed ? 'justify-center' : ''}`
              }
              end={item.path === '/'}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center h-10 border-t border-inv-border text-slate-400 hover:text-slate-200 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between h-14 px-6 border-b border-inv-border bg-slate-900/80 backdrop-blur flex-shrink-0">
          <h1 className="text-lg font-semibold">{currentTitle}</h1>
          <div className="flex items-center gap-6 text-sm">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-inv-online animate-pulse-green" />
              <span className="text-slate-400">在线设备</span>
              <span className="font-mono text-inv-online">{onlineCount}</span>
              <span className="text-slate-500">/</span>
              <span className="font-mono">{totalCount}</span>
            </span>
            <span className="font-mono text-slate-400">
              {time.toLocaleTimeString('zh-CN', { hour12: false })}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

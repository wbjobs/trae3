import { NavLink } from 'react-router-dom'
import { Box, LayoutDashboard, Bell, Wifi, WifiOff } from 'lucide-react'
import useWebSocket from '@/hooks/useWebSocket'

const navItems = [
  { to: '/', label: '3D 总览', icon: Box },
  { to: '/dashboard', label: '监控大屏', icon: LayoutDashboard },
  { to: '/alerts', label: '告警中心', icon: Bell },
]

export default function Navbar() {
  const { connected } = useWebSocket()

  return (
    <nav className="h-14 bg-deep-blue/95 border-b border-neon-cyan/10 flex items-center justify-between px-6 backdrop-blur-md z-50 relative">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center">
          <Box className="w-4 h-4 text-neon-cyan" />
        </div>
        <span className="font-display text-xl font-bold tracking-wide neon-text">
          MEP 3D
        </span>
        <span className="text-xs text-slate-500 font-body ml-1">运维监控平台</span>
      </div>

      <div className="flex items-center gap-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 rounded-md text-sm font-body transition-all duration-200 ${
                isActive
                  ? 'bg-neon-cyan/10 text-neon-cyan neon-border'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-steel-gray/50'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {connected ? (
          <div className="flex items-center gap-1.5 text-green-ok text-xs">
            <Wifi className="w-3.5 h-3.5" />
            <span className="font-body">实时连接</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-red-alert text-xs">
            <WifiOff className="w-3.5 h-3.5" />
            <span className="font-body">未连接</span>
          </div>
        )}
      </div>
    </nav>
  )
}

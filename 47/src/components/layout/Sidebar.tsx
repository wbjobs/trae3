import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, AlertTriangle, History, ChevronsLeft, ChevronsRight } from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/anomaly', icon: AlertTriangle, label: '异常分析' },
  { to: '/history', icon: History, label: '历史查询' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <aside
      className={`h-screen bg-[#0d1320] border-r border-border-default flex flex-col transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-[200px]'
      }`}
    >
      <div className="h-14 flex items-center justify-center border-b border-border-default">
        <span className="font-display text-accent text-xl font-bold tracking-wider">PV</span>
      </div>

      <nav className="flex-1 flex flex-col gap-1 py-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`
            }
          >
            <Icon size={20} />
            {!collapsed && <span className="text-sm whitespace-nowrap">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="h-12 flex items-center justify-center border-t border-border-default text-text-secondary hover:text-text-primary transition-colors"
      >
        {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
      </button>
    </aside>
  )
}

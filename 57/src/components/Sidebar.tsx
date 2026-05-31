import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  BarChart3,
  Search,
  AlertTriangle,
  Database,
  Waves,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: '监测总览', icon: LayoutDashboard },
  { to: '/analysis', label: '图表分析', icon: BarChart3 },
  { to: '/query', label: '数据查询', icon: Search },
  { to: '/anomaly', label: '异常研判', icon: AlertTriangle },
  { to: '/ingestion', label: '数据接入', icon: Database },
]

export default function Sidebar() {
  const location = useLocation()

  return (
    <aside className="w-60 h-screen bg-primary flex flex-col border-r border-primary-light/30">
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-primary-light/30">
        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <Waves className="w-5 h-5 text-accent" />
        </div>
        <span className="font-display font-semibold text-base text-white tracking-wide">
          流域水文监测平台
        </span>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname === to
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-gray-400 hover:bg-primary-light/40 hover:text-gray-200'
              )}
            >
              <Icon className={cn('w-5 h-5', isActive && 'text-accent')} />
              <span>{label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent" />
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="p-4 border-t border-primary-light/30">
        <div className="text-xs text-gray-500 text-center">
          v1.0.0 · 水文监测分析
        </div>
      </div>
    </aside>
  )
}

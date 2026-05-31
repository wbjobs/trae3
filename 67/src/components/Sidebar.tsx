import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, AlertTriangle, Activity, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/anomalies', label: 'Anomalies', icon: AlertTriangle },
  { path: '/trace', label: 'Trace Analysis', icon: GitBranch },
  { path: '/correlation', label: 'Correlation', icon: Activity },
]

export default function Sidebar() {
  const [hovered, setHovered] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'h-screen bg-ops-card border-r border-ops-border flex flex-col transition-all duration-300 ease-in-out overflow-hidden',
        hovered ? 'w-[200px]' : 'w-16'
      )}
    >
      <div className="flex items-center gap-3 px-4 h-14 border-b border-ops-border shrink-0">
        <Activity className="w-6 h-6 text-ops-accent shrink-0" />
        <span
          className={cn(
            'text-ops-text font-bold text-lg whitespace-nowrap transition-opacity duration-200',
            hovered ? 'opacity-100' : 'opacity-0'
          )}
        >
          OpsMonitor
        </span>
      </div>

      <nav className="flex-1 py-4 flex flex-col gap-1 px-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 w-full text-left',
                active
                  ? 'bg-ops-accent/10 text-ops-accent'
                  : 'text-ops-muted hover:bg-ops-border/30 hover:text-ops-text'
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span
                className={cn(
                  'whitespace-nowrap transition-opacity duration-200',
                  hovered ? 'opacity-100' : 'opacity-0'
                )}
              >
                {item.label}
              </span>
              {active && (
                <div className="absolute left-0 w-0.5 h-5 bg-ops-accent rounded-r" />
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

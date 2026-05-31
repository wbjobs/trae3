import { NavLink } from 'react-router-dom'
import { Wifi, WifiOff, Users } from 'lucide-react'
import { usePipelineStore } from '@/store/usePipelineStore'

const NAV_TABS = [
  { path: '/', label: '场景总览' },
  { path: '/inspect', label: '交互巡检' },
  { path: '/collab', label: '协同工作' },
  { path: '/monitor', label: '实时监控' },
]

interface TopNavProps {
  connected?: boolean
}

export default function TopNav({ connected }: TopNavProps) {
  const onlineUsers = usePipelineStore((s) => s.onlineUsers)
  const currentUser = usePipelineStore((s) => s.currentUser)

  const displayUsers = onlineUsers.slice(0, 5)
  const extraCount = onlineUsers.length - 5

  return (
    <div className="h-[56px] flex items-center px-4 glass-panel-solid rounded-none border-t-0 border-l-0 border-r-0 flex-shrink-0 z-30">
      <div className="flex items-center gap-2 mr-8">
        <div className="w-7 h-7 rounded border border-pipeline-cyan/40 flex items-center justify-center">
          <span className="text-pipeline-cyan text-[10px] font-display font-bold">P</span>
        </div>
        <span className="font-display text-sm font-bold tracking-wider text-pipeline-cyan">
          管网3D监控
        </span>
      </div>

      <nav className="flex items-center gap-1">
        {NAV_TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/'}
            className={({ isActive }) =>
              `relative px-4 py-1.5 text-xs font-medium rounded transition-colors ${
                isActive
                  ? 'text-pipeline-cyan'
                  : 'text-[#7a8fa6] hover:text-[#b0c4d8]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-pipeline-cyan rounded-full" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center -space-x-1.5">
          {displayUsers.map((user) => (
            <div
              key={user.id}
              className="w-6 h-6 rounded-full border-2 border-[#0a1628] flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: user.color + '40', color: user.color }}
              title={user.name}
            >
              {user.name.charAt(user.name.length - 1)}
            </div>
          ))}
          {extraCount > 0 && (
            <div className="w-6 h-6 rounded-full border-2 border-[#0a1628] bg-[#1a3a5c] flex items-center justify-center text-[9px] text-[#7a8fa6]">
              +{extraCount}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-[10px]">
          {connected ? (
            <>
              <Wifi size={12} className="text-pipeline-ok" />
              <span className="text-pipeline-ok">已连接</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-pipeline-alarm" />
              <span className="text-pipeline-alarm">断开</span>
            </>
          )}
        </div>

        {currentUser && (
          <div className="flex items-center gap-1.5 pl-3 border-l border-[#1a3a5c]/50">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
              style={{ backgroundColor: currentUser.color + '40', color: currentUser.color }}
            >
              {currentUser.name.charAt(currentUser.name.length - 1)}
            </div>
            <span className="text-[10px] text-[#7a8fa6]">{currentUser.name}</span>
          </div>
        )}
      </div>
    </div>
  )
}

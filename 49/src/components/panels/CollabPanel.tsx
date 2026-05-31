import { Video, VideoOff } from 'lucide-react'
import { usePipelineStore } from '@/store/usePipelineStore'

const ROLE_LABELS: Record<string, string> = {
  engineer: '工程师',
  operator: '操作员',
  manager: '管理员',
}

const ROLE_COLORS: Record<string, string> = {
  engineer: 'bg-pipeline-cyan/20 text-pipeline-cyan',
  operator: 'bg-pipeline-ok/20 text-pipeline-ok',
  manager: 'bg-pipeline-warn/20 text-pipeline-warn',
}

export default function CollabPanel() {
  const onlineUsers = usePipelineStore((s) => s.onlineUsers)
  const currentUser = usePipelineStore((s) => s.currentUser)

  const otherUsers = onlineUsers.filter((u) => u.id !== currentUser?.id)

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#1a3a5c]/50">
        <h3 className="text-xs font-medium text-[#e0e8f0]">
          在线协作 ({onlineUsers.length})
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {currentUser && (
          <div className="flex items-center gap-2 p-2 rounded bg-[#0a1628]/60 border border-pipeline-cyan/20">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
              style={{ backgroundColor: currentUser.color + '40', color: currentUser.color }}
            >
              {currentUser.name.charAt(currentUser.name.length - 1)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium text-pipeline-cyan truncate">{currentUser.name}</div>
              <div className="text-[9px] text-[#4a6a8a]">{ROLE_LABELS[currentUser.role]}</div>
            </div>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-pipeline-cyan/10 text-pipeline-cyan">我</span>
          </div>
        )}

        {otherUsers.map((user) => (
          <div key={user.id} className="flex items-center gap-2 p-2 rounded bg-[#0a1628]/40 border border-[#1a3a5c]/30">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
              style={{ backgroundColor: user.color + '40', color: user.color }}
            >
              {user.name.charAt(user.name.length - 1)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium text-[#e0e8f0] truncate">{user.name}</div>
              <div className="text-[9px] text-[#4a6a8a]">{ROLE_LABELS[user.role]}</div>
            </div>
            <span className={`text-[8px] px-1.5 py-0.5 rounded ${ROLE_COLORS[user.role] ?? ROLE_COLORS.engineer}`}>
              {ROLE_LABELS[user.role]}
            </span>
            <div className="flex gap-1">
              <button
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#1a3a5c]/50 text-[#7a8fa6] hover:text-pipeline-cyan transition-colors cursor-pointer"
                title="跟随视角"
              >
                <Video size={10} />
              </button>
              <button
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#1a3a5c]/50 text-[#7a8fa6] hover:text-pipeline-cyan transition-colors cursor-pointer"
                title="分享视角"
              >
                <VideoOff size={10} />
              </button>
            </div>
          </div>
        ))}

        {otherUsers.length === 0 && !currentUser && (
          <div className="text-center text-[10px] text-[#4a6a8a] py-4">
            暂无在线用户
          </div>
        )}
      </div>
    </div>
  )
}

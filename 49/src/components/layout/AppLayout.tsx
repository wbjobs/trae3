import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, PanelLeft, PanelRight } from 'lucide-react'
import TopNav from './TopNav'
import AlarmBar from './AlarmBar'

interface AppLayoutProps {
  leftSidebar?: ReactNode
  rightPanel?: ReactNode
  bottomBar?: ReactNode
  children: ReactNode
}

export default function AppLayout({ leftSidebar, rightPanel, bottomBar, children }: AppLayoutProps) {
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  return (
    <div className="flex flex-col w-screen h-screen bg-[#050d1a] overflow-hidden font-body">
      <TopNav />

      <div className="flex flex-1 overflow-hidden">
        {leftSidebar && (
          <>
            <div
              className="relative flex-shrink-0 transition-all duration-300 overflow-hidden"
              style={{ width: leftOpen ? 260 : 0 }}
            >
              <div className="w-[260px] h-full glass-panel-solid rounded-none border-t-0 border-b-0 border-l-0 overflow-hidden">
                {leftSidebar}
              </div>
              <button
                onClick={() => setLeftOpen(!leftOpen)}
                className="absolute top-2 -right-6 z-20 w-5 h-10 flex items-center justify-center bg-[#0a1628]/90 border border-[#1a3a5c]/50 border-l-0 rounded-r cursor-pointer hover:bg-[#0a1628] text-[#7a8fa6] hover:text-pipeline-cyan transition-colors"
              >
                {leftOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
              </button>
            </div>
            {!leftOpen && (
              <button
                onClick={() => setLeftOpen(true)}
                className="flex-shrink-0 w-6 h-full flex items-center justify-center bg-[#0a1628]/60 border-r border-[#1a3a5c]/30 cursor-pointer hover:bg-[#0a1628]/80 text-[#7a8fa6] hover:text-pipeline-cyan transition-colors"
              >
                <PanelLeft size={12} />
              </button>
            )}
          </>
        )}

        <div className="flex-1 relative overflow-hidden">
          {children}
        </div>

        {rightPanel && (
          <>
            {rightOpen && (
              <div className="flex-shrink-0 w-[320px] glass-panel-solid rounded-none border-t-0 border-b-0 border-r-0 overflow-hidden">
                <div className="relative h-full">
                  {rightPanel}
                  <button
                    onClick={() => setRightOpen(false)}
                    className="absolute top-2 left-2 z-10 w-5 h-5 flex items-center justify-center rounded hover:bg-[#1a3a5c]/50 text-[#7a8fa6] hover:text-pipeline-cyan transition-colors cursor-pointer"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
            {!rightOpen && (
              <button
                onClick={() => setRightOpen(true)}
                className="flex-shrink-0 w-6 h-full flex items-center justify-center bg-[#0a1628]/60 border-l border-[#1a3a5c]/30 cursor-pointer hover:bg-[#0a1628]/80 text-[#7a8fa6] hover:text-pipeline-cyan transition-colors"
              >
                <PanelRight size={12} />
              </button>
            )}
          </>
        )}
      </div>

      {bottomBar && (
        <div className="flex-shrink-0 h-[48px] glass-panel-solid rounded-none border-b-0 border-l-0 border-r-0">
          {bottomBar}
        </div>
      )}
    </div>
  )
}

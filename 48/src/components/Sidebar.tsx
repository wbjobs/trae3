import { NavLink } from "react-router-dom"
import { ScanSearch, Database, BarChart3, Settings, Shield, FileText } from "lucide-react"

const navItems = [
  { to: "/", icon: ScanSearch, label: "巡检工作台" },
  { to: "/defects", icon: Database, label: "缺陷库管理" },
  { to: "/analytics", icon: BarChart3, label: "统计分析" },
  { to: "/reports", icon: FileText, label: "报告中心" },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-navy-900 border-r border-navy-700/50 flex flex-col z-50">
      <div className="h-16 flex items-center px-5 border-b border-navy-700/50">
        <Shield className="w-7 h-7 text-cyber-500 mr-3" />
        <div>
          <h1 className="text-base font-bold text-white leading-tight">巡检智识</h1>
          <p className="text-[10px] text-navy-600 leading-tight">Defect AI Platform</p>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-cyber-500/10 text-cyber-400 border border-cyber-500/20 shadow-[0_0_12px_rgba(6,214,160,0.1)]"
                  : "text-navy-600 hover:text-slate-300 hover:bg-navy-800/50"
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-navy-700/50">
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-navy-600 hover:text-slate-300 hover:bg-navy-800/50 transition-all w-full">
          <Settings className="w-5 h-5" />
          <span>系统设置</span>
        </button>
      </div>
    </aside>
  )
}

import { NavLink, Outlet } from 'react-router-dom'
import { Upload, FileText } from 'lucide-react'

const navItems = [
  { to: '/', label: '票据上传', icon: Upload },
  { to: '/records', label: '票据管理', icon: FileText },
]

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden font-sans">
      <aside className="w-64 flex-shrink-0 bg-indigo-900 text-white flex flex-col">
        <div className="px-6 py-6 border-b border-indigo-800">
          <h1 className="font-serif text-xl font-semibold tracking-wide">
            <span className="text-amber-500">智能</span>票据
          </h1>
          <p className="text-indigo-100/60 text-xs mt-1">OCR 识别系统</p>
        </div>
        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-indigo-800/60 text-amber-400 border-l-4 border-amber-500'
                    : 'text-indigo-100/80 border-l-4 border-transparent hover:bg-indigo-800/30 hover:text-white'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-indigo-800 text-xs text-indigo-100/40">
          v1.0.0
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-indigo-50">
        <Outlet />
      </main>
    </div>
  )
}

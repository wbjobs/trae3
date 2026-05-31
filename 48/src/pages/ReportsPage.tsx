import { useState } from "react"
import { ReportGenerator } from "@/components/ReportGenerator"

export default function ReportsPage() {
  const [showGenerator, setShowGenerator] = useState(true)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">报告中心</h2>
        <p className="text-sm text-navy-600 mt-1">生成并导出检测报告，支持单份与批量导出</p>
      </div>

      <div className="glass-card p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-cyber-500/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-cyber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">检测报告管理器</h3>
        <p className="text-sm text-navy-600 mb-6">
          选择巡检记录，生成带缺陷标注图、检测结果明细的标准 PDF 报告
        </p>
        <button
          onClick={() => setShowGenerator(true)}
          className="px-6 py-2.5 bg-cyber-500/10 text-cyber-400 border border-cyber-500/20 rounded-lg hover:bg-cyber-500/20 transition-colors text-sm font-medium"
        >
          打开报告生成器
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="glass-card p-5">
          <div className="text-2xl font-bold text-white">1</div>
          <div className="text-sm text-cyber-400 mt-1 font-medium">选择巡检</div>
          <p className="text-xs text-navy-600 mt-2">
            勾选需要生成报告的巡检记录，支持日期范围和状态筛选
          </p>
        </div>
        <div className="glass-card p-5">
          <div className="text-2xl font-bold text-white">2</div>
          <div className="text-sm text-cyber-400 mt-1 font-medium">生成 PDF</div>
          <p className="text-xs text-navy-600 mt-2">
            一键生成标准格式 PDF 报告，包含标注图和明细数据
          </p>
        </div>
        <div className="glass-card p-5">
          <div className="text-2xl font-bold text-white">3</div>
          <div className="text-sm text-cyber-400 mt-1 font-medium">批量导出</div>
          <p className="text-xs text-navy-600 mt-2">
            支持批量选择，生成汇总报告，提高工作效率
          </p>
        </div>
      </div>

      {showGenerator && <ReportGenerator onClose={() => setShowGenerator(false)} />}
    </div>
  )
}

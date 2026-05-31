import { useEffect, useState } from "react"
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from "recharts"
import { TrendingUp, AlertTriangle, FileCheck, Activity, Download } from "lucide-react"
import { useStore } from "@/store"
import { getSummary, getDistribution, getTrend } from "@/api/client"
import { defectTypeName } from "@/utils/format"

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#EF476F",
  high: "#FF6B35",
  medium: "#FACC15",
  low: "#06D6A0",
}

const TYPE_COLORS = ["#06D6A0", "#3B82F6", "#8B5CF6", "#EF476F", "#FF6B35", "#FACC15", "#EC4899", "#14B8A6"]

function StatCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="glass-card p-5 hover:glow-border transition-all duration-300">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-navy-600">{label}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {sub && <p className="text-[10px] text-navy-600 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null
  return (
    <div className="bg-navy-800 border border-navy-700/50 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-navy-600 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function Analytics() {
  const { summary, distribution, trend, setSummary, setDistribution, setTrend } = useStore()
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day")

  useEffect(() => {
    getSummary().then(setSummary).catch(() => {})
  }, [setSummary])

  useEffect(() => {
    getDistribution({ group_by: "type" }).then(setDistribution).catch(() => {})
  }, [setDistribution])

  useEffect(() => {
    getTrend({ granularity }).then(setTrend).catch(() => {})
  }, [granularity, setTrend])

  const pieData = (distribution?.labels || []).map((label, i) => ({
    name: defectTypeName(label),
    value: distribution!.values[i],
  }))

  const barData = (distribution?.labels || []).map((label, i) => ({
    name: defectTypeName(label),
    count: distribution!.values[i],
  }))

  const trendData = (trend?.dates || []).map((date, i) => ({
    date,
    count: trend!.counts[i],
  }))

  const severityData = summary
    ? Object.entries(summary.severity_distribution).map(([key, val]) => ({
        name: key === "critical" ? "严重" : key === "high" ? "较高" : key === "medium" ? "中等" : "轻微",
        value: val,
        color: SEVERITY_COLORS[key] || "#94A3B8",
      }))
    : []

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">统计分析</h2>
          <p className="text-sm text-navy-600 mt-1">缺陷分布、趋势与综合数据概览</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyber-500/10 text-cyber-400 text-sm font-medium hover:bg-cyber-500/20 transition-colors">
          <Download className="w-4 h-4" />
          导出报告
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={FileCheck} label="巡检总数" value={summary?.total_inspections ?? 0} color="bg-cyber-500/10 text-cyber-400" />
        <StatCard icon={AlertTriangle} label="缺陷总数" value={summary?.total_defects ?? 0} color="bg-warn-500/10 text-warn-400" />
        <StatCard icon={Activity} label="缺陷率" value={`${((summary?.defect_rate ?? 0) * 100).toFixed(1)}%`} color="bg-danger-500/10 text-danger-400" />
        <StatCard icon={TrendingUp} label="严重缺陷" value={summary?.severity_distribution?.critical ?? 0} sub="需优先处理" color="bg-yellow-500/10 text-yellow-400" />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">缺陷类型分布</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                {pieData.map((_, i) => (
                  <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {pieData.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-300">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[i % TYPE_COLORS.length] }} />
                {d.name}
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">缺陷数量统计</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="数量" radius={[4, 4, 0, 0]}>
                {barData.map((_, i) => (
                  <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">严重程度分布</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={severityData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                {severityData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {severityData.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-300">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200">缺陷趋势</h3>
          <div className="flex gap-1">
            {(["day", "week", "month"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                  granularity === g ? "bg-cyber-500/10 text-cyber-400 border border-cyber-500/20" : "text-navy-600 hover:text-slate-300"
                }`}
              >
                {g === "day" ? "日" : g === "week" ? "周" : "月"}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06D6A0" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#06D6A0" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} />
            <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={{ stroke: "#334155" }} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="count" name="缺陷数" stroke="#06D6A0" strokeWidth={2} fill="url(#areaGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

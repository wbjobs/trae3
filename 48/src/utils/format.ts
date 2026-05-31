export function severityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "text-danger-500 bg-danger-500/10 border-danger-500/30"
    case "high":
      return "text-warn-500 bg-warn-500/10 border-warn-500/30"
    case "medium":
      return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"
    case "low":
      return "text-safe-500 bg-safe-500/10 border-safe-500/30"
    default:
      return "text-slate-400 bg-slate-400/10 border-slate-400/30"
  }
}

export function severityLabel(severity: string): string {
  switch (severity) {
    case "critical":
      return "严重"
    case "high":
      return "较高"
    case "medium":
      return "中等"
    case "low":
      return "轻微"
    default:
      return severity
  }
}

export function defectTypeName(code: string): string {
  const map: Record<string, string> = {
    CRACK: "裂纹",
    RUST: "锈蚀",
    DEFORM: "变形",
    MISSING: "缺失",
    LEAK: "渗漏",
    WEAR: "磨损",
    LOOSE: "松动",
    ABNORMAL: "异响",
  }
  return map[code] || code
}

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

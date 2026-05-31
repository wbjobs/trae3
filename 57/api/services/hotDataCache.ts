interface HotDataPoint {
  timestamp: string
  values: Record<string, number | null>
}

class HotDataStore {
  private data: Map<string, HotDataPoint[]>
  private maxAge: number

  constructor() {
    this.data = new Map()
    this.maxAge = 24 * 3600 * 1000
  }

  add(stationId: string, timestamp: string, values: Record<string, number | null>): void {
    if (!this.data.has(stationId)) {
      this.data.set(stationId, [])
    }
    const arr = this.data.get(stationId)!
    arr.push({ timestamp, values })
    this.evictOld(stationId)
  }

  private evictOld(stationId: string): void {
    const arr = this.data.get(stationId)
    if (!arr) return
    const cutoff = Date.now() - this.maxAge
    while (arr.length > 0) {
      const ts = new Date(arr[0].timestamp.replace(' ', 'T')).getTime()
      if (ts < cutoff) {
        arr.shift()
      } else {
        break
      }
    }
  }

  getLatest(stationId: string, count: number): HotDataPoint[] {
    const arr = this.data.get(stationId)
    if (!arr) return []
    return arr.slice(-count)
  }

  getRange(stationId: string, startTime: string, endTime: string): HotDataPoint[] {
    const arr = this.data.get(stationId)
    if (!arr) return []
    const start = new Date(startTime.replace(' ', 'T')).getTime()
    const end = new Date(endTime.replace(' ', 'T')).getTime()
    return arr.filter(p => {
      const ts = new Date(p.timestamp.replace(' ', 'T')).getTime()
      return ts >= start && ts <= end
    })
  }

  getAllLatest(count: number): Array<{ stationId: string; data: HotDataPoint[] }> {
    const result: Array<{ stationId: string; data: HotDataPoint[] }> = []
    for (const [stationId, arr] of this.data) {
      result.push({ stationId, data: arr.slice(-count) })
    }
    return result
  }

  hasDataInRange(stationId: string, startTime: string): boolean {
    const arr = this.data.get(stationId)
    if (!arr || arr.length === 0) return false
    const start = new Date(startTime.replace(' ', 'T')).getTime()
    const cutoff = Date.now() - this.maxAge
    return start >= cutoff
  }

  stats(): { stationCount: number; totalPoints: number; memoryEstimateMB: number } {
    let totalPoints = 0
    for (const arr of this.data.values()) {
      totalPoints += arr.length
    }
    const avgPointSize = 120
    const memoryEstimateMB = Math.round((totalPoints * avgPointSize) / (1024 * 1024) * 100) / 100
    return {
      stationCount: this.data.size,
      totalPoints,
      memoryEstimateMB,
    }
  }
}

export const hotDataStore = new HotDataStore()

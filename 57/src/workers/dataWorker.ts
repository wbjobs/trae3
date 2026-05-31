interface ProcessQueryDataMessage {
  type: 'processQueryData'
  data: Array<{
    stationId: string
    timestamp: string
    values: Record<string, number | null>
  }>
}

self.addEventListener('message', (e: MessageEvent<ProcessQueryDataMessage>) => {
  const { type, data } = e.data

  if (type !== 'processQueryData') return

  const sorted = [...data].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const filled: typeof sorted = []
  for (let i = 0; i < sorted.length; i++) {
    filled.push(sorted[i])

    if (i < sorted.length - 1) {
      const current = new Date(sorted[i].timestamp).getTime()
      const next = new Date(sorted[i + 1].timestamp).getTime()
      const gap = next - current
      const interval = gap > 0 ? gap / Math.round(gap / 3600000) : 3600000

      if (gap > interval * 1.5) {
        const steps = Math.floor(gap / interval) - 1
        for (let j = 1; j <= steps; j++) {
          const ts = new Date(current + j * interval)
          filled.push({
            stationId: sorted[i].stationId,
            timestamp: ts.toISOString(),
            values: Object.fromEntries(
              Object.keys(sorted[i].values).map((k) => [k, null])
            ),
          })
        }
      }
    }
  }

  const derived = filled.map((point) => {
    const values = { ...point.values }
    const waterLevel = values.waterLevel
    const flowRate = values.flowRate
    const rainfall = values.rainfall

    if (waterLevel != null && flowRate != null && waterLevel > 0) {
      values._dischargePerMeter = flowRate / waterLevel
    }
    if (rainfall != null) {
      values._rainfallAccum = rainfall
    }

    return {
      ...point,
      values,
    }
  })

  self.postMessage({ type: 'processQueryData', data: derived })
})
